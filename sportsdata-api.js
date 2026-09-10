const BASE_URL = 'https://api.sportsdata.io/v3/nfl';
const NFL_TEAMS = new Set(['ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAX','KC','LV','LAC','LAR','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SF','SEA','TB','TEN','WAS']);
const DAILY_LIMIT = 5;
const cacheKeyFor = route => `sportsdata:nfl:${route.apiPath}`;

async function initSportsDataCache(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS sportsdata_cache(
    cache_key TEXT PRIMARY KEY,data JSONB NOT NULL,fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),expires_at TIMESTAMPTZ NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sportsdata_usage(
    id BIGSERIAL PRIMARY KEY,sport VARCHAR(12) NOT NULL,api_path TEXT NOT NULL,
    provider VARCHAR(20) NOT NULL DEFAULT 'sportsdata',cache_key TEXT NOT NULL,status_code INTEGER,
    succeeded BOOLEAN NOT NULL DEFAULT FALSE,duration_ms INTEGER,error_message TEXT,requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE sportsdata_usage ADD COLUMN IF NOT EXISTS provider VARCHAR(20) NOT NULL DEFAULT 'sportsdata';
  CREATE INDEX IF NOT EXISTS sportsdata_usage_requested_idx ON sportsdata_usage(requested_at DESC);
  CREATE TABLE IF NOT EXISTS sportsdata_refresh_guard(cache_key TEXT PRIMARY KEY,next_attempt_at TIMESTAMPTZ NOT NULL);`);
}

function routeToSportsData(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'api' || parts[1] !== 'sportsdata' || parts[2] !== 'nfl') return null;
  const kind = parts[3];
  if (kind === 'current-season' && parts.length === 4) return { sport:'nfl', apiPath:'scores/json/CurrentSeason' };
  const season = Number(parts[4]);
  if (!Number.isInteger(season) || season < 2000 || season > 2100) return null;
  const regularSeason = `${season}REG`;
  const endpoints = {
    schedule:{ base:'scores/json/Schedules', season },
    standings:{ base:'scores/json/Standings', season:regularSeason },
    'player-season-stats':{ base:'stats/json/PlayerSeasonStats', season:regularSeason },
    'team-season-stats':{ base:'scores/json/TeamSeasonStats', season:regularSeason }
  };
  if (endpoints[kind] && parts.length === 5) return { sport:'nfl', season, apiPath:`${endpoints[kind].base}/${endpoints[kind].season}` };
  if (kind === 'player-season-stats-by-team' && parts.length === 6 && NFL_TEAMS.has(parts[5].toUpperCase())) {
    return { sport:'nfl', season, apiPath:`stats/json/PlayerSeasonStats/${regularSeason}`, team:parts[5].toUpperCase() };
  }
  // News is RSS-only. Old clients must never reactivate paid news endpoints.
  return null;
}

function scheduledRoutes(season) {
  return ['schedule','standings','player-season-stats','team-season-stats'].map(kind => routeToSportsData(`/api/sportsdata/nfl/${kind}/${season}`));
}

async function readCached(pool, route) {
  return (await pool.query('SELECT data,fetched_at,expires_at FROM sportsdata_cache WHERE cache_key=$1', [cacheKeyFor(route)])).rows[0] || null;
}

// Commit a reservation before contacting the provider so failed requests, crashes,
// restarts and multiple replicas all share the same durable rolling-day budget.
async function reserveRefresh(pool, route) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(73194021)');
    const key = cacheKeyFor(route);
    const cached = await readCached(client, route);
    const guard = (await client.query('SELECT next_attempt_at FROM sportsdata_refresh_guard WHERE cache_key=$1', [key])).rows[0];
    const used = Number((await client.query("SELECT COUNT(*)::int AS count FROM sportsdata_usage WHERE provider='sportsdata' AND requested_at>NOW()-INTERVAL '24 hours'")).rows[0].count);
    if ((cached && new Date(cached.expires_at).getTime() > Date.now()) ||
        (guard && new Date(guard.next_attempt_at).getTime() > Date.now()) || used >= DAILY_LIMIT) {
      await client.query('COMMIT');
      return null;
    }
    await client.query("INSERT INTO sportsdata_refresh_guard(cache_key,next_attempt_at) VALUES($1,NOW()+INTERVAL '24 hours') ON CONFLICT(cache_key) DO UPDATE SET next_attempt_at=EXCLUDED.next_attempt_at", [key]);
    const result = await client.query("INSERT INTO sportsdata_usage(sport,api_path,provider,cache_key,error_message) VALUES('nfl',$1,'sportsdata',$2,'Refresh reserved; completion pending') RETURNING id", [route.apiPath, key]);
    await client.query('COMMIT');
    return result.rows[0].id;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

async function refreshRoute(pool, route, fetcher = fetch) {
  const key = process.env.SPORTSDATA_IO_KEY || process.env.SPORTSDATA_API_KEY;
  if (!key) return;
  const reservation = await reserveRefresh(pool, route);
  if (!reservation) return;
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  let status = null;
  try {
    const response = await fetcher(`${BASE_URL}/${route.apiPath}`, { headers:{ 'Ocp-Apim-Subscription-Key':key }, signal:controller.signal });
    status = response.status;
    if (!response.ok) throw new Error(`SportsData returned ${status}`);
    const data = await response.json();
    if (route.apiPath.endsWith('CurrentSeason') ? !Number.isInteger(Number(data)) : !Array.isArray(data)) throw new Error('Unexpected sports data format');
    await pool.query(`INSERT INTO sportsdata_cache(cache_key,data,expires_at) VALUES($1,$2,NOW()+INTERVAL '24 hours')
      ON CONFLICT(cache_key) DO UPDATE SET data=EXCLUDED.data,fetched_at=NOW(),expires_at=EXCLUDED.expires_at`, [cacheKeyFor(route), JSON.stringify(data)]);
    await pool.query('UPDATE sportsdata_usage SET status_code=$2,succeeded=TRUE,duration_ms=$3,error_message=NULL WHERE id=$1', [reservation, status, Date.now()-start]);
  } catch (error) {
    await pool.query('UPDATE sportsdata_usage SET status_code=$2,duration_ms=$3,error_message=$4 WHERE id=$1', [reservation, status, Date.now()-start, String(error.message).slice(0,500)]);
    console.warn(`Scheduled sports refresh failed: ${route.apiPath}: ${error.message}`);
  } finally { clearTimeout(timeout); }
}

async function refreshScheduledData(pool, fetcher = fetch) {
  const current = routeToSportsData('/api/sportsdata/nfl/current-season');
  await refreshRoute(pool, current, fetcher);
  const seasonRow = await readCached(pool, current);
  const today = new Date();
  const season = Number(process.env.NFL_SEASON || seasonRow?.data || (today.getUTCMonth() < 2 ? today.getUTCFullYear()-1 : today.getUTCFullYear()));
  for (const route of scheduledRoutes(season)) await refreshRoute(pool, route, fetcher);
}

function startSportsDataRefresh(pool) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await refreshScheduledData(pool); }
    catch (error) { console.error('Scheduled sports refresh failed.', error.message); }
    finally { running = false; }
  };
  const timer = setInterval(run, 15 * 60 * 1000);
  timer.unref();
  void run();
  return timer;
}

async function sportsDataHealth(pool) {
  const used = Number((await pool.query("SELECT COUNT(*)::int AS count FROM sportsdata_usage WHERE provider='sportsdata' AND requested_at>NOW()-INTERVAL '24 hours'")).rows[0].count);
  return { limit:DAILY_LIMIT, used, remaining:Math.max(0, DAILY_LIMIT-used), window:'rolling 24 hours', refresh:'background only', configured:Boolean(process.env.SPORTSDATA_IO_KEY || process.env.SPORTSDATA_API_KEY) };
}

async function handleSportsData({ pool, req, res, path, user, sendJson }) {
  if (!path.startsWith('/api/sportsdata/')) return false;
  if (!user) return sendJson(res, 401, { error:'Please sign in.' }), true;
  if (req.method !== 'GET') return sendJson(res, 405, { error:'Method not allowed.' }), true;
  const route = routeToSportsData(path);
  if (!route) return sendJson(res, 404, { error:'Sports feed not found. News is available from /api/nfl-news/.' }), true;
  const row = await readCached(pool, route);
  if (!row) return sendJson(res, 503, { error:'This feed is waiting for its scheduled update.', status:'unavailable', season:route.season || null }), true;
  res.setHeader('X-Data-Source', 'SportsData.io');
  res.setHeader('X-Data-Status', new Date(row.expires_at).getTime() > Date.now() ? 'cached' : 'stale');
  res.setHeader('X-Data-Updated-At', new Date(row.fetched_at).toISOString());
  if (route.season) res.setHeader('X-Data-Season', String(route.season));
  const data = route.team ? (Array.isArray(row.data) ? row.data.filter(player => String(player.Team || player.TeamKey || '').toUpperCase() === route.team) : []) : row.data;
  sendJson(res, 200, data);
  return true;
}

module.exports = { initSportsDataCache, handleSportsData, startSportsDataRefresh, sportsDataHealth, routeToSportsData, scheduledRoutes, reserveRefresh, refreshScheduledData };
