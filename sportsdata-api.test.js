const {test,before,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const {testDatabase}=require('./test-support/database');
const {initSportsDataCache,routeToSportsData,reserveRefresh,refreshScheduledData,handleSportsData,aggregateTeamStats,aggregatePlayerStats,completedWeekInfo,rebuildDerivedStatsFromSeasonFeeds,rebuildDerivedStatsFromBoxScores,rowsLookScrambled,refreshNflverseData,normalizeNflverseGameStats,normalizeSportsDataGameStats}=require('./sportsdata-api');
let db,pool;
const originalKey=process.env.SPORTSDATA_IO_KEY;
const originalProvider=process.env.NFL_STATS_PROVIDER;
before(async()=>{({db,pool}=await testDatabase());await initSportsDataCache(pool);process.env.SPORTSDATA_IO_KEY='test-only';process.env.NFL_STATS_PROVIDER='sportsdata'});
after(async()=>{if(originalKey===undefined)delete process.env.SPORTSDATA_IO_KEY;else process.env.SPORTSDATA_IO_KEY=originalKey;if(originalProvider===undefined)delete process.env.NFL_STATS_PROVIDER;else process.env.NFL_STATS_PROVIDER=originalProvider;await db?.close()});
beforeEach(async()=>pool.query('TRUNCATE sportsdata_cache,sportsdata_usage,sportsdata_refresh_guard'));
test('regular-season stat routes use SportsData season type tokens; paid news is disabled',()=>{
  assert.equal(routeToSportsData('/api/sportsdata/nfl/schedule/2026').apiPath,'scores/json/Schedules/2026');
  assert.equal(routeToSportsData('/api/sportsdata/nfl/standings/2026').apiPath,'scores/json/Standings/2026REG');
  assert.equal(routeToSportsData('/api/sportsdata/nfl/player-season-stats/2026').apiPath,'derived/json/PlayerSeasonStats/2026');
  assert.equal(routeToSportsData('/api/sportsdata/nfl/team-season-stats/2026').apiPath,'derived/json/TeamSeasonStats/2026');
  assert.equal(routeToSportsData('/api/sportsdata/nfl/player-season-stats-by-team/2026/DET').apiPath,'derived/json/PlayerSeasonStats/2026');
  assert.equal(routeToSportsData('/api/sportsdata/nfl/news/team/DET'),null);
  assert.equal(routeToSportsData('/api/sportsdata/nfl/player-season-stats-by-team/2026/INVALID'),null);
});
test('parallel reservations enforce the rolling budget across different keys',async()=>{
  const routes=Array.from({length:12},(_,i)=>routeToSportsData(`/api/sportsdata/nfl/schedule/${2000+i}`));
  const reservations=await Promise.all(routes.map(route=>reserveRefresh(pool,route)));
  assert.equal(reservations.filter(Boolean).length,5);
});
test('scheduled updates make four calls then no more on repeated passes',async()=>{
  let calls=0;
  const fetcher=async url=>{calls++;return {ok:true,status:200,json:async()=>url.endsWith('CurrentSeason')?2026:[]}};
  await refreshScheduledData(pool,fetcher);await refreshScheduledData(pool,fetcher);
  assert.equal(calls,4);
  await pool.query("UPDATE sportsdata_usage SET requested_at=NOW()-INTERVAL '25 hours';UPDATE sportsdata_cache SET expires_at=NOW()-INTERVAL '1 second';UPDATE sportsdata_refresh_guard SET next_attempt_at=NOW()-INTERVAL '1 second'");
  await refreshScheduledData(pool,fetcher);
  assert.equal(calls,8);
});
test('simultaneous refreshes of one endpoint reserve only one attempt',async()=>{
  const route=routeToSportsData('/api/sportsdata/nfl/schedule/2026');
  const attempts=await Promise.all(Array.from({length:20},()=>reserveRefresh(pool,route)));
  assert.equal(attempts.filter(Boolean).length,1);
});
test('failed calls consume budget and retain durable cooldowns even with no cache',async()=>{
  let calls=0;
  const fetcher=async()=>{calls++;return {ok:false,status:429}};
  await refreshScheduledData(pool,fetcher);await refreshScheduledData(pool,fetcher);
  assert.equal(calls,4);
  assert.equal(Number((await pool.query('SELECT COUNT(*) AS count FROM sportsdata_usage WHERE succeeded=FALSE')).rows[0].count),4);
});
test('retired plain-year stat attempts do not block regular-season cache refresh',async()=>{
  for (const path of ['scores/json/Standings/2026','stats/json/PlayerSeasonStats/2026','scores/json/TeamSeasonStats/2026','stats/json/PlayerSeasonStats/2026REG','scores/json/TeamSeasonStats/2026REG']) {
    await pool.query("INSERT INTO sportsdata_usage(sport,api_path,provider,cache_key,error_message) VALUES('nfl',$1,'sportsdata',$2,'retired path')", [path, `sportsdata:nfl:${path}`]);
  }
  let calls=0;
  const fetcher=async url=>{calls++;return {ok:true,status:200,json:async()=>url.endsWith('CurrentSeason')?2026:[]}};
  await refreshScheduledData(pool,fetcher);
  assert.equal(calls,4);
  const refreshed=(await pool.query("SELECT api_path FROM sportsdata_usage WHERE succeeded=TRUE ORDER BY api_path")).rows.map(row=>row.api_path);
  assert.deepEqual(refreshed,[
    'scores/json/CurrentSeason',
    'scores/json/Schedules/2026',
    'scores/json/Standings/2026REG',
    'stats/json/BoxScoresFinal/2026REG/1'
  ]);
});
test('final SportsData box scores populate derived student stat caches',async()=>{
  await pool.query("INSERT INTO sportsdata_cache(cache_key,data,expires_at) VALUES($1,$2,NOW()+INTERVAL '24 hours')",[
    'sportsdata:nfl:stats/json/BoxScoresFinal/2026REG/1',
    JSON.stringify([{
      TeamGames:[{Team:'SEA',Games:1,Score:13,OffensiveYards:233,PassingYards:187,RushingYards:46,OpponentScore:10,OpponentOffensiveYards:130}],
      PlayerGames:[
        {PlayerID:1,Team:'SEA',Name:'D.Lock',Position:'QB',PassingCompletions:16,PassingAttempts:22,PassingYards:187,PassingTouchdowns:1},
        {PlayerID:2,Team:'SEA',Name:'J.Smith-Njigba',Position:'WR',Receptions:8,ReceivingTargets:11,ReceivingYards:122,ReceivingTouchdowns:1}
      ]
    }])
  ]);
  await rebuildDerivedStatsFromBoxScores(pool,2026,1);
  const players=(await pool.query("SELECT data FROM sportsdata_cache WHERE cache_key='sportsdata:nfl:derived/json/PlayerSeasonStats/2026'")).rows[0].data;
  const teams=(await pool.query("SELECT data FROM sportsdata_cache WHERE cache_key='sportsdata:nfl:derived/json/TeamSeasonStats/2026'")).rows[0].data;
  assert.equal(players.find(player=>player.Name==='D.Lock').PassingYards,187);
  assert.equal(players.find(player=>player.Name==='J.Smith-Njigba').ReceivingYards,122);
  assert.equal(teams.find(team=>team.Team==='SEA').PassingYards,187);
});
test('scrambled SportsData stat rows are not displayed as real stats',async()=>{
  assert.equal(rowsLookScrambled([{Name:'Drew Lock',Team:'SEA',PassingYards:58.3,InjuryStatus:'Scrambled'}]),true);
  await pool.query("INSERT INTO sportsdata_cache(cache_key,data,expires_at) VALUES($1,$2,NOW()+INTERVAL '24 hours'),($3,$4,NOW()+INTERVAL '24 hours')",[
    'sportsdata:nfl:stats/json/BoxScoresFinal/2026REG/1',
    JSON.stringify([{TeamGames:[{Team:'SEA',Games:1,PassingYards:280}],PlayerGames:[{PlayerID:1,Team:'SEA',Name:'Drew Lock',PassingYards:58.3,InjuryStatus:'Scrambled'}]}]),
    'sportsdata:nfl:derived/json/PlayerSeasonStats/2026',
    JSON.stringify([{Team:'SEA',Name:'Old Wrong Row',PassingYards:311.2}])
  ]);
  await rebuildDerivedStatsFromBoxScores(pool,2026,1);
  const count=Number((await pool.query("SELECT COUNT(*) AS count FROM sportsdata_cache WHERE cache_key IN ('sportsdata:nfl:derived/json/PlayerSeasonStats/2026','sportsdata:nfl:derived/json/TeamSeasonStats/2026')")).rows[0].count);
  assert.equal(count,0);
});
test('regular season SportsData feeds populate derived student caches',async()=>{
  await pool.query("INSERT INTO sportsdata_cache(cache_key,data,expires_at) VALUES($1,$2,NOW()+INTERVAL '24 hours'),($3,$4,NOW()+INTERVAL '24 hours')",[
    'sportsdata:nfl:stats/json/PlayerSeasonStats/2026REG',
    JSON.stringify([
      {PlayerID:1,Team:'SEA',Name:'D.Lock',Position:'QB',PassingCompletions:16,PassingAttempts:22,PassingYards:187,PassingTouchdowns:1},
      {PlayerID:2,Team:'SEA',Name:'J.Smith-Njigba',Position:'WR',Receptions:8,ReceivingTargets:11,ReceivingYards:122,ReceivingTouchdowns:1}
    ]),
    'sportsdata:nfl:scores/json/TeamSeasonStats/2026REG',
    JSON.stringify([{Team:'SEA',Games:1,Score:13,OffensiveYards:233,PassingYards:187,RushingYards:46,OpponentScore:10,OpponentOffensiveYards:130}])
  ]);
  await rebuildDerivedStatsFromSeasonFeeds(pool,2026);
  const players=(await pool.query("SELECT data FROM sportsdata_cache WHERE cache_key='sportsdata:nfl:derived/json/PlayerSeasonStats/2026'")).rows[0].data;
  const teams=(await pool.query("SELECT data FROM sportsdata_cache WHERE cache_key='sportsdata:nfl:derived/json/TeamSeasonStats/2026'")).rows[0].data;
  assert.equal(players.find(player=>player.Name==='D.Lock').PassingYards,187);
  assert.equal(players.find(player=>player.Name==='J.Smith-Njigba').ReceivingYards,122);
  assert.equal(teams.find(team=>team.Team==='SEA').PassingYards,187);
});
test('derived stats aggregate SportsData weekly box-score rows into season totals',()=>{
  const team=aggregateTeamStats([
    {Team:'SEA',Score:13,OffensiveYards:233,PassingYards:187,RushingYards:46,OpponentScore:10,OpponentOffensiveYards:130,Sacks:1,InterceptionReturns:3}
  ])[0];
  assert.equal(team.Team,'SEA');
  assert.equal(team.Games,1);
  assert.equal(team.PassingYards,187);
  assert.equal(team.OffensiveYards,233);
  const players=aggregatePlayerStats([
    {PlayerID:1,Team:'SEA',Name:'D.Lock',Position:'QB',PassingCompletions:16,PassingAttempts:22,PassingYards:187,PassingTouchdowns:1},
    {PlayerID:2,Team:'SEA',Name:'J.Smith-Njigba',Position:'WR',Receptions:8,ReceivingTargets:11,ReceivingYards:122,ReceivingTouchdowns:1,ReceivingLong:45}
  ]);
  assert.equal(players.find(player=>player.Name==='D.Lock').PassingYards,187);
  assert.equal(players.find(player=>player.Name==='J.Smith-Njigba').ReceivingYards,122);
});
test('current stat week follows started regular season games from schedule cache',()=>{
  const info=completedWeekInfo([
    {SeasonType:1,Week:1,DateTimeUTC:'2026-09-10T00:00:00Z',Status:'Final',IsOver:true},
    {SeasonType:1,Week:2,DateTimeUTC:'2026-09-20T00:00:00Z',Status:'Scheduled'}
  ], new Date('2026-09-11T00:00:00Z'));
  assert.deepEqual(info,{currentWeek:1,complete:true});
});
test('student traffic reads stale data and filters locally without reserving calls',async()=>{
  await pool.query("INSERT INTO sportsdata_cache(cache_key,data,fetched_at,expires_at) VALUES($1,$2,NOW()-INTERVAL '2 days',NOW()-INTERVAL '1 day')",['sportsdata:nfl:derived/json/PlayerSeasonStats/2026',JSON.stringify([{Team:'DET',Name:'One'},{Team:'DAL',Name:'Two'}])]);
  const headers={};let result;
  for(let i=0;i<80;i++)await handleSportsData({pool,req:{method:'GET'},res:{setHeader:(key,value)=>{headers[key]=value}},path:'/api/sportsdata/nfl/player-season-stats-by-team/2026/DET',user:{id:1},sendJson:(res,status,data)=>{result={status,data}}});
  assert.equal(result.status,200);assert.deepEqual(result.data,[{Team:'DET',Name:'One'}]);assert.equal(headers['X-Data-Status'],'stale');
  assert.equal(Number((await pool.query('SELECT COUNT(*) AS count FROM sportsdata_usage')).rows[0].count),0);
});
test('nflverse daily import fills legacy student sports caches',async()=>{
  const csv = {
    'games.csv':`game_id,season,game_type,week,gameday,weekday,gametime,away_team,away_score,home_team,home_score,stadium\n2026_01_NE_SEA,2026,REG,1,2026-09-10,Thursday,20:20,NE,10,SEA,13,Lumen Field\n`,
    'stats_player_reg_2026.csv':`player_id,player_name,player_display_name,position,recent_team,completions,attempts,passing_yards,passing_tds,passing_interceptions,carries,rushing_yards,rushing_tds,receptions,targets,receiving_yards,receiving_tds,fumbles_total,def_tackles_solo,def_tackle_assists,def_sacks,def_interceptions,def_fumbles_forced,def_pass_defended,def_tds\n00-0035704,D.Lock,Drew Lock,QB,SEA,16,22,187,1,0,2,13,0,0,0,0,0,0,0,0,0,0,0,0,0\n00-0038543,J.Smith-Njigba,Jaxon Smith-Njigba,WR,SEA,0,0,0,0,0,0,0,0,8,11,122,1,0,0,0,0,0,0,0,0\n`,
    'stats_player_week_2026.csv':`season,week,season_type,game_id,player_id,player_name,player_display_name,position,recent_team,completions,attempts,passing_yards,passing_tds,passing_interceptions,carries,rushing_yards,rushing_tds,receptions,targets,receiving_yards,receiving_tds,def_sacks\n2026,1,REG,2026_01_NE_SEA,00-0035704,D.Lock,Drew Lock,QB,SEA,16,22,187,1,0,2,13,0,0,0,0,0,0\n2026,1,REG,2026_01_NE_SEA,00-0038543,J.Smith-Njigba,Jaxon Smith-Njigba,WR,SEA,0,0,0,0,0,0,0,0,8,11,122,1,0\n`,
    'stats_team_week_2026.csv':`season,week,team,season_type,game_id,opponent_team,passing_yards,rushing_yards,def_sacks,def_interceptions\n2026,1,NE,REG,2026_01_NE_SEA,SEA,178,109,2,0\n2026,1,SEA,REG,2026_01_NE_SEA,NE,187,46,3,3\n`
  };
  const fetcher=async url=>{
    const name=url.split('/').pop();
    return {ok:Boolean(csv[name]),status:csv[name]?200:404,text:async()=>csv[name]||''};
  };
  delete process.env.NFL_STATS_PROVIDER;
  await refreshNflverseData(pool,2026,fetcher);
  process.env.NFL_STATS_PROVIDER='sportsdata';
  const players=(await pool.query("SELECT data FROM sportsdata_cache WHERE cache_key='sportsdata:nfl:derived/json/PlayerSeasonStats/2026'")).rows[0].data;
  const teams=(await pool.query("SELECT data FROM sportsdata_cache WHERE cache_key='sportsdata:nfl:derived/json/TeamSeasonStats/2026'")).rows[0].data;
  const standings=(await pool.query("SELECT data FROM sportsdata_cache WHERE cache_key='sportsdata:nfl:scores/json/Standings/2026REG'")).rows[0].data;
  const games=(await pool.query("SELECT data FROM sportsdata_cache WHERE cache_key='sportsdata:nfl:derived/json/GameStats/2026'")).rows[0].data;
  assert.equal(players.find(player=>player.Name==='Drew Lock').PassingYards,187);
  assert.equal(players.find(player=>player.Name==='Jaxon Smith-Njigba').ReceivingYards,122);
  assert.equal(teams.find(team=>team.Team==='SEA').PassingYards,187);
  assert.equal(teams.find(team=>team.Team==='SEA').OpponentOffensiveYards,287);
  assert.equal(standings.find(team=>team.Team==='SEA').Wins,1);
  assert.equal(games.find(game=>game.GameKey==='2026_01_NE_SEA').Leaders.Receiving[0].ReceivingYards,122);
});
test('nflverse refresh ignores old 24-hour expirations after the shorter refresh window',async()=>{
  const current=routeToSportsData('/api/sportsdata/nfl/current-season');
  const schedule=routeToSportsData('/api/sportsdata/nfl/schedule/2026');
  const standings=routeToSportsData('/api/sportsdata/nfl/standings/2026');
  const players=routeToSportsData('/api/sportsdata/nfl/player-season-stats/2026');
  const teams=routeToSportsData('/api/sportsdata/nfl/team-season-stats/2026');
  for (const route of [current,schedule,standings,players,teams]) {
    await pool.query("INSERT INTO sportsdata_cache(cache_key,data,fetched_at,expires_at) VALUES($1,$2,NOW()-INTERVAL '3 hours',NOW()+INTERVAL '21 hours')", [`sportsdata:nfl:${route.apiPath}`, JSON.stringify([])]);
  }
  const csv = {
    'games.csv':`game_id,season,game_type,week,gameday,weekday,gametime,away_team,away_score,home_team,home_score,stadium\n2026_01_NE_SEA,2026,REG,1,2026-09-10,Thursday,20:20,NE,10,SEA,13,Lumen Field\n`,
    'stats_player_reg_2026.csv':`player_id,player_name,player_display_name,position,recent_team,completions,attempts,passing_yards,passing_tds,passing_interceptions,carries,rushing_yards,rushing_tds,receptions,targets,receiving_yards,receiving_tds\n00-0035704,D.Lock,Drew Lock,QB,SEA,16,22,187,1,0,0,0,0,0,0,0,0\n`,
    'stats_player_week_2026.csv':`season,week,season_type,game_id,player_id,player_name,player_display_name,position,recent_team,completions,attempts,passing_yards,passing_tds,passing_interceptions,carries,rushing_yards,rushing_tds,receptions,targets,receiving_yards,receiving_tds\n2026,1,REG,2026_01_NE_SEA,00-0035704,D.Lock,Drew Lock,QB,SEA,16,22,187,1,0,0,0,0,0,0,0,0\n`,
    'stats_team_week_2026.csv':`season,week,team,season_type,game_id,opponent_team,passing_yards,rushing_yards,def_sacks,def_interceptions\n2026,1,SEA,REG,2026_01_NE_SEA,NE,187,46,3,3\n2026,1,NE,REG,2026_01_NE_SEA,SEA,178,109,2,0\n`
  };
  let calls=0;
  const fetcher=async url=>({ok:true,status:200,text:async()=>{calls++;return csv[url.split('/').pop()]||''}});
  delete process.env.NFL_STATS_PROVIDER;
  await refreshNflverseData(pool,2026,fetcher);
  process.env.NFL_STATS_PROVIDER='sportsdata';
  assert.equal(calls,4);
  const updated=(await pool.query("SELECT data FROM sportsdata_cache WHERE cache_key='sportsdata:nfl:derived/json/PlayerSeasonStats/2026'")).rows[0].data;
  assert.equal(updated.find(player=>player.Name==='Drew Lock').PassingYards,187);
});
test('nflverse game stats create final-game box score summaries',()=>{
  const games=normalizeNflverseGameStats(
    [
      {season_type:'REG',game_id:'2026_01_NE_SEA',team:'SEA',opponent_team:'NE',passing_yards:'187',rushing_yards:'46',passing_first_downs:'8',rushing_first_downs:'2',passing_interceptions:'0',fumbles_lost_total:'0',def_sacks:'3',def_interceptions:'2'},
      {season_type:'REG',game_id:'2026_01_NE_SEA',team:'NE',opponent_team:'SEA',passing_yards:'178',rushing_yards:'109',passing_first_downs:'7',rushing_first_downs:'5',passing_interceptions:'2',fumbles_lost_total:'1',def_sacks:'1',def_interceptions:'0'}
    ],
    [
      {season_type:'REG',game_id:'2026_01_NE_SEA',team:'SEA',player_display_name:'Drew Lock',position:'QB',passing_yards:'187',passing_tds:'1'},
      {season_type:'REG',game_id:'2026_01_NE_SEA',team:'SEA',player_display_name:'Jaxon Smith-Njigba',position:'WR',receiving_yards:'122',receptions:'8',targets:'10'},
      {season_type:'REG',game_id:'2026_01_NE_SEA',team:'NE',player_display_name:'Example Defender',position:'LB',def_tackles_solo:'5',def_tackle_assists:'3',def_sacks:'1'}
    ],
    [{GameKey:'2026_01_NE_SEA',Season:2026,Week:1,AwayTeam:'NE',HomeTeam:'SEA',AwayScore:10,HomeScore:13,Status:'Final',IsOver:true}]
  )[0];
  assert.equal(games.Teams.SEA.TotalYards,233);
  assert.equal(games.Teams.NE.Turnovers,3);
  assert.equal(games.Leaders.Passing[0].Name,'Drew Lock');
  assert.equal(games.Leaders.Receiving[0].ReceivingYards,122);
  assert.equal(games.Players.length,3);
  assert.equal(games.Players.find(player=>player.Name==='Jaxon Smith-Njigba').ReceivingTargets,10);
  assert.equal(games.Players.find(player=>player.Name==='Example Defender').Tackles,8);
});
test('sportsdata box scores create final-game popup summaries without another provider call',()=>{
  const games=normalizeSportsDataGameStats([
    {
      Game:{GameKey:'2026_01_DAL_PHI',Season:2026,Week:1,AwayTeam:'DAL',HomeTeam:'PHI',AwayScore:20,HomeScore:24,Status:'Final'},
      TeamGames:[
        {GameKey:'2026_01_DAL_PHI',Team:'DAL',Score:20,OffensiveYards:307,PassingYards:188,RushingYards:119,FirstDowns:18,Turnovers:1,Sacks:2,Takeaways:0},
        {GameKey:'2026_01_DAL_PHI',Team:'PHI',Score:24,OffensiveYards:334,PassingYards:201,RushingYards:133,FirstDowns:21,Turnovers:0,Sacks:3,Takeaways:1}
      ],
      PlayerGames:[
        {GameKey:'2026_01_DAL_PHI',Team:'PHI',Name:'Example QB',Position:'QB',PassingCompletions:18,PassingAttempts:27,PassingYards:201,PassingTouchdowns:2,PassingInterceptions:1},
        {GameKey:'2026_01_DAL_PHI',Team:'DAL',Name:'Example WR',Position:'WR',Receptions:7,ReceivingTargets:9,ReceivingYards:101,ReceivingTouchdowns:1}
      ]
    }
  ])[0];
  assert.equal(games.HomeScore,24);
  assert.equal(games.Teams.PHI.TotalYards,334);
  assert.equal(games.Leaders.Passing[0].Name,'Example QB');
  assert.equal(games.Leaders.Receiving[0].ReceivingYards,101);
  assert.equal(games.Players.length,2);
  assert.equal(games.Players.find(player=>player.Name==='Example QB').PassingAttempts,27);
  assert.equal(games.Players.find(player=>player.Name==='Example WR').ReceivingYardsPerReception,14.4);
});
test('a missing cache returns unavailable without contacting SportsData',async()=>{
  let result;
  await handleSportsData({pool,req:{method:'GET'},res:{},path:'/api/sportsdata/nfl/schedule/2026',user:{id:1},sendJson:(res,status,data)=>{result={status,data}}});
  assert.equal(result.status,503);assert.equal(result.data.status,'unavailable');
  assert.equal(Number((await pool.query('SELECT COUNT(*) AS count FROM sportsdata_usage')).rows[0].count),0);
});
