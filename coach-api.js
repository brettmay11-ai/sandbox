const crypto = require('crypto');
const { awardCoachBadges } = require('./badges-api');

const TEAM_NAMES = { ARI:'Arizona Cardinals', ATL:'Atlanta Falcons', BAL:'Baltimore Ravens', BUF:'Buffalo Bills', CAR:'Carolina Panthers', CHI:'Chicago Bears', CIN:'Cincinnati Bengals', CLE:'Cleveland Browns', DAL:'Dallas Cowboys', DEN:'Denver Broncos', DET:'Detroit Lions', GB:'Green Bay Packers', HOU:'Houston Texans', IND:'Indianapolis Colts', JAX:'Jacksonville Jaguars', KC:'Kansas City Chiefs', LV:'Las Vegas Raiders', LAC:'Los Angeles Chargers', LAR:'Los Angeles Rams', MIA:'Miami Dolphins', MIN:'Minnesota Vikings', NE:'New England Patriots', NO:'New Orleans Saints', NYG:'New York Giants', NYJ:'New York Jets', PHI:'Philadelphia Eagles', PIT:'Pittsburgh Steelers', SF:'San Francisco 49ers', SEA:'Seattle Seahawks', TB:'Tampa Bay Buccaneers', TEN:'Tennessee Titans', WAS:'Washington Commanders' };
const pick = values => values[Math.floor(Math.random() * values.length)];
const normalize = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

const SAFETY_RULES = [
  { category:'self_harm', severity:'high', patterns:[/\b(kill myself|suicide|end my life|hurt myself|self harm|cut myself)\b/i], message:'This sounds serious, so I let your teacher know right away. Please talk to your teacher or another trusted adult now.' },
  { category:'threat', severity:'high', patterns:[/\b(kill you|hurt you|shoot|stab|bomb|bring a gun|beat you up|threaten)\b/i], message:'I can only help with safe classroom work. I let your teacher know this needs a quick review.' },
  { category:'sexual_content', severity:'high', patterns:[/\b(sex|porn|nude|naked|boobs|dick|penis|vagina)\b/i], message:'I can only help with your NFL project and class activities. I let your teacher know this needs a quick review.' },
  { category:'bullying', severity:'medium', patterns:[/\b(idiot|stupid|loser|shut up|hate you|ugly|fat|dumb|moron|retard)\b/i], message:'Let’s keep this respectful. I let your teacher know this message needs a quick review.' },
  { category:'profanity', severity:'medium', patterns:[/\b(fuck|shit|bitch|asshole|damn|crap)\b/i], message:'Let’s keep our language classroom-ready. I let your teacher know this needs a quick review.' },
  { category:'personal_info', severity:'medium', patterns:[/\b(address|phone number|password|email me|where do you live|my street|my house)\b/i], message:'For privacy, do not share personal information here. I let your teacher know this needs a quick review.' }
];

const ALLOWED_TOPICS = [
  /\b(nfl|football|team|coach|player|stadium|touchdown|field|quarterback|running back|defense|defensive|offense|offensive|yards?|score|game|season|schedule|opponent|division|conference|afc|nfc|super bowl|playoff|roster|stats?|leader|passing|rushing|receiving|sacks?|interceptions?)\b/i,
  /\b(math|percent|percentage|multiply|divide|add|subtract|fraction|decimal|average|compare|difference|greater|less|round|estimate|graph|table|data|word problem|yards?|miles?|capacity|distance|time zone|travel)\b/i,
  /\b(write|writing|sentence|paragraph|essay|revise|revision|brainstorm|opening|topic sentence|conclusion|evidence|detail|claim|reason|capital|punctuation|grammar|spelling)\b/i,
  /\b(city|state|map|geography|capital|landmark|population|region|research|social studies|culture|climate|weather|economy|government|history|location|place)\b/i,
  /\b(help|hint|explain|quiz|challenge|focus|page|dashboard|profile|badge|badges|xp|level|teacher|class|assignment|activity|question|answer|study|learn|what does|how do|why does)\b/i,
  /\b(tcu|horned frogs|college|university|school colors|mascot)\b/i
];

const OFF_TOPIC_PATTERNS = [
  /\b(roblox|minecraft|fortnite|youtube|tiktok|snapchat|instagram|netflix|movie|movies|song|lyrics|celebrity|dating|girlfriend|boyfriend|crush|shopping|amazon|video game|video games)\b/i,
  /\b(tell me a joke|make me laugh|random question|not school|not about school)\b/i
];

