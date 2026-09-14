const BASE_URL = 'https://api.sportsdata.io/v3/nfl';
const NFLVERSE_BASE = 'https://github.com/nflverse/nflverse-data/releases/download';
const NFL_TEAMS = new Set(['ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAX','KC','LV','LAC','LAR','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SF','SEA','TB','TEN','WAS']);
const TEAM_ALIASES = { JAC:'JAX', LA:'LAR', WSH:'WAS' };
const TEAM_DIVISIONS = {
  BUF:'AFC East', MIA:'AFC East', NE:'AFC East', NYJ:'AFC East',
  BAL:'AFC North', CIN:'AFC North', CLE:'AFC North', PIT:'AFC North',
  HOU:'AFC South', IND:'AFC South', JAX:'AFC South', TEN:'AFC South',
  DEN:'AFC West', KC:'AFC West', LV:'AFC West', LAC:'AFC West',
  DAL:'NFC East', NYG:'NFC East', PHI:'NFC East', WAS:'NFC East',
  CHI:'NFC North', DET:'NFC North', GB:'NFC North', MIN:'NFC North',
  ATL:'NFC South', CAR:'NFC South', NO:'NFC South', TB:'NFC South',
  ARI:'NFC West', LAR:'NFC West', SEA:'NFC West', SF:'NFC West'
};
const TEAM_CONFERENCES = Object.fromEntries(Object.entries(TEAM_DIVISIONS).map(([team, division]) => [team, division.slice(0, 3)]));
const DAILY_LIMIT = 5;
const cacheKeyFor = route => `sportsdata:nfl:${route.apiPath}`;
const activeUsageWhere = "provider='sportsdata' AND requested_at>NOW()-INTERVAL '24 hours' AND NOT (api_path ~ '^(scores/json/Standings|stats/json/PlayerSeasonStats|scores/json/TeamSeasonStats)/[0-9]{4}(REG)?$')";
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const teamCode = value => TEAM_ALIASES[String(value || '').toUpperCase()] || String(value || '').toUpperCase();
const nflverseTtlHours = () => Math.max(1, Number(process.env.NFLVERSE_TTL_HOURS || 2));

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
    'team-season-stats':{ base:'derived/json/TeamSeasonStats', season, derived:true },
    'game-stats':{ base:'derived/json/GameStats', season, derived:true }
  };
  if (endpoints[kind] && parts.length === 5) return { sport:'nfl', season, apiPath:`${endpoints[kind].base}/${endpoints[kind].season}`, derived:Boolean(endpoints[kind].derived) };
  if (kind === 'game-stats' && parts.length === 6 && /^[a-z0-9_-]{6,40}$/i.test(parts[5])) {
    return { sport:'nfl', season, apiPath:`derived/json/GameStats/${season}`, derived:true, gameKey:parts[5] };
  }
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

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < String(text || '').length; i++) {
    const char = text[i], next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (char !== '\r') cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift() || [];
  return rows.filter(values => values.some(Boolean)).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

async function fetchCsv(url, fetcher = fetch) {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`nflverse returned ${response.status} for ${url.split('/').slice(-1)[0]}`);
  return parseCsv(await response.text());
}

async function writeCache(pool, route, data, ttlHours = 24) {
  await pool.query(`INSERT INTO sportsdata_cache(cache_key,data,expires_at) VALUES($1,$2,NOW()+($3::text || ' hours')::interval)
    ON CONFLICT(cache_key) DO UPDATE SET data=EXCLUDED.data,fetched_at=NOW(),expires_at=EXCLUDED.expires_at`, [cacheKeyFor(route), JSON.stringify(data), ttlHours]);
}

