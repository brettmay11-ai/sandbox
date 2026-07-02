const crypto = require('crypto');
const { awardMathBadges } = require('./badges-api');

const TEAMS = ['Bills','Dolphins','Patriots','Jets','Ravens','Bengals','Browns','Steelers','Texans','Colts','Jaguars','Titans','Broncos','Chiefs','Raiders','Chargers','Cowboys','Eagles','Giants','Commanders','Bears','Lions','Packers','Vikings','Falcons','Panthers','Saints','Buccaneers','49ers','Cardinals','Rams','Seahawks'];
const LEVELS = [{name:'Rookie',xp:0},{name:'Starter',xp:250},{name:'Captain',xp:750},{name:'All-Pro',xp:1500},{name:'Hall of Famer',xp:3000}];
const PLAY_CALLS = {
  5:{name:'Quick Slant',difficulty:'Rookie',xp:5,yards:5},
  10:{name:'Curl Route',difficulty:'Starter',xp:10,yards:10},
  15:{name:'Deep Cross',difficulty:'Captain',xp:15,yards:15},
  20:{name:'End Zone Shot',difficulty:'All-Pro',xp:20,yards:20}
};
const pick = values => values[Math.floor(Math.random() * values.length)];
const integer = (min,max) => Math.floor(Math.random() * (max-min+1))+min;
const teamPair = () => { const first=pick(TEAMS); let second=pick(TEAMS); while(second===first)second=pick(TEAMS); return [first,second]; };

function playFor(yards){return PLAY_CALLS[Number(yards)]||PLAY_CALLS[10]}
function playQuestion(play, details){return {...details,playName:play.name,difficulty:play.difficulty,xp:play.xp,yards:play.yards}}

