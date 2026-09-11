const crypto = require('crypto');
const { awardMathBadges } = require('./badges-api');

const { createQuestion, LEVEL_THRESHOLDS } = require('./math-questions');
const LEVELS = ['Rookie','Starter','Captain','All-Pro','Hall of Famer'].map((name,index)=>({name,xp:LEVEL_THRESHOLDS[index]}));

function levelFor(xp){return [...LEVELS].reverse().find(level=>xp>=level.xp)||LEVELS[0]}
function nextLevel(xp){return LEVELS.find(level=>level.xp>xp)||null}

async function initMathGame(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS users(id BIGSERIAL PRIMARY KEY,username VARCHAR(32) UNIQUE NOT NULL,display_name VARCHAR(80) NOT NULL,pin_hash TEXT NOT NULL,role VARCHAR(12) NOT NULL CHECK(role IN('teacher','student')),selected_team VARCHAR(12),active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),last_login_at TIMESTAMPTZ);CREATE TABLE IF NOT EXISTS math_profiles(user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,total_xp INTEGER NOT NULL DEFAULT 0,touchdowns INTEGER NOT NULL DEFAULT 0,drive_yards INTEGER NOT NULL DEFAULT 0,correct_answers INTEGER NOT NULL DEFAULT 0,questions_answered INTEGER NOT NULL DEFAULT 0,current_streak INTEGER NOT NULL DEFAULT 0,best_streak INTEGER NOT NULL DEFAULT 0,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());CREATE TABLE IF NOT EXISTS math_challenges(id VARCHAR(64) PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,question TEXT NOT NULL,answer NUMERIC NOT NULL,explanation TEXT NOT NULL,difficulty VARCHAR(24) NOT NULL,xp INTEGER NOT NULL,yards INTEGER NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),answered_at TIMESTAMPTZ);CREATE TABLE IF NOT EXISTS math_weekly_stats(user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,week_start DATE NOT NULL,xp INTEGER NOT NULL DEFAULT 0,correct_answers INTEGER NOT NULL DEFAULT 0,questions_answered INTEGER NOT NULL DEFAULT 0,touchdowns INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,week_start));CREATE INDEX IF NOT EXISTS math_challenges_user_idx ON math_challenges(user_id,created_at DESC);`);
  // Railway databases may already contain an older version of these tables.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS class_id BIGINT;ALTER TABLE users ADD COLUMN IF NOT EXISTS selected_team VARCHAR(12);ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;ALTER TABLE users ADD COLUMN IF NOT EXISTS math_difficulty_boost INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE math_profiles ADD COLUMN IF NOT EXISTS total_xp INTEGER NOT NULL DEFAULT 0;ALTER TABLE math_profiles ADD COLUMN IF NOT EXISTS touchdowns INTEGER NOT NULL DEFAULT 0;ALTER TABLE math_profiles ADD COLUMN IF NOT EXISTS drive_yards INTEGER NOT NULL DEFAULT 0;ALTER TABLE math_profiles ADD COLUMN IF NOT EXISTS correct_answers INTEGER NOT NULL DEFAULT 0;ALTER TABLE math_profiles ADD COLUMN IF NOT EXISTS questions_answered INTEGER NOT NULL DEFAULT 0;ALTER TABLE math_profiles ADD COLUMN IF NOT EXISTS current_streak INTEGER NOT NULL DEFAULT 0;ALTER TABLE math_profiles ADD COLUMN IF NOT EXISTS best_streak INTEGER NOT NULL DEFAULT 0;ALTER TABLE math_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE math_challenges ADD COLUMN IF NOT EXISTS explanation TEXT NOT NULL DEFAULT '';ALTER TABLE math_challenges ADD COLUMN IF NOT EXISTS difficulty VARCHAR(24) NOT NULL DEFAULT 'Starter';ALTER TABLE math_challenges ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 10;ALTER TABLE math_challenges ADD COLUMN IF NOT EXISTS yards INTEGER NOT NULL DEFAULT 10;ALTER TABLE math_challenges ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();ALTER TABLE math_challenges ADD COLUMN IF NOT EXISTS answered_at TIMESTAMPTZ;
    ALTER TABLE math_weekly_stats ADD COLUMN IF NOT EXISTS week_start DATE NOT NULL DEFAULT CURRENT_DATE;ALTER TABLE math_weekly_stats ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0;ALTER TABLE math_weekly_stats ADD COLUMN IF NOT EXISTS correct_answers INTEGER NOT NULL DEFAULT 0;ALTER TABLE math_weekly_stats ADD COLUMN IF NOT EXISTS questions_answered INTEGER NOT NULL DEFAULT 0;ALTER TABLE math_weekly_stats ADD COLUMN IF NOT EXISTS touchdowns INTEGER NOT NULL DEFAULT 0;`);
  await reconcileMathSchema(pool);
}

