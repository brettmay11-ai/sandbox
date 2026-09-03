const SPORTS_DATA_KEY = process.env.SPORTSDATA_IO_KEY || process.env.SPORTSDATA_API_KEY || 'ec29dd369c2544a980efca06d3e5b4ad';
const BASE_URL = 'https://api.sportsdata.io/v3';
const NFL_TEAMS = new Set(['ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAX','KC','LV','LAC','LAR','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SF','SEA','TB','TEN','WAS']);
const NEWS_CACHE_TTL_SECONDS = 24 * 60 * 60;
const inFlightRequests = new Map();

async function initSportsDataCache(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS sportsdata_cache(
    cache_key TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS sportsdata_usage(
    id BIGSERIAL PRIMARY KEY,
    sport VARCHAR(12) NOT NULL,
    api_path TEXT NOT NULL,
    provider VARCHAR(20) NOT NULL DEFAULT 'sportsdata',
    cache_key TEXT NOT NULL,
    status_code INTEGER,
    succeeded BOOLEAN NOT NULL DEFAULT FALSE,
    duration_ms INTEGER,
    error_message TEXT,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );ALTER TABLE sportsdata_usage ADD COLUMN IF NOT EXISTS provider VARCHAR(20) NOT NULL DEFAULT 'sportsdata';CREATE INDEX IF NOT EXISTS sportsdata_usage_requested_idx ON sportsdata_usage(requested_at DESC);CREATE INDEX IF NOT EXISTS sportsdata_usage_endpoint_idx ON sportsdata_usage(sport,api_path,requested_at DESC)`);
}

function seasonValue(value) {
  const season = Number(value);
  return Number.isInteger(season) && season >= 2000 && season <= 2100 ? season : null;
}

function teamValue(value, allowedTeams) {
  const team = String(value || '').toUpperCase();
  return allowedTeams.has(team) ? team : null;
}

function routeToSportsData(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'api' || parts[1] !== 'sportsdata') return null;
  const sport = parts[2];
  if (sport !== 'nfl') return { error:'Unknown sports feed.' };

  if (sport === 'nfl') {
    if (parts[3] === 'schedule') {
      const season = seasonValue(parts[4]);
      if (!season) return { error:'Choose a valid NFL season.' };
      return { sport, apiPath:`scores/json/Schedules/${season}`, ttlSeconds:24 * 60 * 60 };
    }
    if (parts[3] === 'standings') {
      const season = seasonValue(parts[4]);
      if (!season) return { error:'Choose a valid NFL season.' };
      return { sport, apiPath:`scores/json/Standings/${season}`, ttlSeconds:24 * 60 * 60 };
    }
    if (parts[3] === 'current-season') {
      return { sport, apiPath:'scores/json/CurrentSeason', ttlSeconds:24 * 60 * 60 };
    }
    if (parts[3] === 'player-season-stats') {
      const season = seasonValue(parts[4]);
      if (!season) return { error:'Choose a valid NFL season.' };
      return { sport, apiPath:`stats/json/PlayerSeasonStats/${season}`, ttlSeconds:24 * 60 * 60 };
    }
    if (parts[3] === 'player-season-stats-by-team') {
      const season = seasonValue(parts[4]), team = teamValue(parts[5], NFL_TEAMS);
      if (!season || !team) return { error:'Choose a valid NFL season and team.' };
      return { sport, apiPath:`stats/json/PlayerSeasonStatsByTeam/${season}/${team}`, ttlSeconds:24 * 60 * 60 };
    }
    if (parts[3] === 'news' && parts[4] === 'team') {
      const team = teamValue(parts[5], NFL_TEAMS);
      if (!team) return { error:'Choose a valid NFL team.' };
      // Keep legacy callers on the single league-wide news cache.
      return { sport, apiPath:'news-rotoballer/json/RotoBallerPremiumNews', ttlSeconds:NEWS_CACHE_TTL_SECONDS };
    }
    if (parts[3] === 'news') {
      return { sport, apiPath:'news-rotoballer/json/RotoBallerPremiumNews', ttlSeconds:NEWS_CACHE_TTL_SECONDS };
    }
  }

  return { error:'SportsData endpoint not found.' };
}

async function fetchSportsData(sport, apiPath) {
  if (!SPORTS_DATA_KEY) throw new Error('SportsData API key is not configured.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const separator = apiPath.includes('?') ? '&' : '?';
    const response = await fetch(`${BASE_URL}/${sport}/${apiPath}${separator}key=${SPORTS_DATA_KEY}`, { signal:controller.signal });
    if (!response.ok) {
      const error = new Error(`SportsData returned ${response.status}`);
      error.statusCode = response.status;
      throw error;
    }
    return { data:await response.json(), statusCode:response.status };
  } finally {
    clearTimeout(timeout);
  }
}

async function cachedSportsData(pool, route) {
  const cacheKey = `sportsdata:${route.sport}:${route.apiPath}`;
  const cached = await pool.query('SELECT data,fetched_at,expires_at FROM sportsdata_cache WHERE cache_key=$1', [cacheKey]);
  const row = cached.rows[0];
  if (row && new Date(row.expires_at).getTime() > Date.now()) return row.data;

  // Share one refresh promise across simultaneous page loads after expiry.
  if (inFlightRequests.has(cacheKey)) return inFlightRequests.get(cacheKey);
  const refresh = refreshSportsDataCache(pool, route, cacheKey, row);
  inFlightRequests.set(cacheKey, refresh);
  try {
    return await refresh;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

async function refreshSportsDataCache(pool, route, cacheKey, staleRow) {
  // Re-check after another request may have refreshed the cache before this one acquired the guard.
  const latest = await pool.query('SELECT data,expires_at FROM sportsdata_cache WHERE cache_key=$1', [cacheKey]);
  const latestRow = latest.rows[0];
  if (latestRow && new Date(latestRow.expires_at).getTime() > Date.now()) return latestRow.data;

  const requestedAt=Date.now();
  let externalCallCompleted=false;
  try {
    const result = await fetchSportsData(route.sport, route.apiPath);
    externalCallCompleted=true;
    await recordSportsDataCall(pool,route,{statusCode:result.statusCode,succeeded:true,durationMs:Date.now()-requestedAt});
    await pool.query(
      `INSERT INTO sportsdata_cache(cache_key,data,expires_at)
       VALUES($1,$2,NOW()+($3 || ' seconds')::interval)
       ON CONFLICT(cache_key) DO UPDATE SET data=EXCLUDED.data,fetched_at=NOW(),expires_at=EXCLUDED.expires_at`,
      [cacheKey, JSON.stringify(result.data), route.ttlSeconds]
    );
    return result.data;
  } catch (error) {
    if(!externalCallCompleted) await recordSportsDataCall(pool,route,{statusCode:error.statusCode||null,succeeded:false,durationMs:Date.now()-requestedAt,errorMessage:error.message});
    if (staleRow || latestRow) {
      console.warn(`Serving stale SportsData cache for ${cacheKey}.`, error);
      return (latestRow || staleRow).data;
    }
    throw error;
  }
}

async function recordSportsDataCall(pool,route,details) {
  try {
    const provider = details.provider || 'sportsdata';
    const apiPath = route.apiPath;
    await pool.query(`INSERT INTO sportsdata_usage(sport,api_path,provider,cache_key,status_code,succeeded,duration_ms,error_message) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[
      route.sport,apiPath,provider,`sportsdata:${route.sport}:${route.apiPath}`,details.statusCode||null,Boolean(details.succeeded),details.durationMs||null,details.errorMessage||null
    ]);
  } catch(error) {
    console.warn('SportsData usage log write failed.',error);
  }
}

async function handleSportsData({ pool, req, res, path, user, sendJson }) {
  if (!path.startsWith('/api/sportsdata/')) return false;
  if (!user) return sendJson(res, 401, { error:'Please sign in.' }), true;
  if (req.method !== 'GET') return sendJson(res, 405, { error:'Method not allowed.' }), true;

  const route = routeToSportsData(path);
  if (!route || route.error) return sendJson(res, 404, { error:route?.error || 'SportsData endpoint not found.' }), true;

  try {
    return sendJson(res, 200, await cachedSportsData(pool, route)), true;
  } catch (error) {
    console.error('SportsData cache request failed.', error);
    return sendJson(res, 502, { error:'Sports data is temporarily unavailable.' }), true;
  }
}

module.exports = { initSportsDataCache, handleSportsData };