async function logProviderRefresh(pool, provider, route, statusCode, succeeded, durationMs, errorMessage = null) {
  await pool.query("INSERT INTO sportsdata_usage(sport,api_path,provider,cache_key,status_code,succeeded,duration_ms,error_message) VALUES('nfl',$1,$2,$3,$4,$5,$6,$7)", [
    route.apiPath, provider, cacheKeyFor(route), statusCode, succeeded, durationMs, errorMessage ? String(errorMessage).slice(0, 500) : null
  ]);
}

function nflverseUrls(season) {
  return {
    schedule:`${NFLVERSE_BASE}/schedules/games.csv`,
    players:`${NFLVERSE_BASE}/stats_player/stats_player_reg_${season}.csv`,
    playerWeekly:`${NFLVERSE_BASE}/stats_player/stats_player_week_${season}.csv`,
    teamWeekly:`${NFLVERSE_BASE}/stats_team/stats_team_week_${season}.csv`
  };
}

function normalizeNflverseSchedule(rows, season) {
  return rows.filter(row => Number(row.season) === Number(season) && row.game_type === 'REG' && NFL_TEAMS.has(teamCode(row.away_team)) && NFL_TEAMS.has(teamCode(row.home_team))).map(row => {
    const awayScore = row.away_score === '' ? null : number(row.away_score);
    const homeScore = row.home_score === '' ? null : number(row.home_score);
    const hasScore = awayScore != null && homeScore != null;
    return {
      GameKey:row.game_id, Season:Number(row.season), SeasonType:1, Week:number(row.week),
      AwayTeam:teamCode(row.away_team), HomeTeam:teamCode(row.home_team),
      AwayScore:awayScore, HomeScore:homeScore, Date:row.gametime ? `${row.gameday}T${row.gametime}:00` : row.gameday,
      DateTimeIsTBD:!row.gametime, Status:hasScore ? 'Final' : 'Scheduled', IsOver:hasScore,
      StadiumDetails:{ Name:row.stadium || '', City:'', State:'', Country:'USA' }
    };
  });
}

function normalizeNflversePlayers(rows) {
  return rows.map(row => {
    const team = teamCode(row.recent_team);
    if (!NFL_TEAMS.has(team)) return null;
    const receptions = number(row.receptions);
    const rushingAttempts = number(row.carries);
    return {
      PlayerID:row.player_id || null, Team:team, Name:row.player_display_name || row.player_name || '', Position:row.position || '',
      PassingCompletions:number(row.completions), PassingAttempts:number(row.attempts), PassingYards:number(row.passing_yards),
      PassingTouchdowns:number(row.passing_tds), PassingInterceptions:number(row.passing_interceptions), PassingRating:null,
      RushingAttempts:rushingAttempts, RushingYards:number(row.rushing_yards), RushingTouchdowns:number(row.rushing_tds),
      RushingYardsPerAttempt:rushingAttempts ? Number((number(row.rushing_yards) / rushingAttempts).toFixed(1)) : 0, RushingLong:0,
      Receptions:receptions, ReceivingTargets:number(row.targets), ReceivingYards:number(row.receiving_yards),
      ReceivingTouchdowns:number(row.receiving_tds), ReceivingYardsPerReception:receptions ? Number((number(row.receiving_yards) / receptions).toFixed(1)) : 0,
      ReceivingLong:0, Fumbles:number(row.fumbles_total), SoloTackles:number(row.def_tackles_solo), AssistedTackles:number(row.def_tackle_assists),
      Tackles:number(row.def_tackles_solo) + number(row.def_tackle_assists), Sacks:number(row.def_sacks),
      Interceptions:number(row.def_interceptions), FumblesForced:number(row.def_fumbles_forced),
      PassesDefended:number(row.def_pass_defended), DefensiveTouchdowns:number(row.def_tds)
    };
  }).filter(player => player && player.Name);
}