function classifySafety(message) {
  const text = String(message || '').trim();
  if (!text) return { blocked:false };
  for (const rule of SAFETY_RULES) {
    if (rule.patterns.some(pattern => pattern.test(text))) return { blocked:true, category:rule.category, severity:rule.severity, message:rule.message };
  }
  const mentionsTeam = Object.entries(TEAM_NAMES).some(([abbr, name]) => {
    const terms = [abbr, ...name.split(/\s+/)].filter(term => term.length >= 3 && !['the', 'new', 'san', 'los'].includes(term.toLowerCase()));
    return terms.some(term => new RegExp('\\b' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(text));
  });
  const classroomRelated = mentionsTeam || ALLOWED_TOPICS.some(pattern => pattern.test(text));
  const clearlyOffTopic = OFF_TOPIC_PATTERNS.some(pattern => pattern.test(text));
  if (text.length > 8 && clearlyOffTopic && !classroomRelated) {
    return { blocked:true, category:'off_topic', severity:'low', message:'I can help with your NFL project, your team, or today’s class activity. Try asking about football, math, writing, geography, or your teacher’s focus.' };
  }
  return { blocked:false };
}

async function initCoach(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coach_challenges(
      id VARCHAR(64) PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question TEXT NOT NULL,
      answer VARCHAR(80) NOT NULL,
      explanation TEXT NOT NULL,
      xp INTEGER NOT NULL DEFAULT 5,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      answered_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS coach_question_log(
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      page VARCHAR(32) NOT NULL,
      question TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS coach_safety_flags(
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      page VARCHAR(32) NOT NULL,
      message TEXT NOT NULL,
      category VARCHAR(40) NOT NULL,
      severity VARCHAR(16) NOT NULL,
      reviewed_at TIMESTAMPTZ,
      reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE coach_question_log ALTER COLUMN user_id DROP NOT NULL;
    CREATE INDEX IF NOT EXISTS coach_question_created_idx ON coach_question_log(created_at DESC);
    CREATE INDEX IF NOT EXISTS coach_safety_flags_review_idx ON coach_safety_flags(reviewed_at,created_at DESC);
  `);
}

function challengeFor(user) {
  const team = TEAM_NAMES[user.selected_team];
  const general = [
    { question:'How many teams are in the NFL?', answer:'32', explanation:'The NFL has 32 teams.' },
    { question:'How many conferences are in the NFL?', answer:'2', explanation:'The NFL has two conferences: the AFC and NFC.' },
    { question:'How many yards long is the football field between the goal lines?', answer:'100', explanation:'The field is 100 yards from goal line to goal line.' },
    { question:'How many points is a touchdown worth?', answer:'6', explanation:'A touchdown is worth 6 points.' }
  ];
  if (team) general.push({ question:`What is the abbreviation for your team, the ${team}?`, answer:user.selected_team, explanation:`The ${team} use the abbreviation ${user.selected_team}.` });
  return pick(general);
}

async function saveSafetyFlag(pool, user, page, message, safety) {
  const result = await pool.query(
    'INSERT INTO coach_safety_flags(user_id,page,message,category,severity) VALUES($1,$2,$3,$4,$5) RETURNING id,category,severity',
    [user.id, String(page || 'home').slice(0, 32), String(message || '').trim().slice(0, 1000), safety.category, safety.severity]
  );
  return result.rows[0];
}

function safetyPayload(flag, safety) {
  return { safety:{ blocked:true, category:flag.category, severity:flag.severity, message:safety.message } };
}

async function safetyFlags(pool) {
  const rows = (await pool.query(`
    SELECT f.id,f.page,f.message,f.category,f.severity,f.reviewed_at,f.created_at,u.display_name,u.username,u.selected_team
    FROM coach_safety_flags f
    LEFT JOIN users u ON u.id=f.user_id
    ORDER BY f.reviewed_at NULLS FIRST,f.created_at DESC
    LIMIT 50
  `)).rows;
  const unreadCount = Number((await pool.query('SELECT COUNT(*)::int AS count FROM coach_safety_flags WHERE reviewed_at IS NULL')).rows[0]?.count || 0);
  return { flags:rows, unreadCount };
}

async function handleCoach({ pool, req, res, path, user, sendJson, readJson }) {
  if (!path.startsWith('/api/coach/')) return false;
  if (!user) { sendJson(res, 401, { error:'Please sign in.' }); return true; }

  if (path === '/api/coach/context' && req.method === 'GET') {
    const setting = (await pool.query("SELECT setting_value FROM classroom_settings WHERE setting_key='coach_focus'")).rows[0]?.setting_value || null;
    sendJson(res, 200, { focus:setting, assignedTeam:user.selected_team || null });
    return true;
  }

  if (path === '/api/coach/focus' && req.method === 'PATCH') {
    if (user.role !== 'teacher') { sendJson(res, 403, { error:'Teacher access required.' }); return true; }
    const body = await readJson(req);
    const focus = { prompt:String(body.prompt || '').trim().slice(0, 500) };
    await pool.query("INSERT INTO classroom_settings(setting_key,setting_value,updated_by) VALUES('coach_focus',$1,$2) ON CONFLICT(setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_by=EXCLUDED.updated_by,updated_at=NOW()", [focus, user.id]);
    sendJson(res, 200, { focus });
    return true;
  }

  if (path === '/api/coach/questions' && req.method === 'GET') {
    if (user.role !== 'teacher') { sendJson(res, 403, { error:'Teacher access required.' }); return true; }
    const questions = (await pool.query(`SELECT question,COUNT(*)::int AS count,MAX(created_at) AS last_asked FROM coach_question_log WHERE created_at>NOW()-INTERVAL '30 days' GROUP BY question ORDER BY count DESC,last_asked DESC LIMIT 10`)).rows;
    sendJson(res, 200, { questions });
    return true;
  }

  if (path === '/api/coach/safety-flags' && req.method === 'GET') {
    if (user.role !== 'teacher') { sendJson(res, 403, { error:'Teacher access required.' }); return true; }
    sendJson(res, 200, await safetyFlags(pool));
    return true;
  }

  const reviewMatch = path.match(/^\/api\/coach\/safety-flags\/(\d+)\/review$/);
  if (reviewMatch && req.method === 'PATCH') {
    if (user.role !== 'teacher') { sendJson(res, 403, { error:'Teacher access required.' }); return true; }
    await pool.query('UPDATE coach_safety_flags SET reviewed_at=NOW(),reviewed_by=$2 WHERE id=$1', [reviewMatch[1], user.id]);
    sendJson(res, 200, { ok:true, ...(await safetyFlags(pool)) });
    return true;
  }

  if (path === '/api/coach/log' && req.method === 'POST') {
    const body = await readJson(req);
    const question = String(body.question || '').trim().slice(0, 240);
    const page = String(body.page || 'home').slice(0, 32);
    const safety = classifySafety(question);
    if (safety.blocked) {
      const flag = await saveSafetyFlag(pool, user, page, question, safety);
      sendJson(res, 200, safetyPayload(flag, safety));
      return true;
    }
    if (question) await pool.query('INSERT INTO coach_question_log(user_id,page,question) VALUES($1,$2,$3)', [user.id, page, question]);
    sendJson(res, 201, { ok:true });
    return true;
  }

  if (path === '/api/coach/challenge' && req.method === 'POST') {
    await pool.query('DELETE FROM coach_challenges WHERE user_id=$1 AND answered_at IS NULL', [user.id]);
    const challenge = challengeFor(user);
    const id = crypto.randomBytes(20).toString('hex');
    await pool.query('INSERT INTO coach_challenges(id,user_id,question,answer,explanation) VALUES($1,$2,$3,$4,$5)', [id, user.id, challenge.question, challenge.answer, challenge.explanation]);
    sendJson(res, 201, { challenge:{ id, question:challenge.question, xp:5 } });
    return true;
  }

  if (path === '/api/coach/answer' && req.method === 'POST') {
    const body = await readJson(req);
    const answer = String(body.answer || '').trim().slice(0, 240);
    const safety = classifySafety(answer);
    if (safety.blocked) {
      const flag = await saveSafetyFlag(pool, user, 'coach_challenge', answer, safety);
      sendJson(res, 200, safetyPayload(flag, safety));
      return true;
    }
    const result = await pool.query('UPDATE coach_challenges SET answered_at=NOW() WHERE id=$1 AND user_id=$2 AND answered_at IS NULL RETURNING *', [String(body.challengeId || ''), user.id]);
    const challenge = result.rows[0];
    if (!challenge) { sendJson(res, 404, { error:'That coach challenge is no longer active.' }); return true; }
    const correct = normalize(answer) === normalize(challenge.answer);
    const xp = correct ? challenge.xp : 0;
    await pool.query('INSERT INTO math_profiles(user_id) VALUES($1) ON CONFLICT DO NOTHING', [user.id]);
    if (correct) {
      await pool.query('UPDATE math_profiles SET total_xp=total_xp+$2,updated_at=NOW() WHERE user_id=$1', [user.id, xp]);
      await pool.query(`INSERT INTO math_weekly_stats(user_id,week_start,xp) VALUES($1,date_trunc('week',CURRENT_DATE)::date,$2) ON CONFLICT(user_id,week_start) DO UPDATE SET xp=math_weekly_stats.xp+EXCLUDED.xp`, [user.id, xp]);
    }
    const awardedBadges = await awardCoachBadges(pool, user.id, { correct }, { challengeId:challenge.id });
    sendJson(res, 200, { correct, xpEarned:xp, correctAnswer:challenge.answer, explanation:challenge.explanation, awardedBadges });
    return true;
  }

  sendJson(res, 404, { error:'Coach endpoint not found.' });
  return true;
}

module.exports = { initCoach, handleCoach, classifySafety };