// The migration above adds any columns an older Railway database is missing, but
// ADD COLUMN IF NOT EXISTS can't fix a column that already exists at the wrong
// width or type. A challenge id left at VARCHAR(32) by an early schema (ids are
// now 48 hex chars) still overflows on every "choose a play" insert and returns
// a 500. This reconciles those in-place: each step checks information_schema and
// only issues an ALTER when the column actually differs, so it is a cheap no-op
// on an already-correct schema.
async function reconcileMathSchema(pool){
  const columnType=async (table,column)=>(await pool.query(
    `SELECT data_type,character_maximum_length FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`,
    [table,column]
  )).rows[0]||null;
  const widenVarchar=async (table,column,length)=>{
    const info=await columnType(table,column);
    if(info&&info.data_type==='character varying'&&(info.character_maximum_length===null||info.character_maximum_length>=length))return;
    if(!info)return;
    await pool.query(`ALTER TABLE ${table} ALTER COLUMN ${column} TYPE VARCHAR(${length})`);
  };
  await widenVarchar('math_challenges','id',64);
  await widenVarchar('math_challenges','difficulty',24);
  const answer=await columnType('math_challenges','answer');
  if(answer&&answer.data_type!=='numeric'){
    await pool.query('ALTER TABLE math_challenges ALTER COLUMN answer TYPE NUMERIC USING answer::numeric');
  }
}

const { classroomScope:classScopeFor } = require('./classroom-access');

async function rankingData(pool,user){
  const scope=classScopeFor(user);
  scope.params.push(user.id);
  scope.userParam=`$${scope.params.length}`;
  const season=(await pool.query(`SELECT position,total FROM (SELECT p.user_id,RANK() OVER(ORDER BY p.total_xp DESC,p.correct_answers DESC) AS position,COUNT(*) OVER() AS total FROM math_profiles p JOIN users u ON u.id=p.user_id WHERE u.role='student' AND u.active=TRUE ${scope.clause}) ranked WHERE user_id=${scope.userParam}`,scope.params)).rows[0]||null;
  const weekly=(await pool.query(`SELECT position,total FROM (SELECT w.user_id,RANK() OVER(ORDER BY w.xp DESC,w.correct_answers DESC) AS position,COUNT(*) OVER() AS total FROM math_weekly_stats w JOIN users u ON u.id=w.user_id WHERE w.week_start=date_trunc('week',CURRENT_DATE)::date AND u.role='student' AND u.active=TRUE ${scope.clause}) ranked WHERE user_id=${scope.userParam}`,scope.params)).rows[0]||null;
  return {season,weekly};
}

async function profileData(pool,user){
  await pool.query('INSERT INTO math_profiles(user_id) VALUES($1) ON CONFLICT DO NOTHING',[user.id]);
  const profile=(await pool.query('SELECT * FROM math_profiles WHERE user_id=$1',[user.id])).rows[0];
  const scope=classScopeFor(user);
  const [weeklyResult,allTimeResult,rankingsResult]=await Promise.allSettled([
    pool.query(`SELECT u.display_name,u.username,u.selected_team,w.xp,w.correct_answers,w.touchdowns FROM math_weekly_stats w JOIN users u ON u.id=w.user_id WHERE w.week_start=date_trunc('week',CURRENT_DATE)::date AND u.role='student' AND u.active=TRUE ${scope.clause} ORDER BY w.xp DESC,w.correct_answers DESC LIMIT 10`,scope.params),
    pool.query(`SELECT u.display_name,u.username,u.selected_team,p.total_xp,p.touchdowns,p.best_streak FROM math_profiles p JOIN users u ON u.id=p.user_id WHERE u.role='student' AND u.active=TRUE ${scope.clause} ORDER BY p.total_xp DESC,p.correct_answers DESC LIMIT 10`,scope.params),
    rankingData(pool,user)
  ]);
  for(const result of [weeklyResult,allTimeResult,rankingsResult]) if(result.status==='rejected') console.error('Math leaderboard query failed.',result.reason);
  const weekly=weeklyResult.status==='fulfilled'?weeklyResult.value.rows:[],allTime=allTimeResult.status==='fulfilled'?allTimeResult.value.rows:[],rankings=rankingsResult.status==='fulfilled'?rankingsResult.value:null;
  const level=levelFor(Number(profile.total_xp||0)),next=nextLevel(Number(profile.total_xp||0));
  return {profile:{...profile,level:level.name,nextLevel:next?.name||null,xpToNext:next?next.xp-profile.total_xp:0},rankings,weekly,allTime};
}