function normalizeNflverseGamePlayer(row) {
  const receptions = number(row.receptions);
  const rushingAttempts = number(row.carries);
  return {
    PlayerID:row.player_id || null, Team:teamCode(row.recent_team), Name:row.player_display_name || row.player_name || '', Position:row.position || '',
    PassingCompletions:number(row.completions), PassingAttempts:number(row.attempts), PassingYards:number(row.passing_yards),
    PassingTouchdowns:number(row.passing_tds), PassingInterceptions:number(row.passing_interceptions),
    RushingAttempts:rushingAttempts, RushingYards:number(row.rushing_yards), RushingTouchdowns:number(row.rushing_tds),
    Receptions:receptions, ReceivingTargets:number(row.targets), ReceivingYards:number(row.receiving_yards), ReceivingTouchdowns:number(row.receiving_tds),
    SoloTackles:number(row.def_tackles_solo), AssistedTackles:number(row.def_tackle_assists), Sacks:number(row.def_sacks),
    Interceptions:number(row.def_interceptions), FumblesForced:number(row.def_fumbles_forced), PassesDefended:number(row.def_pass_defended)
  };
}

function topGamePlayers(players, field, limit = 3) {
  return players
    .filter(player => player.Name && Number(player[field]) > 0)
    .sort((a, b) => Number(b[field]) - Number(a[field]))
    .slice(0, limit);
}

function gameTeamStat(row, field, fallback = 0) {
  if (!row) return fallback;
  const value = row[field] ?? row[field.replace(/Yards$/, 'Yardage')];
  return value == null || value === '' ? fallback : number(value);
}

function normalizeCachedGameStats(game, teamRows, playerRows) {
  const away = String(game.AwayTeam || game.AwayTeamKey || '').toUpperCase();
  const home = String(game.HomeTeam || game.HomeTeamKey || '').toUpperCase();
  if (!game.GameKey || !NFL_TEAMS.has(away) || !NFL_TEAMS.has(home)) return null;
  const byTeam = Object.fromEntries(teamRows.map(row => [String(row.Team || row.TeamKey || '').toUpperCase(), row]));
  const scoreFor = team => {
    const row = byTeam[team];
    return game[team === away ? 'AwayScore' : 'HomeScore'] ?? row?.Score ?? row?.Points ?? null;
  };
  const teams = {};
  for (const team of [away, home]) {
    const row = byTeam[team];
    if (!row) continue;
    const passing = gameTeamStat(row, 'PassingYards');
    const rushing = gameTeamStat(row, 'RushingYards');
    teams[team] = {
      Team:team, OpponentTeam:String(row.Opponent || row.OpponentTeam || row.OpponentTeamKey || (team === away ? home : away)).toUpperCase(),
      TotalYards:gameTeamStat(row, 'OffensiveYards', passing + rushing) || gameTeamStat(row, 'TotalYards', passing + rushing),
      PassingYards:passing, RushingYards:rushing, FirstDowns:gameTeamStat(row, 'FirstDowns'),
      Turnovers:gameTeamStat(row, 'Turnovers', gameTeamStat(row, 'Giveaways')),
      Sacks:gameTeamStat(row, 'Sacks'), Takeaways:gameTeamStat(row, 'Takeaways')
    };
  }
  const players = playerRows
    .filter(row => NFL_TEAMS.has(String(row.Team || row.TeamKey || '').toUpperCase()))
    .map(row => ({ ...row, Team:String(row.Team || row.TeamKey || '').toUpperCase(), Name:row.Name || row.PlayerName || [row.FirstName,row.LastName].filter(Boolean).join(' ') }));
  return {
    GameKey:game.GameKey, Season:Number(game.Season), Week:Number(game.Week), AwayTeam:away, HomeTeam:home,
    AwayScore:scoreFor(away), HomeScore:scoreFor(home), Status:game.Status || 'Final', StadiumDetails:game.StadiumDetails || game.Stadium || null,
    Teams:teams,
    Leaders:{
      Passing:topGamePlayers(players, 'PassingYards'),
      Rushing:topGamePlayers(players, 'RushingYards'),
      Receiving:topGamePlayers(players, 'ReceivingYards'),
      Defense:topGamePlayers(players, 'Sacks')
    }
  };
}