function createQuestion(yards=10) {
  const play=playFor(yards), type=integer(1,4), [a,b] = teamPair();
  if(play.yards===5){
    if(type===1){const x=integer(7,28),y=integer(3,21);return playQuestion(play,{question:`The ${a} scored ${x} points and the ${b} scored ${y}. How many total points were scored?`,answer:x+y,explanation:`${x} + ${y} = ${x+y} total points`});}
    if(type===2){const x=integer(14,35),y=integer(3,x-7);return playQuestion(play,{question:`The ${a} beat the ${b} ${x} to ${y}. What was the winning margin?`,answer:x-y,explanation:`${x} - ${y} = ${x-y} points`});}
    const first=integer(2,9),second=integer(2,9);return playQuestion(play,{question:`A ${a} runner gained ${first} yards, then gained ${second} more. How many yards did the runner gain in all?`,answer:first+second,explanation:`${first} + ${second} = ${first+second} yards`});
  }
  if(play.yards===10){
    if(type===1){const touchdowns=integer(2,5),fieldGoals=integer(1,4),points=touchdowns*7+fieldGoals*3;return playQuestion(play,{question:`The ${a} scored ${touchdowns} touchdowns worth 7 points each and ${fieldGoals} field goals worth 3 points each. How many points did they score?`,answer:points,explanation:`${touchdowns} x 7 = ${touchdowns*7}. ${fieldGoals} x 3 = ${fieldGoals*3}. ${touchdowns*7} + ${fieldGoals*3} = ${points}`});}
    if(type===2){const catches=integer(3,8),yardsPer=pick([4,5,6,7,8,9]);return playQuestion(play,{question:`A ${b} receiver caught ${catches} passes for ${yardsPer} yards each. How many receiving yards is that?`,answer:catches*yardsPer,explanation:`${catches} x ${yardsPer} = ${catches*yardsPer} yards`});}
    const attempts=pick([20,24,28,32]),incomplete=integer(5,12),complete=attempts-incomplete;return playQuestion(play,{question:`A quarterback threw ${attempts} passes and completed ${complete}. How many passes were incomplete?`,answer:incomplete,explanation:`${attempts} - ${complete} = ${incomplete} incomplete passes`});
  }
  if(play.yards===15){
    if(type===1){const games=pick([4,5,6]),average=integer(17,34),total=games*average;return playQuestion(play,{question:`The ${a} scored ${total} points across ${games} games. What was their average points per game?`,answer:average,explanation:`${total} / ${games} = ${average} points per game`});}
    if(type===2){const total=pick([120,135,150,165,180,195]),drives=pick([3,5]);return playQuestion(play,{question:`The ${b} gained ${total} yards on ${drives} equal scoring drives. How many yards did they gain on each drive?`,answer:total/drives,explanation:`${total} / ${drives} = ${total/drives} yards per drive`});}
    const firstHalf=integer(45,95),total=firstHalf+integer(35,90);return playQuestion(play,{question:`A ${a} running back had ${firstHalf} rushing yards at halftime and finished with ${total}. How many yards did the player gain after halftime?`,answer:total-firstHalf,explanation:`${total} - ${firstHalf} = ${total-firstHalf} yards after halftime`});
  }
  if(type===1){const capacity=pick([48000,60000,72000,80000]),percent=pick([25,50,75]),attendance=capacity*percent/100;return playQuestion(play,{question:`A stadium holds ${capacity.toLocaleString()} fans. If it is ${percent}% full, how many fans are there?`,answer:attendance,explanation:`${percent}% of ${capacity.toLocaleString()} = ${attendance.toLocaleString()} fans`});}
  if(type===2){const passing=pick([{attempts:24,top:3,bottom:4},{attempts:28,top:2,bottom:4},{attempts:32,top:5,bottom:8},{attempts:36,top:3,bottom:4},{attempts:40,top:5,bottom:8}]),complete=passing.attempts/passing.bottom*passing.top;return playQuestion(play,{question:`A ${a} quarterback completed ${passing.top}/${passing.bottom} of ${passing.attempts} passes. How many passes were completed?`,answer:complete,explanation:`${passing.attempts} / ${passing.bottom} = ${passing.attempts/passing.bottom}. ${passing.attempts/passing.bottom} x ${passing.top} = ${complete}`});}
  const distance=pick([750,1000,1250,1500,1750,2000]),speed=250,hours=distance/speed,minutes=hours*60;return playQuestion(play,{question:`The ${b} fly ${distance.toLocaleString()} miles at about ${speed} miles per hour. How many minutes is the flight?`,answer:minutes,explanation:`${distance.toLocaleString()} / ${speed} = ${hours} hours. ${hours} x 60 = ${minutes} minutes`});
}

function levelFor(xp){return [...LEVELS].reverse().find(level=>xp>=level.xp)||LEVELS[0]}
function nextLevel(xp){return LEVELS.find(level=>level.xp>xp)||null}

