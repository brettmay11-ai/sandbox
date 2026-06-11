const crypto = require('crypto');

const TEAMS = ['Bills','Dolphins','Patriots','Jets','Ravens','Bengals','Browns','Steelers','Texans','Colts','Jaguars','Titans','Broncos','Chiefs','Raiders','Chargers','Cowboys','Eagles','Giants','Commanders','Bears','Lions','Packers','Vikings','Falcons','Panthers','Saints','Buccaneers','49ers','Cardinals','Rams','Seahawks'];
const LEVELS = [{name:'Rookie',xp:0},{name:'Starter',xp:250},{name:'Captain',xp:750},{name:'All-Pro',xp:1500},{name:'Hall of Famer',xp:3000}];
const pick = values => values[Math.floor(Math.random() * values.length)];
const integer = (min,max) => Math.floor(Math.random() * (max-min+1))+min;
const teamPair = () => { const first=pick(TEAMS); let second=pick(TEAMS); while(second===first)second=pick(TEAMS); return [first,second]; };

function createQuestion() {
  const type = integer(1,6), [a,b] = teamPair();
  if(type===1){const x=integer(14,45),y=integer(3,x-1);return {question:`The ${a} scored ${x} points and the ${b} scored ${y}. What was the winning margin?`,answer:x-y,explanation:`${x} - ${y} = ${x-y} points`,difficulty:'Rookie',xp:10,yards:10};}
  if(type===2){const x=integer(14,42),y=integer(10,38);return {question:`The ${a} scored ${x} points and the ${b} scored ${y}. How many total points were scored?`,answer:x+y,explanation:`${x} + ${y} = ${x+y} total points`,difficulty:'Rookie',xp:10,yards:10};}
  if(type===3){const games=pick([4,5,6,8]),average=integer(17,34),total=games*average;return {question:`The ${a} scored ${total} points across ${games} games. What was their average points per game?`,answer:average,explanation:`${total} / ${games} = ${average} points per game`,difficulty:'Starter',xp:15,yards:15};}
  if(type===4){const distance=pick([500,750,1000,1250,1500,1750,2000,2250,2500]);const minutes=Math.round(distance/500*60);return {question:`The ${a} travel ${distance.toLocaleString()} miles at 500 miles per hour. About how many minutes is the flight?`,answer:minutes,explanation:`${distance.toLocaleString()} / 500 = ${distance/500} hours. ${distance/500} x 60 = ${minutes} minutes.`,difficulty:'Captain',xp:20,yards:20};}
  if(type===5){const attempts=pick([20,25,40,50]),percent=pick([50,60,70,80]),complete=attempts*percent/100;return {question:`The ${a} quarterback completed ${complete} of ${attempts} passes. What was the completion percentage? Enter the number without the percent sign.`,answer:percent,explanation:`${complete} / ${attempts} x 100 = ${percent}%`,difficulty:'Captain',xp:20,yards:20};}
  const capacity=pick([60000,65000,70000,75000,80000]),percent=pick([50,60,75,80,90]),attendance=capacity*percent/100;return {question:`A stadium holds ${capacity.toLocaleString()} fans. If ${attendance.toLocaleString()} attend, what percent of the stadium is full? Enter the number without the percent sign.`,answer:percent,explanation:`${attendance.toLocaleString()} / ${capacity.toLocaleString()} x 100 = ${percent}%`,difficulty:'All-Pro',xp:30,yards:30};
}

function levelFor(xp){return [...LEVELS].reverse().find(level=>xp>=level.xp)||LEVELS[0]}
function nextLevel(xp){return LEVELS.find(level=>level.xp>xp)||null}