function standingsFromSchedule(games) {
  const rows = Object.fromEntries([...NFL_TEAMS].map(team => [team, { Team:team, Conference:TEAM_CONFERENCES[team], Division:TEAM_DIVISIONS[team], Wins:0, Losses:0, Ties:0, PointsFor:0, PointsAgainst:0, DivisionWins:0, DivisionLosses:0, DivisionTies:0 }]));
  for (const game of games) {
    if (!game.IsOver || game.AwayScore == null || game.HomeScore == null) continue;
    const away = rows[game.AwayTeam], home = rows[game.HomeTeam];
    if (!away || !home) continue;
    away.PointsFor += game.AwayScore; away.PointsAgainst += game.HomeScore;
    home.PointsFor += game.HomeScore; home.PointsAgainst += game.AwayScore;
    const divGame = away.Division === home.Division;
    if (game.AwayScore === game.HomeScore) {
      away.Ties++; home.Ties++;
      if (divGame) { away.DivisionTies++; home.DivisionTies++; }
    } else {
      const awayWon = game.AwayScore > game.HomeScore;
      const winner = awayWon ? away : home, loser = awayWon ? home : away;
      winner.Wins++; loser.Losses++;
      if (divGame) { winner.DivisionWins++; loser.DivisionLosses++; }
    }
  }
  return Object.values(rows);
}

function normalizeNflverseTeamStats(rows, games) {
  const scoreRows = standingsFromSchedule(games);
  const scores = new Map(scoreRows.map(row => [row.Team, row]));
  const byTeam = new Map();
  for (const row of rows.filter(row => row.season_type === 'REG')) {
    const team = teamCode(row.team), opponent = teamCode(row.opponent_team);
    if (!NFL_TEAMS.has(team)) continue;
    if (!byTeam.has(team)) byTeam.set(team, { Team:team, Games:0, Score:0, OffensiveYards:0, PassingYards:0, RushingYards:0, OpponentScore:0, OpponentOffensiveYards:0, OpponentPassingYards:0, OpponentRushingYards:0, Sacks:0, InterceptionReturns:0 });
    const target = byTeam.get(team);
    target.Games += 1;
    target.OffensiveYards += number(row.passing_yards) + number(row.rushing_yards);
    target.PassingYards += number(row.passing_yards);
    target.RushingYards += number(row.rushing_yards);
    target.Sacks += number(row.def_sacks);
    target.InterceptionReturns += number(row.def_interceptions);
    const opponentRow = rows.find(candidate => candidate.season_type === 'REG' && teamCode(candidate.team) === opponent && Number(candidate.week) === Number(row.week));
    if (opponentRow) {
      target.OpponentOffensiveYards += number(opponentRow.passing_yards) + number(opponentRow.rushing_yards);
      target.OpponentPassingYards += number(opponentRow.passing_yards);
      target.OpponentRushingYards += number(opponentRow.rushing_yards);
    }
  }
  for (const stat of byTeam.values()) {
    const score = scores.get(stat.Team);
    if (score) { stat.Score = score.PointsFor; stat.OpponentScore = score.PointsAgainst; }
  }
  return [...byTeam.values()];
}

