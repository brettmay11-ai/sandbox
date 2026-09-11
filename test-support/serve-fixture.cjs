// Isolated smoke-test server. Never connects to Railway or calls paid providers.
process.env.DATABASE_URL='fixture-only';
process.env.PORT=process.env.TEST_PORT||'8099';
process.env.NODE_ENV='test';
process.env.SEED_CLASS_STUDENTS='false';
process.env.SUPER_ADMIN_USERNAME='qa.admin';process.env.SUPER_ADMIN_PIN='1234';
process.env.TEACHER_USERNAME='qa.teacher';process.env.TEACHER_PIN='1234';
delete process.env.SPORTSDATA_IO_KEY;delete process.env.SPORTSDATA_API_KEY;
const {testDatabase}=require('./database');
const crypto=require('crypto');
const http=require('http');
const ready=testDatabase();
require('pg').Pool=class {
  async query(sql,params){return (await ready).pool.query(sql,params)}
  async connect(){return (await ready).pool.connect()}
  async end(){}
};
const original=http.createServer;
http.createServer=function(...args){
  const server=original.apply(this,args);
  server.once('listening',async()=>{
    try {
      const {pool}=await ready;
      const classId=(await pool.query("SELECT id FROM classes WHERE slug='may'")).rows[0].id;
      const other=(await pool.query("SELECT id FROM classes WHERE slug='jenkins'")).rows[0].id;
      const salt='smoke-test';const hash=salt+':'+crypto.scryptSync('1234',salt,64).toString('hex');
      await pool.query("INSERT INTO users(username,display_name,pin_hash,role,class_id,selected_team) VALUES('qa.student','QA Student',$1,'student',$2,'SF'),('qa.other','Other Class',$1,'student',$3,'DAL')",[hash,classId,other]);
      const game={GameKey:'202610101',Season:2026,SeasonType:1,Week:1,AwayTeam:'SF',HomeTeam:'LAR',DateTimeUTC:'2026-09-11T00:35:00',Status:'Scheduled',StadiumDetails:{Name:'Melbourne Cricket Ground',City:'Melbourne',Country:'Australia',GeoLat:-37.85,GeoLong:144.98}};
      const players=[{Team:'SF',Name:'Fixture Quarterback',Position:'QB',PassingYards:200,PassingAttempts:25,PassingCompletions:15,PassingTouchdowns:2,PassingInterceptions:0,PassingRating:100}];
      const teams=[{Team:'SF',Games:1,Score:21,OffensiveYards:320,PassingYards:200,RushingYards:120,OpponentScore:14,OpponentOffensiveYards:250,Sacks:3,InterceptionReturns:1}];
      for(const [path,data] of [['scores/json/CurrentSeason',2026],['scores/json/Schedules/2026',[game]],['stats/json/BoxScoresFinal/2026REG/1',[{TeamGames:teams,PlayerGames:players}]],['stats/json/PlayerSeasonStats/2026REG',players],['scores/json/TeamSeasonStats/2026REG',teams],['derived/json/PlayerSeasonStats/2026',players],['derived/json/TeamSeasonStats/2026',teams],['scores/json/Standings/2026REG',[{Team:'SF',Conference:'NFC',Division:'West',Wins:1,Losses:0,PointsFor:21,PointsAgainst:14}]]]){
        await pool.query("INSERT INTO sportsdata_cache(cache_key,data,expires_at) VALUES($1,$2,NOW()+INTERVAL '24 hours')",['sportsdata:nfl:'+path,JSON.stringify(data)]);
      }
      await pool.query("INSERT INTO classroom_settings(setting_key,setting_value) VALUES('featured_game',$1)",[JSON.stringify({week:1,away:'SF',home:'LAR',day:'Thursday',date:'Nov 26',time:'9:00 AM ET',discussion:'Fixture discussion'})]);
      console.log('TEST_FIXTURE_READY');
    }catch(error){console.error(error);process.exit(1)}
  });
  return server;
};
require('../start-with-teacher-menu');
