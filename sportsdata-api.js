const BASE_URL = 'https://api.sportsdata.io/v3/nfl';
const NFL_TEAMS = new Set(['ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAX','KC','LV','LAC','LAR','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SF','SEA','TB','TEN','WAS']);
const DAILY_LIMIT = 5;
const cacheKeyFor = route => `sportsdata:nfl:${route.apiPath}`;
const activeUsageWhere = "provider='sportsdata' AND requested_at>NOW()-INTERVAL '24 hours' AND NOT (api_path ~ '^(scores/json/Standings|stats/json/PlayerSeasonStats|scores/json/TeamSeasonStats)/[0-9]{4}(REG)?$')";
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;

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
    'player-season-stats':{ base:'derived/json/PlayerSeasonStats', season, derived:true },
    'team-season-stats':{ base:'derived/json/TeamSeasonStats', season, derived:true }
  };
  if (endpoints[kind] && parts.length === 5) return { sport:'nfl', season, apiPath:`${endpoints[kind].base}/${endpoints[kind].season}`, derived:Boolean(endpoints[kind].derived) };
  if (kind === 'player-season-stats-by-team' && parts.length === 6 && NFL_TEAMS.has(parts[5].toUpperCase())) {
    return { sport:'nfl', season, apiPath:`derived/json/PlayerSeasonStats/${season}`, derived:true, team:parts[5].toUpperCase() };
  }
  // News is RSS-only. Old clients must never reactivate paid news endpoints.
  return null;
}

function scheduledRoutes(season) {
  return ['schedule','standings'].map(kind => routeToSportsData(`/api/sportsdata/nfl/${kind}/${season}`));
}

function seasonStatRoutes(season) {
  const token = `${season}REG`;
  return [
    { sport:'nfl', season, apiPath:`stats/json/PlayerSeasonStats/${token}` },
    { sport:'nfl', season, apiPath:`scores/json/TeamSeasonStats/${token}` }
  ];
}

function boxScoreRoutes(season, week, isComplete = false) {
  const token = `${season}REG`;
  const ttlHours = isComplete ? 24 * 365 : 24;
  return [{ sport:'nfl', season, week, apiPath:`stats/json/BoxScoresFinal/${token}/${week}`, ttlHours }];
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
    const used = Number((await client.query(`SELECT COUNT(*)::int AS count FROM sportsdata_usage WHERE ${activeUsageWhere}`)).rows[0].count);
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
    const ttlHours = Number.isFinite(Number(route.ttlHours)) ? Math.max(1, Number(route.ttlHours)) : 24;
    await pool.query(`INSERT INTO sportsdata_cache(cache_key,data,expires_at) VALUES($1,$2,NOW()+($3::text || ' hours')::interval)
      ON CONFLICT(cache_key) DO UPDATE SET data=EXCLUDED.data,fetched_at=NOW(),expires_at=EXCLUDED.expires_at`, [cacheKeyFor(route), JSON.stringify(data), ttlHours]);
    await pool.query('UPDATE sportsdata_usage SET status_code=$2,succeeded=TRUE,duration_ms=$3,error_message=NULL WHERE id=$1', [reservation, status, Date.now()-start]);
  } catch (error) {
    await pool.query('UPDATE sportsdata_usage SET status_code=$2,duration_ms=$3,error_message=$4 WHERE id=$1', [reservation, status, Date.now()-start, String(error.message).slice(0,500)]);
    console.warn(`Scheduled sports refresh failed: ${route.apiPath}: ${error.message}`);
  } finally { clearTimeout(timeout); }
}

function weekStatRoutes(season, week, isComplete = false) {
  const token = `${season}REG`;
  const ttlHours = isComplete ? 24 * 365 : 24;
  return [
    { sport:'nfl', season, week, apiPath:`scores/json/TeamGameStats/${token}/${week}`, ttlHours },
    { sport:'nfl', season, week, apiPath:`stats/json/PlayerGameStatsByWeek/${token}/${week}`, ttlHours }
  ];
}