function normalizeNflverseGameStats(teamRows, playerRows, games) {
  const gameMap = new Map(games.map(game => [game.GameKey, game]));
  const playerGroups = new Map();
  for (const row of playerRows.filter(row => row.season_type === 'REG')) {
    if (!row.game_id || !gameMap.has(row.game_id)) continue;
    const player = normalizeNflverseGamePlayer(row);
    if (!NFL_TEAMS.has(player.Team) || !player.Name) continue;
    if (!playerGroups.has(row.game_id)) playerGroups.set(row.game_id, []);
    playerGroups.get(row.game_id).push(player);
  }
  const teamGroups = new Map();
  for (const row of teamRows.filter(row => row.season_type === 'REG')) {
    if (!row.game_id || !gameMap.has(row.game_id)) continue;
    const team = teamCode(row.team);
    if (!NFL_TEAMS.has(team)) continue;
    if (!teamGroups.has(row.game_id)) teamGroups.set(row.game_id, {});
    teamGroups.get(row.game_id)[team] = {
      Team:team, OpponentTeam:teamCode(row.opponent_team), TotalYards:number(row.passing_yards) + number(row.rushing_yards),
      PassingYards:number(row.passing_yards), RushingYards:number(row.rushing_yards),
      FirstDowns:number(row.passing_first_downs) + number(row.rushing_first_downs),
      Turnovers:number(row.passing_interceptions) + number(row.fumbles_lost_total),
      Sacks:number(row.def_sacks), Takeaways:number(row.def_interceptions) + number(row.fumble_recovery_opp)
    };
  }
  return [...gameMap.values()]
    .filter(game => game.IsOver && teamGroups.has(game.GameKey))
    .map(game => {
      const players = playerGroups.get(game.GameKey) || [];
      return {
        GameKey:game.GameKey, Season:game.Season, Week:game.Week, AwayTeam:game.AwayTeam, HomeTeam:game.HomeTeam,
        AwayScore:game.AwayScore, HomeScore:game.HomeScore, Status:game.Status, StadiumDetails:game.StadiumDetails || null,
        Teams:teamGroups.get(game.GameKey),
        Leaders:{
          Passing:topGamePlayers(players, 'PassingYards'),
          Rushing:topGamePlayers(players, 'RushingYards'),
          Receiving:topGamePlayers(players, 'ReceivingYards'),
          Defense:topGamePlayers(players, 'Sacks')
        }
      };
    });
}

function normalizeSportsDataGameStats(boxScores, schedule = []) {
  const scheduleByKey = new Map((Array.isArray(schedule) ? schedule : []).filter(game => game?.GameKey).map(game => [game.GameKey, game]));
  const games = [];
  for (const box of Array.isArray(boxScores) ? boxScores : []) {
    const teamRows = Array.isArray(box?.TeamGames) ? box.TeamGames : [];
    const playerRows = Array.isArray(box?.PlayerGames) ? box.PlayerGames : [];
    const gameKey = box?.Game?.GameKey || box?.GameKey || teamRows.find(row => row.GameKey)?.GameKey || playerRows.find(row => row.GameKey)?.GameKey;
    const game = { ...(scheduleByKey.get(gameKey) || {}), ...(box?.Game || {}), GameKey:gameKey };
    const normalized = normalizeCachedGameStats(game, teamRows, playerRows);
    if (normalized && normalized.AwayScore != null && normalized.HomeScore != null && Object.keys(normalized.Teams).length) games.push(normalized);
  }
  return games;
}

