const { normalizeGame } = require('./sports-data-model');
async function resolveFeaturedGame(pool, selection) {
  if (!selection) return null;
  const current = (await pool.query("SELECT data FROM sportsdata_cache WHERE cache_key='sportsdata:nfl:scores/json/CurrentSeason'")).rows[0];
  const season = Number(selection.season || current?.data || new Date().getFullYear());
  const row = (await pool.query('SELECT data FROM sportsdata_cache WHERE cache_key=$1', [`sportsdata:nfl:scores/json/Schedules/${season}`])).rows[0];
  const match = Array.isArray(row?.data) ? row.data.find(game => (!game.SeasonType || game.SeasonType===1) && Number(game.Week)===Number(selection.week) && game.AwayTeam===selection.away && game.HomeTeam===selection.home) : null;
  const identity = { week:Number(selection.week), away:selection.away, home:selection.home, season, discussion:selection.discussion || '' };
  return match ? { ...identity, ...normalizeGame(match), season, scheduled:true } : { ...identity, day:'Date TBD', date:'', time:'Time TBD', scheduled:false };
}
module.exports = { resolveFeaturedGame };