function gameTime(game) {
  const raw = game?.DateTimeUTC || game?.Date;
  if (!raw) return null;
  const date = new Date(/(?:Z|[+-]\d\d:\d\d)$/i.test(raw) ? raw : `${raw}Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function completedWeekInfo(games, now = new Date()) {
  const regularGames = (Array.isArray(games) ? games : []).filter(game => Number(game.Week) >= 1 && Number(game.Week) <= 18 && (!game.SeasonType || Number(game.SeasonType) === 1));
  const started = regularGames.filter(game => {
    const status = String(game.Status || '').toLowerCase();
    const when = gameTime(game);
    return status.includes('final') || status.includes('inprogress') || status.includes('in progress') || (when && when <= now);
  });
  const currentWeek = Math.max(1, ...started.map(game => Number(game.Week)).filter(Number.isFinite));
  const weekGames = regularGames.filter(game => Number(game.Week) === currentWeek);
  const complete = weekGames.length > 0 && weekGames.every(game => String(game.Status || '').toLowerCase().includes('final') || game.IsOver === true);
  return { currentWeek, complete };
}

function addNumber(target, source, fields) {
  for (const field of fields) target[field] = number(target[field]) + number(source[field]);
}

function aggregateTeamStats(rows) {
  const fields = ['Score','OffensiveYards','PassingYards','RushingYards','OpponentScore','OpponentOffensiveYards','OpponentPassingYards','OpponentRushingYards','Sacks','InterceptionReturns'];
  const teams = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const team = String(row.Team || row.TeamKey || '').toUpperCase();
    if (!NFL_TEAMS.has(team)) continue;
    if (!teams.has(team)) teams.set(team, { Team:team, Games:0 });
    const target = teams.get(team);
    target.Games += Math.max(1, number(row.Games) || 1);
    addNumber(target, row, fields);
  }
  return [...teams.values()];
}

function aggregatePlayerStats(rows) {
  const sumFields = [
    'PassingCompletions','PassingAttempts','PassingYards','PassingTouchdowns','PassingInterceptions',
    'RushingAttempts','RushingYards','RushingTouchdowns','Fumbles',
    'Receptions','ReceivingTargets','ReceivingYards','ReceivingTouchdowns',
    'SoloTackles','AssistedTackles','Tackles','Sacks','Interceptions','FumblesForced','PassesDefended','DefensiveTouchdowns'
  ];
  const players = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const team = String(row.Team || row.TeamKey || '').toUpperCase();
    if (!NFL_TEAMS.has(team)) continue;
    const name = row.Name || row.PlayerName || [row.FirstName,row.LastName].filter(Boolean).join(' ');
    if (!name) continue;
    const key = row.PlayerID || row.PlayerId || `${team}:${name}`;
    if (!players.has(key)) players.set(key, { PlayerID:row.PlayerID || row.PlayerId || null, Team:team, Name:name, Position:row.Position || row.FantasyPosition || '' });
    const target = players.get(key);
    addNumber(target, row, sumFields);
    target.RushingLong = Math.max(number(target.RushingLong), number(row.RushingLong));
    target.ReceivingLong = Math.max(number(target.ReceivingLong), number(row.ReceivingLong));
  }
  for (const player of players.values()) {
    player.RushingYardsPerAttempt = number(player.RushingAttempts) ? Number((number(player.RushingYards) / number(player.RushingAttempts)).toFixed(1)) : 0;
    player.ReceivingYardsPerReception = number(player.Receptions) ? Number((number(player.ReceivingYards) / number(player.Receptions)).toFixed(1)) : 0;
    player.Tackles = number(player.Tackles) || number(player.SoloTackles) + number(player.AssistedTackles);
    player.PassingRating = null;
  }
  return [...players.values()];
}

function boxScoreRows(boxScores) {
  const teamRows = [];
  const playerRows = [];
  for (const box of Array.isArray(boxScores) ? boxScores : []) {
    if (Array.isArray(box?.TeamGames)) teamRows.push(...box.TeamGames);
    if (Array.isArray(box?.PlayerGames)) playerRows.push(...box.PlayerGames);
  }
  return { teamRows, playerRows };
}

async function rebuildDerivedStatsFromBoxScores(pool, season, throughWeek) {
  const teamRows = [];
  const playerRows = [];
  for (let week = 1; week <= throughWeek; week++) {
    const [boxRoute] = boxScoreRoutes(season, week, true);
    const boxCache = await readCached(pool, boxRoute);
    const rows = boxScoreRows(boxCache?.data);
    teamRows.push(...rows.teamRows);
    playerRows.push(...rows.playerRows);
  }
  if (teamRows.length) {
    await pool.query(`INSERT INTO sportsdata_cache(cache_key,data,expires_at) VALUES($1,$2,NOW()+INTERVAL '24 hours')
      ON CONFLICT(cache_key) DO UPDATE SET data=EXCLUDED.data,fetched_at=NOW(),expires_at=EXCLUDED.expires_at`, [`sportsdata:nfl:derived/json/TeamSeasonStats/${season}`, JSON.stringify(aggregateTeamStats(teamRows))]);
  }
  if (playerRows.length) {
    await pool.query(`INSERT INTO sportsdata_cache(cache_key,data,expires_at) VALUES($1,$2,NOW()+INTERVAL '24 hours')
      ON CONFLICT(cache_key) DO UPDATE SET data=EXCLUDED.data,fetched_at=NOW(),expires_at=EXCLUDED.expires_at`, [`sportsdata:nfl:derived/json/PlayerSeasonStats/${season}`, JSON.stringify(aggregatePlayerStats(playerRows))]);
  }
}

async function rebuildDerivedStats(pool, season, throughWeek) {
  const teamRows = [];
  const playerRows = [];
  for (let week = 1; week <= throughWeek; week++) {
    const [teamRoute, playerRoute] = weekStatRoutes(season, week, true);
    const teamCache = await readCached(pool, teamRoute);
    const playerCache = await readCached(pool, playerRoute);
    if (Array.isArray(teamCache?.data)) teamRows.push(...teamCache.data);
    if (Array.isArray(playerCache?.data)) playerRows.push(...playerCache.data);
  }
  if (teamRows.length) {
    await pool.query(`INSERT INTO sportsdata_cache(cache_key,data,expires_at) VALUES($1,$2,NOW()+INTERVAL '24 hours')
      ON CONFLICT(cache_key) DO UPDATE SET data=EXCLUDED.data,fetched_at=NOW(),expires_at=EXCLUDED.expires_at`, [`sportsdata:nfl:derived/json/TeamSeasonStats/${season}`, JSON.stringify(aggregateTeamStats(teamRows))]);
  }
  if (playerRows.length) {
    await pool.query(`INSERT INTO sportsdata_cache(cache_key,data,expires_at) VALUES($1,$2,NOW()+INTERVAL '24 hours')
      ON CONFLICT(cache_key) DO UPDATE SET data=EXCLUDED.data,fetched_at=NOW(),expires_at=EXCLUDED.expires_at`, [`sportsdata:nfl:derived/json/PlayerSeasonStats/${season}`, JSON.stringify(aggregatePlayerStats(playerRows))]);
  }
}

async function rebuildDerivedStatsFromSeasonFeeds(pool, season) {
  const [playerRoute, teamRoute] = seasonStatRoutes(season);
  const playerCache = await readCached(pool, playerRoute);
  const teamCache = await readCached(pool, teamRoute);
  if (Array.isArray(teamCache?.data)) {
    await pool.query(`INSERT INTO sportsdata_cache(cache_key,data,expires_at) VALUES($1,$2,NOW()+INTERVAL '24 hours')
      ON CONFLICT(cache_key) DO UPDATE SET data=EXCLUDED.data,fetched_at=NOW(),expires_at=EXCLUDED.expires_at`, [`sportsdata:nfl:derived/json/TeamSeasonStats/${season}`, JSON.stringify(aggregateTeamStats(teamCache.data))]);
  }
  if (Array.isArray(playerCache?.data)) {
    await pool.query(`INSERT INTO sportsdata_cache(cache_key,data,expires_at) VALUES($1,$2,NOW()+INTERVAL '24 hours')
      ON CONFLICT(cache_key) DO UPDATE SET data=EXCLUDED.data,fetched_at=NOW(),expires_at=EXCLUDED.expires_at`, [`sportsdata:nfl:derived/json/PlayerSeasonStats/${season}`, JSON.stringify(aggregatePlayerStats(playerCache.data))]);
  }
}

async function refreshScheduledData(pool, fetcher = fetch) {
  const current = routeToSportsData('/api/sportsdata/nfl/current-season');
  await refreshRoute(pool, current, fetcher);
  const seasonRow = await readCached(pool, current);
  const today = new Date();
  const season = Number(process.env.NFL_SEASON || seasonRow?.data || (today.getUTCMonth() < 2 ? today.getUTCFullYear()-1 : today.getUTCFullYear()));
  for (const route of scheduledRoutes(season)) await refreshRoute(pool, route, fetcher);
  const scheduleRow = await readCached(pool, routeToSportsData(`/api/sportsdata/nfl/schedule/${season}`));
  const { currentWeek, complete } = completedWeekInfo(scheduleRow?.data || [], today);
  for (let week = 1; week <= currentWeek; week++) {
    const isComplete = week < currentWeek || complete;
    for (const route of boxScoreRoutes(season, week, isComplete)) await refreshRoute(pool, route, fetcher);
  }
  await rebuildDerivedStatsFromBoxScores(pool, season, currentWeek);
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
  const used = Number((await pool.query(`SELECT COUNT(*)::int AS count FROM sportsdata_usage WHERE ${activeUsageWhere}`)).rows[0].count);
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

module.exports = { initSportsDataCache, handleSportsData, startSportsDataRefresh, sportsDataHealth, routeToSportsData, scheduledRoutes, seasonStatRoutes, boxScoreRoutes, reserveRefresh, refreshScheduledData, aggregateTeamStats, aggregatePlayerStats, weekStatRoutes, completedWeekInfo, boxScoreRows, rebuildDerivedStatsFromSeasonFeeds, rebuildDerivedStatsFromBoxScores };