async function refreshNflverseData(pool, season, fetcher = fetch) {
  const urls = nflverseUrls(season);
  const started = Date.now();
  const ttlHours = nflverseTtlHours();
  const routes = {
    current:routeToSportsData('/api/sportsdata/nfl/current-season'),
    schedule:routeToSportsData(`/api/sportsdata/nfl/schedule/${season}`),
    standings:routeToSportsData(`/api/sportsdata/nfl/standings/${season}`),
    players:routeToSportsData(`/api/sportsdata/nfl/player-season-stats/${season}`),
    teams:routeToSportsData(`/api/sportsdata/nfl/team-season-stats/${season}`),
    games:routeToSportsData(`/api/sportsdata/nfl/game-stats/${season}`)
  };
  const fresh = await Promise.all(Object.values(routes).map(route => readCached(pool, route)));
  if (fresh.every(row => row && Date.now() - new Date(row.fetched_at).getTime() < ttlHours * 3600000)) return true;
  try {
    const [scheduleRows, playerRows, playerWeeklyRows, teamWeeklyRows] = await Promise.all([fetchCsv(urls.schedule, fetcher), fetchCsv(urls.players, fetcher), fetchCsv(urls.playerWeekly, fetcher), fetchCsv(urls.teamWeekly, fetcher)]);
    const schedule = normalizeNflverseSchedule(scheduleRows, season);
    await writeCache(pool, routes.current, Number(season), ttlHours);
    await writeCache(pool, routes.schedule, schedule, ttlHours);
    await writeCache(pool, routes.standings, standingsFromSchedule(schedule), ttlHours);
    await writeCache(pool, routes.players, normalizeNflversePlayers(playerRows), ttlHours);
    await writeCache(pool, routes.teams, normalizeNflverseTeamStats(teamWeeklyRows, schedule), ttlHours);
    await writeCache(pool, routes.games, normalizeNflverseGameStats(teamWeeklyRows, playerWeeklyRows, schedule), ttlHours);
    await logProviderRefresh(pool, 'nflverse', { apiPath:`nflverse/${season}/daily-import` }, 200, true, Date.now() - started);
    return true;
  } catch (error) {
    await logProviderRefresh(pool, 'nflverse', { apiPath:`nflverse/${season}/daily-import` }, null, false, Date.now() - started, error.message);
    console.warn(`Scheduled nflverse refresh failed: ${error.message}`);
    return false;
  }
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

function rowsLookScrambled(rows) {
  const integerFields = [
    'PassingAttempts','PassingCompletions','PassingYards','PassingTouchdowns','PassingInterceptions',
    'RushingAttempts','RushingYards','RushingTouchdowns',
    'Receptions','ReceivingTargets','ReceivingYards','ReceivingTouchdowns'
  ];
  return (Array.isArray(rows) ? rows : []).some(row => {
    if (String(row?.InjuryStatus || '').toLowerCase() === 'scrambled') return true;
    return integerFields.some(field => row?.[field] != null && Number.isFinite(Number(row[field])) && !Number.isInteger(Number(row[field])));
  });
}

async function clearDerivedStats(pool, season) {
  await pool.query('DELETE FROM sportsdata_cache WHERE cache_key IN ($1,$2,$3)', [
    `sportsdata:nfl:derived/json/TeamSeasonStats/${season}`,
    `sportsdata:nfl:derived/json/PlayerSeasonStats/${season}`,
    `sportsdata:nfl:derived/json/GameStats/${season}`
  ]);
}

async function rebuildDerivedStatsFromBoxScores(pool, season, throughWeek) {
  const boxScores = [];
  const teamRows = [];
  const playerRows = [];
  for (let week = 1; week <= throughWeek; week++) {
    const [boxRoute] = boxScoreRoutes(season, week, true);
    const boxCache = await readCached(pool, boxRoute);
    if (Array.isArray(boxCache?.data)) boxScores.push(...boxCache.data);
    const rows = boxScoreRows(boxCache?.data);
    teamRows.push(...rows.teamRows);
    playerRows.push(...rows.playerRows);
  }
  if (rowsLookScrambled(teamRows) || rowsLookScrambled(playerRows)) {
    await clearDerivedStats(pool, season);
    console.warn(`SportsData returned scrambled stat values for ${season}; derived stat caches were cleared instead of showing incorrect leaderboards.`);
    return;
  }
  if (teamRows.length) {
    await pool.query(`INSERT INTO sportsdata_cache(cache_key,data,expires_at) VALUES($1,$2,NOW()+INTERVAL '24 hours')
      ON CONFLICT(cache_key) DO UPDATE SET data=EXCLUDED.data,fetched_at=NOW(),expires_at=EXCLUDED.expires_at`, [`sportsdata:nfl:derived/json/TeamSeasonStats/${season}`, JSON.stringify(aggregateTeamStats(teamRows))]);
  }
  if (playerRows.length) {
    await pool.query(`INSERT INTO sportsdata_cache(cache_key,data,expires_at) VALUES($1,$2,NOW()+INTERVAL '24 hours')
      ON CONFLICT(cache_key) DO UPDATE SET data=EXCLUDED.data,fetched_at=NOW(),expires_at=EXCLUDED.expires_at`, [`sportsdata:nfl:derived/json/PlayerSeasonStats/${season}`, JSON.stringify(aggregatePlayerStats(playerRows))]);
  }
  if (boxScores.length) {
    const scheduleRoute = routeToSportsData(`/api/sportsdata/nfl/schedule/${season}`);
    const schedule = (await readCached(pool, scheduleRoute))?.data || [];
    const games = normalizeSportsDataGameStats(boxScores, schedule);
    await pool.query(`INSERT INTO sportsdata_cache(cache_key,data,expires_at) VALUES($1,$2,NOW()+INTERVAL '24 hours')
      ON CONFLICT(cache_key) DO UPDATE SET data=EXCLUDED.data,fetched_at=NOW(),expires_at=EXCLUDED.expires_at`, [`sportsdata:nfl:derived/json/GameStats/${season}`, JSON.stringify(games)]);
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
  if (rowsLookScrambled(teamRows) || rowsLookScrambled(playerRows)) {
    await clearDerivedStats(pool, season);
    console.warn(`SportsData returned scrambled stat values for ${season}; derived stat caches were cleared instead of showing incorrect leaderboards.`);
    return;
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
  if (rowsLookScrambled(teamCache?.data) || rowsLookScrambled(playerCache?.data)) {
    await clearDerivedStats(pool, season);
    console.warn(`SportsData returned scrambled stat values for ${season}; derived stat caches were cleared instead of showing incorrect leaderboards.`);
    return;
  }
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
  const today = new Date();
  const seasonRow = await readCached(pool, current);
  const season = Number(process.env.NFL_SEASON || seasonRow?.data || (today.getUTCMonth() < 2 ? today.getUTCFullYear()-1 : today.getUTCFullYear()));
  if (process.env.NFL_STATS_PROVIDER !== 'sportsdata') {
    await refreshNflverseData(pool, season, fetcher);
    return;
  }
  await refreshRoute(pool, current, fetcher);
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
  res.setHeader('X-Data-Source', process.env.NFL_STATS_PROVIDER === 'sportsdata' ? 'SportsData.io' : 'nflverse');
  res.setHeader('X-Data-Status', new Date(row.expires_at).getTime() > Date.now() ? 'cached' : 'stale');
  res.setHeader('X-Data-Updated-At', new Date(row.fetched_at).toISOString());
  if (route.season) res.setHeader('X-Data-Season', String(route.season));
  const data = route.gameKey ? (Array.isArray(row.data) ? row.data.find(game => String(game.GameKey) === route.gameKey) || null : null) :
    route.team ? (Array.isArray(row.data) ? row.data.filter(player => String(player.Team || player.TeamKey || '').toUpperCase() === route.team) : []) : row.data;
  if (route.gameKey && !data) return sendJson(res, 404, { error:'Game stats are not available for that matchup yet.' }), true;
  sendJson(res, 200, data);
  return true;
}

module.exports = { initSportsDataCache, handleSportsData, startSportsDataRefresh, sportsDataHealth, routeToSportsData, scheduledRoutes, seasonStatRoutes, boxScoreRoutes, reserveRefresh, refreshScheduledData, aggregateTeamStats, aggregatePlayerStats, weekStatRoutes, completedWeekInfo, boxScoreRows, rowsLookScrambled, rebuildDerivedStatsFromSeasonFeeds, rebuildDerivedStatsFromBoxScores, parseCsv, normalizeNflverseSchedule, normalizeNflversePlayers, normalizeNflverseTeamStats, normalizeNflverseGameStats, normalizeSportsDataGameStats, standingsFromSchedule, refreshNflverseData };
