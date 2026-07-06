const SPORTS_DATA_KEY = process.env.SPORTSDATA_IO_KEY || process.env.SPORTSDATA_API_KEY || 'ec29dd369c2544a980efca06d3e5b4ad';
const BASE_URL = 'https://api.sportsdata.io/v3';
const NFL_TEAMS = new Set(['ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAX','KC','LV','LAC','LAR','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SF','SEA','TB','TEN','WAS']);
const CFB_TEAMS = new Set(['TCU']);

async function initSportsDataCache(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS sportsdata_cache(
    cache_key TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
  )`);
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
  if (!['nfl', 'cfb'].includes(sport)) return { error:'Unknown sports feed.' };

  if (sport === 'nfl') {
    if (parts[3] === 'schedule') {
      const season = seasonValue(parts[4]);
      if (!season) return { error:'Choose a valid NFL season.' };
      return { sport, apiPath:`scores/json/Schedules/${season}`, ttlSeconds:24 * 60 * 60 };
    }
    if (parts[3] === 'current-season') {
      return { sport, apiPath:'scores/json/CurrentSeason', ttlSeconds:24 * 60 * 60 };
    }
    if (parts[3] === 'player-season-stats-by-team') {
      const season = seasonValue(parts[4]), team = teamValue(parts[5], NFL_TEAMS);
      if (!season || !team) return { error:'Choose a valid NFL season and team.' };
      return { sport, apiPath:`stats/json/PlayerSeasonStatsByTeam/${season}/${team}`, ttlSeconds:6 * 60 * 60 };
    }
    if (parts[3] === 'news' && parts[4] === 'team') {
      const team = teamValue(parts[5], NFL_TEAMS);
      if (!team) return { error:'Choose a valid NFL team.' };
      return { sport, apiPath:`news-rotoballer/json/RotoBallerPremiumNewsByTeam/${team}`, ttlSeconds:6 * 60 * 60 };
    }
    if (parts[3] === 'news') {
      return { sport, apiPath:'news-rotoballer/json/RotoBallerPremiumNews', ttlSeconds:6 * 60 * 60 };
    }
  }

  if (sport === 'cfb') {
    if (parts[3] === 'current-season') {
      return { sport, apiPath:'scores/json/CurrentSeason', ttlSeconds:24 * 60 * 60 };
    }
    if (parts[3] === 'teams') {
      return { sport, apiPath:'scores/json/Teams', ttlSeconds:24 * 60 * 60 };
    }
    if (parts[3] === 'team') {
      const team = teamValue(parts[4], CFB_TEAMS);
      if (!team) return { error:'Choose a valid CFB team.' };
      return { sport, apiPath:`scores/json/Team/${team}`, ttlSeconds:24 * 60 * 60 };
    }
    if (parts[3] === 'games') {
      const season = seasonValue(parts[4]);
      if (!season) return { error:'Choose a valid CFB season.' };
      return { sport, apiPath:`scores/json/Games/${season}`, ttlSeconds:24 * 60 * 60 };
    }
    if (parts[3] === 'player-season-stats-by-team') {
      const season = seasonValue(parts[4]), team = teamValue(parts[5], CFB_TEAMS);
      if (!season || !team) return { error:'Choose a valid CFB season and team.' };
      return { sport, apiPath:`stats/json/PlayerSeasonStatsByTeam/${season}/${team}`, ttlSeconds:6 * 60 * 60 };
    }
    if (parts[3] === 'team-season-stats') {
      const season = seasonValue(parts[4]);
      if (!season) return { error:'Choose a valid CFB season.' };
      return { sport, apiPath:`stats/json/TeamSeasonStats/${season}`, ttlSeconds:6 * 60 * 60 };
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
    if (!response.ok) throw new Error(`SportsData returned ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function cachedSportsData(pool, route) {
  const cacheKey = `sportsdata:${route.sport}:${route.apiPath}`;
  const cached = await pool.query('SELECT data,expires_at FROM sportsdata_cache WHERE cache_key=$1', [cacheKey]);
  const row = cached.rows[0];
  if (row && new Date(row.expires_at).getTime() > Date.now()) return row.data;

  try {
    const data = await fetchSportsData(route.sport, route.apiPath);
    await pool.query(
      `INSERT INTO sportsdata_cache(cache_key,data,expires_at)
       VALUES($1,$2,NOW()+($3 || ' seconds')::interval)
       ON CONFLICT(cache_key) DO UPDATE SET data=EXCLUDED.data,fetched_at=NOW(),expires_at=EXCLUDED.expires_at`,
      [cacheKey, JSON.stringify(data), route.ttlSeconds]
    );
    return data;
  } catch (error) {
    if (row) {
      console.warn(`Serving stale SportsData cache for ${cacheKey}.`, error);
      return row.data;
    }
    throw error;
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
