const {test,before,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const {testDatabase}=require('./test-support/database');
const {initSportsDataCache,routeToSportsData,reserveRefresh,refreshScheduledData,handleSportsData}=require('./sportsdata-api');
let db,pool;
const originalKey=process.env.SPORTSDATA_IO_KEY;
before(async()=>{({db,pool}=await testDatabase());await initSportsDataCache(pool);process.env.SPORTSDATA_IO_KEY='test-only'});
after(async()=>{if(originalKey===undefined)delete process.env.SPORTSDATA_IO_KEY;else process.env.SPORTSDATA_IO_KEY=originalKey;await db?.close()});
beforeEach(async()=>pool.query('TRUNCATE sportsdata_cache,sportsdata_usage,sportsdata_refresh_guard'));
test('regular-season stat routes use SportsData season type tokens; paid news is disabled',()=>{
  assert.equal(routeToSportsData('/api/sportsdata/nfl/schedule/2026').apiPath,'scores/json/Schedules/2026');
  assert.equal(routeToSportsData('/api/sportsdata/nfl/standings/2026').apiPath,'scores/json/Standings/2026REG');
  assert.equal(routeToSportsData('/api/sportsdata/nfl/player-season-stats/2026').apiPath,'stats/json/PlayerSeasonStats/2026REG');
  assert.equal(routeToSportsData('/api/sportsdata/nfl/team-season-stats/2026').apiPath,'scores/json/TeamSeasonStats/2026REG');
  assert.equal(routeToSportsData('/api/sportsdata/nfl/player-season-stats-by-team/2026/DET').apiPath,'stats/json/PlayerSeasonStats/2026REG');
  assert.equal(routeToSportsData('/api/sportsdata/nfl/news/team/DET'),null);
  assert.equal(routeToSportsData('/api/sportsdata/nfl/player-season-stats-by-team/2026/INVALID'),null);
});
test('parallel reservations enforce the rolling budget across different keys',async()=>{
  const routes=Array.from({length:12},(_,i)=>routeToSportsData(`/api/sportsdata/nfl/schedule/${2000+i}`));
  const reservations=await Promise.all(routes.map(route=>reserveRefresh(pool,route)));
  assert.equal(reservations.filter(Boolean).length,5);
});
test('scheduled updates make five calls then no more on repeated passes',async()=>{
  let calls=0;
  const fetcher=async url=>{calls++;return {ok:true,status:200,json:async()=>url.endsWith('CurrentSeason')?2026:[]}};
  await refreshScheduledData(pool,fetcher);await refreshScheduledData(pool,fetcher);
  assert.equal(calls,5);
  await pool.query("UPDATE sportsdata_usage SET requested_at=NOW()-INTERVAL '25 hours';UPDATE sportsdata_cache SET expires_at=NOW()-INTERVAL '1 second';UPDATE sportsdata_refresh_guard SET next_attempt_at=NOW()-INTERVAL '1 second'");
  await refreshScheduledData(pool,fetcher);
  assert.equal(calls,10);
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
  assert.equal(calls,5);
  assert.equal(Number((await pool.query('SELECT COUNT(*) AS count FROM sportsdata_usage WHERE succeeded=FALSE')).rows[0].count),5);
});
test('retired plain-year stat attempts do not block regular-season cache refresh',async()=>{
  for (const path of ['scores/json/Standings/2026','stats/json/PlayerSeasonStats/2026','scores/json/TeamSeasonStats/2026']) {
    await pool.query("INSERT INTO sportsdata_usage(sport,api_path,provider,cache_key,error_message) VALUES('nfl',$1,'sportsdata',$2,'retired path')", [path, `sportsdata:nfl:${path}`]);
  }
  let calls=0;
  const fetcher=async url=>{calls++;return {ok:true,status:200,json:async()=>url.endsWith('CurrentSeason')?2026:[]}};
  await refreshScheduledData(pool,fetcher);
  assert.equal(calls,5);
  const refreshed=(await pool.query("SELECT api_path FROM sportsdata_usage WHERE succeeded=TRUE ORDER BY api_path")).rows.map(row=>row.api_path);
  assert.deepEqual(refreshed,[
    'scores/json/CurrentSeason',
    'scores/json/Schedules/2026',
    'scores/json/Standings/2026REG',
    'scores/json/TeamSeasonStats/2026REG',
    'stats/json/PlayerSeasonStats/2026REG'
  ]);
});
test('student traffic reads stale data and filters locally without reserving calls',async()=>{
  await pool.query("INSERT INTO sportsdata_cache(cache_key,data,fetched_at,expires_at) VALUES($1,$2,NOW()-INTERVAL '2 days',NOW()-INTERVAL '1 day')",['sportsdata:nfl:stats/json/PlayerSeasonStats/2026REG',JSON.stringify([{Team:'DET',Name:'One'},{Team:'DAL',Name:'Two'}])]);
  const headers={};let result;
  for(let i=0;i<80;i++)await handleSportsData({pool,req:{method:'GET'},res:{setHeader:(key,value)=>{headers[key]=value}},path:'/api/sportsdata/nfl/player-season-stats-by-team/2026/DET',user:{id:1},sendJson:(res,status,data)=>{result={status,data}}});
  assert.equal(result.status,200);assert.deepEqual(result.data,[{Team:'DET',Name:'One'}]);assert.equal(headers['X-Data-Status'],'stale');
  assert.equal(Number((await pool.query('SELECT COUNT(*) AS count FROM sportsdata_usage')).rows[0].count),0);
});
test('a missing cache returns unavailable without contacting SportsData',async()=>{
  let result;
  await handleSportsData({pool,req:{method:'GET'},res:{},path:'/api/sportsdata/nfl/schedule/2026',user:{id:1},sendJson:(res,status,data)=>{result={status,data}}});
  assert.equal(result.status,503);assert.equal(result.data.status,'unavailable');
  assert.equal(Number((await pool.query('SELECT COUNT(*) AS count FROM sportsdata_usage')).rows[0].count),0);
});