async function initMathGame(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS users(id BIGSERIAL PRIMARY KEY,username VARCHAR(32) UNIQUE NOT NULL,display_name VARCHAR(80) NOT NULL,pin_hash TEXT NOT NULL,role VARCHAR(12) NOT NULL CHECK(role IN('teacher','student')),selected_team VARCHAR(12),active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),last_login_at TIMESTAMPTZ);CREATE TABLE IF NOT EXISTS math_profiles(user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,total_xp INTEGER NOT NULL DEFAULT 0,touchdowns INTEGER NOT NULL DEFAULT 0,drive_yards INTEGER NOT NULL DEFAULT 0,correct_answers INTEGER NOT NULL DEFAULT 0,questions_answered INTEGER NOT NULL DEFAULT 0,current_streak INTEGER NOT NULL DEFAULT 0,best_streak INTEGER NOT NULL DEFAULT 0,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());CREATE TABLE IF NOT EXISTS math_challenges(id VARCHAR(64) PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,question TEXT NOT NULL,answer NUMERIC NOT NULL,explanation TEXT NOT NULL,difficulty VARCHAR(24) NOT NULL,xp INTEGER NOT NULL,yards INTEGER NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),answered_at TIMESTAMPTZ);CREATE TABLE IF NOT EXISTS math_weekly_stats(user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,week_start DATE NOT NULL,xp INTEGER NOT NULL DEFAULT 0,correct_answers INTEGER NOT NULL DEFAULT 0,questions_answered INTEGER NOT NULL DEFAULT 0,touchdowns INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,week_start));CREATE INDEX IF NOT EXISTS math_challenges_user_idx ON math_challenges(user_id,created_at DESC);`);
}

async function profileData(pool,userId){
  await pool.query('INSERT INTO math_profiles(user_id) VALUES($1) ON CONFLICT DO NOTHING',[userId]);
  const profile=(await pool.query('SELECT * FROM math_profiles WHERE user_id=$1',[userId])).rows[0];
  const weekly=(await pool.query(`SELECT u.display_name,u.username,u.selected_team,w.xp,w.correct_answers,w.touchdowns FROM math_weekly_stats w JOIN users u ON u.id=w.user_id WHERE w.week_start=date_trunc('week',CURRENT_DATE)::date AND u.role='student' AND u.active=TRUE ORDER BY w.xp DESC,w.correct_answers DESC LIMIT 10`)).rows;
  const allTime=(await pool.query(`SELECT u.display_name,u.username,u.selected_team,p.total_xp,p.touchdowns,p.best_streak FROM math_profiles p JOIN users u ON u.id=p.user_id WHERE u.role='student' AND u.active=TRUE ORDER BY p.total_xp DESC,p.correct_answers DESC LIMIT 10`)).rows;
  const level=levelFor(profile.total_xp),next=nextLevel(profile.total_xp);
  return {profile:{...profile,level:level.name,nextLevel:next?.name||null,xpToNext:next?next.xp-profile.total_xp:0},weekly,allTime};
}

async function handleMathGame({pool,req,res,path,user,sendJson,readJson}){
  if(!path.startsWith('/api/math-game/'))return false;
  if(!user){sendJson(res,401,{error:'Please sign in.'});return true;}
  if(path==='/api/math-game/profile'&&req.method==='GET'){sendJson(res,200,await profileData(pool,user.id));return true;}
  if(path==='/api/math-game/challenge'&&req.method==='POST'){
    await pool.query('DELETE FROM math_challenges WHERE user_id=$1 AND answered_at IS NULL',[user.id]);
    const challenge=createQuestion(),id=crypto.randomBytes(24).toString('hex');
    await pool.query('INSERT INTO math_challenges(id,user_id,question,answer,explanation,difficulty,xp,yards) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,user.id,challenge.question,challenge.answer,challenge.explanation,challenge.difficulty,challenge.xp,challenge.yards]);
    sendJson(res,201,{challenge:{id,question:challenge.question,difficulty:challenge.difficulty,xp:challenge.xp,yards:challenge.yards}});return true;
  }
  if(path==='/api/math-game/answer'&&req.method==='POST'){
    const body=await readJson(req),result=await pool.query('UPDATE math_challenges SET answered_at=NOW() WHERE id=$1 AND user_id=$2 AND answered_at IS NULL RETURNING *',[String(body.challengeId||''),user.id]);
    const challenge=result.rows[0];if(!challenge){sendJson(res,404,{error:'That question is no longer active.'});return true;}
    const correct=Math.abs(Number(body.answer)-Number(challenge.answer))<0.001;
    await pool.query('INSERT INTO math_profiles(user_id) VALUES($1) ON CONFLICT DO NOTHING',[user.id]);
    const previous=(await pool.query('SELECT * FROM math_profiles WHERE user_id=$1',[user.id])).rows[0];
    const combined=previous.drive_yards+(correct?challenge.yards:0),newTouchdowns=Math.floor(combined/100),driveYards=combined%100,currentStreak=correct?previous.current_streak+1:0;
    await pool.query(`UPDATE math_profiles SET total_xp=total_xp+$2,touchdowns=touchdowns+$3,drive_yards=$4,correct_answers=correct_answers+$5,questions_answered=questions_answered+1,current_streak=$6,best_streak=GREATEST(best_streak,$6),updated_at=NOW() WHERE user_id=$1`,[user.id,correct?challenge.xp:0,newTouchdowns,driveYards,correct?1:0,currentStreak]);
    await pool.query(`INSERT INTO math_weekly_stats(user_id,week_start,xp,correct_answers,questions_answered,touchdowns) VALUES($1,date_trunc('week',CURRENT_DATE)::date,$2,$3,1,$4) ON CONFLICT(user_id,week_start) DO UPDATE SET xp=math_weekly_stats.xp+EXCLUDED.xp,correct_answers=math_weekly_stats.correct_answers+EXCLUDED.correct_answers,questions_answered=math_weekly_stats.questions_answered+1,touchdowns=math_weekly_stats.touchdowns+EXCLUDED.touchdowns`,[user.id,correct?challenge.xp:0,correct?1:0,newTouchdowns]);
    sendJson(res,200,{correct,correctAnswer:Number(challenge.answer),explanation:challenge.explanation,xpEarned:correct?challenge.xp:0,yardsEarned:correct?challenge.yards:0,touchdown:newTouchdowns>0,...await profileData(pool,user.id)});return true;
  }
  sendJson(res,404,{error:'Math game endpoint not found.'});return true;
}

module.exports={initMathGame,handleMathGame};