async function handleMathGame({pool,req,res,path,user,sendJson,readJson}){
  if(!path.startsWith('/api/math-game/'))return false;
  if(!user){sendJson(res,401,{error:'Please sign in.'});return true;}
  if(path==='/api/math-game/profile'&&req.method==='GET'){sendJson(res,200,await profileData(pool,user));return true;}
  if(path==='/api/math-game/challenge'&&req.method==='POST'){
    const body=await readJson(req);
    await pool.query('DELETE FROM math_challenges WHERE user_id=$1 AND answered_at IS NULL',[user.id]);
    const profile=(await pool.query('SELECT p.total_xp,u.math_difficulty_boost FROM users u LEFT JOIN math_profiles p ON p.user_id=u.id WHERE u.id=$1',[user.id])).rows[0];
    const challenge=createQuestion(body.yards,Number(profile?.total_xp||0),Math.random,Number(profile?.math_difficulty_boost||0)),id=crypto.randomBytes(24).toString('hex');
    await pool.query('INSERT INTO math_challenges(id,user_id,question,answer,explanation,difficulty,xp,yards) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,user.id,challenge.question,challenge.answer,challenge.explanation,challenge.difficulty,challenge.xp,challenge.yards]);
    sendJson(res,201,{challenge:{id,question:challenge.question,playName:challenge.playName,difficulty:challenge.difficulty,xp:challenge.xp,yards:challenge.yards}});return true;
  }
  if(path==='/api/math-game/answer'&&req.method==='POST'){
    const body=await readJson(req),result=await pool.query('UPDATE math_challenges SET answered_at=NOW() WHERE id=$1 AND user_id=$2 AND answered_at IS NULL RETURNING *',[String(body.challengeId||''),user.id]);
    const challenge=result.rows[0];if(!challenge){sendJson(res,404,{error:'That question is no longer active.'});return true;}
    const correct=Math.abs(Number(body.answer)-Number(challenge.answer))<0.001;
    await pool.query('INSERT INTO math_profiles(user_id) VALUES($1) ON CONFLICT DO NOTHING',[user.id]);
    const previous=(await pool.query('SELECT * FROM math_profiles WHERE user_id=$1',[user.id])).rows[0];
    const previousLevel=levelFor(Number(previous.total_xp||0));
    const combined=previous.drive_yards+(correct?challenge.yards:0),newTouchdowns=Math.floor(combined/100),driveYards=combined%100,currentStreak=correct?previous.current_streak+1:0;
    await pool.query(`UPDATE math_profiles SET total_xp=total_xp+$2,touchdowns=touchdowns+$3,drive_yards=$4,correct_answers=correct_answers+$5,questions_answered=questions_answered+1,current_streak=$6,best_streak=GREATEST(best_streak,$6),updated_at=NOW() WHERE user_id=$1`,[user.id,correct?challenge.xp:0,newTouchdowns,driveYards,correct?1:0,currentStreak]);
    await pool.query(`INSERT INTO math_weekly_stats(user_id,week_start,xp,correct_answers,questions_answered,touchdowns) VALUES($1,date_trunc('week',CURRENT_DATE)::date,$2,$3,1,$4) ON CONFLICT(user_id,week_start) DO UPDATE SET xp=math_weekly_stats.xp+EXCLUDED.xp,correct_answers=math_weekly_stats.correct_answers+EXCLUDED.correct_answers,questions_answered=math_weekly_stats.questions_answered+1,touchdowns=math_weekly_stats.touchdowns+EXCLUDED.touchdowns`,[user.id,correct?challenge.xp:0,correct?1:0,newTouchdowns]);
    const data=await profileData(pool,user),awardedBadges=await awardMathBadges(pool,user.id,data.profile,{challengeId:challenge.id,correct});
    const levelUp=correct&&data.profile.level!==previousLevel.name?{from:previousLevel.name,to:data.profile.level,totalXp:Number(data.profile.total_xp||0)}:null;
    sendJson(res,200,{correct,correctAnswer:Number(challenge.answer),explanation:challenge.explanation,xpEarned:correct?challenge.xp:0,yardsEarned:correct?challenge.yards:0,touchdown:newTouchdowns>0,levelUp,...data,awardedBadges});return true;
  }
  sendJson(res,404,{error:'Math game endpoint not found.'});return true;
}

module.exports={initMathGame,handleMathGame,levelFor,nextLevel};