async function initMathGame(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS users(id BIGSERIAL PRIMARY KEY,username VARCHAR(32) UNIQUE NOT NULL,display_name VARCHAR(80) NOT NULL,pin_hash TEXT NOT NULL,role VARCHAR(12) NOT NULL CHECK(role IN('teacher','student')),selected_team VARCHAR(12),active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),last_login_at TIMESTAMPTZ);CREATE TABLE IF NOT EXISTS math_profiles(user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,total_xp INTEGER NOT NULL DEFAULT 0,touchdowns INTEGER NOT NULL DEFAULT 0,drive_yards INTEGER NOT NULL DEFAULT 0,correct_answers INTEGER NOT NULL DEFAULT 0,questions_answered INTEGER NOT NULL DEFAULT 0,current_streak INTEGER NOT NULL DEFAULT 0,best_streak INTEGER NOT NULL DEFAULT 0,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());CREATE TABLE IF NOT EXISTS math_challenges(id VARCHAR(64) PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,question TEXT NOT NULL,answer NUMERIC NOT NULL,explanation TEXT NOT NULL,difficulty VARCHAR(24) NOT NULL,xp INTEGER NOT NULL,yards INTEGER NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),answered_at TIMESTAMPTZ);CREATE TABLE IF NOT EXISTS math_weekly_stats(user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,week_start DATE NOT NULL,xp INTEGER NOT NULL DEFAULT 0,correct_answers INTEGER NOT NULL DEFAULT 0,questions_answered INTEGER NOT NULL DEFAULT 0,touchdowns INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,week_start));CREATE INDEX IF NOT EXISTS math_challenges_user_idx ON math_challenges(user_id,created_at DESC);`);
}

async function rankingData(pool,userId){
  const season=(await pool.query(`SELECT position,total FROM (SELECT p.user_id,RANK() OVER(ORDER BY p.total_xp DESC,p.correct_answers DESC) AS position,COUNT(*) OVER() AS total FROM math_profiles p JOIN users u ON u.id=p.user_id WHERE u.role='student' AND u.active=TRUE) ranked WHERE user_id=$1`,[userId])).rows[0]||null;
  const weekly=(await pool.query(`SELECT position,total FROM (SELECT w.user_id,RANK() OVER(ORDER BY w.xp DESC,w.correct_answers DESC) AS position,COUNT(*) OVER() AS total FROM math_weekly_stats w JOIN users u ON u.id=w.user_id WHERE w.week_start=date_trunc('week',CURRENT_DATE)::date AND u.role='student' AND u.active=TRUE) ranked WHERE user_id=$1`,[userId])).rows[0]||null;
  return {season,weekly};
}

async function profileData(pool,userId){
  await pool.query('INSERT INTO math_profiles(user_id) VALUES($1) ON CONFLICT DO NOTHING',[userId]);
  const profile=(await pool.query('SELECT * FROM math_profiles WHERE user_id=$1',[userId])).rows[0];
  const weekly=(await pool.query(`SELECT u.display_name,u.username,u.selected_team,w.xp,w.correct_answers,w.touchdowns FROM math_weekly_stats w JOIN users u ON u.id=w.user_id WHERE w.week_start=date_trunc('week',CURRENT_DATE)::date AND u.role='student' AND u.active=TRUE ORDER BY w.xp DESC,w.correct_answers DESC LIMIT 10`)).rows;
  const allTime=(await pool.query(`SELECT u.display_name,u.username,u.selected_team,p.total_xp,p.touchdowns,p.best_streak FROM math_profiles p JOIN users u ON u.id=p.user_id WHERE u.role='student' AND u.active=TRUE ORDER BY p.total_xp DESC,p.correct_answers DESC LIMIT 10`)).rows;
  const level=levelFor(profile.total_xp),next=nextLevel(profile.total_xp),rankings=await rankingData(pool,userId);
  return {profile:{...profile,level:level.name,nextLevel:next?.name||null,xpToNext:next?next.xp-profile.total_xp:0},rankings,weekly,allTime};
}

async function handleMathGame({pool,req,res,path,user,sendJson,readJson}){
  if(!path.startsWith('/api/math-game/'))return false;
  if(!user){sendJson(res,401,{error:'Please sign in.'});return true;}
  if(path==='/api/math-game/profile'&&req.method==='GET'){sendJson(res,200,await profileData(pool,user.id));return true;}
  if(path==='/api/math-game/challenge'&&req.method==='POST'){
    const body=await readJson(req);
    await pool.query('DELETE FROM math_challenges WHERE user_id=$1 AND answered_at IS NULL',[user.id]);
    const challenge=createQuestion(body.yards),id=crypto.randomBytes(24).toString('hex');
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
    const data=await profileData(pool,user.id),awardedBadges=await awardMathBadges(pool,user.id,data.profile,{challengeId:challenge.id,correct});
    const levelUp=correct&&data.profile.level!==previousLevel.name?{from:previousLevel.name,to:data.profile.level,totalXp:Number(data.profile.total_xp||0)}:null;
    sendJson(res,200,{correct,correctAnswer:Number(challenge.answer),explanation:challenge.explanation,xpEarned:correct?challenge.xp:0,yardsEarned:correct?challenge.yards:0,touchdown:newTouchdowns>0,levelUp,...data,awardedBadges});return true;
  }
  sendJson(res,404,{error:'Math game endpoint not found.'});return true;
}

module.exports={initMathGame,handleMathGame,levelFor,nextLevel};
