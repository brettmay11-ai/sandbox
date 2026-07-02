const { awardWritingBadges } = require('./badges-api');

const ACTIVITIES = {
  postgame:{ label:'Postgame Reporter', xp:50 },
  prediction:{ label:'Make Your Prediction', xp:40 },
  journal:{ label:'Season Journal', xp:30 }
};
const SUBMITTED_STATUSES = ['submitted', 'revision', 'complete', 'reviewed'];
const clean = (value, max) => String(value || '').trim().slice(0, max);
const wordCount = value => clean(value, 12000).split(/\s+/).filter(Boolean).length;

async function initWriting(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS writing_entries(
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      activity VARCHAR(24) NOT NULL,
      title VARCHAR(120) NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
      status VARCHAR(16) NOT NULL DEFAULT 'draft',
      xp_awarded INTEGER NOT NULL DEFAULT 0,
      teacher_feedback TEXT NOT NULL DEFAULT '',
      submitted_at TIMESTAMPTZ,
      reviewed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id,activity)
    );
    CREATE INDEX IF NOT EXISTS writing_entries_status_idx ON writing_entries(status,updated_at DESC);
  `);
}

async function profile(pool, userId) {
  const entries = (await pool.query(
    'SELECT id,activity,title,content,checklist,status,xp_awarded,teacher_feedback,submitted_at,reviewed_at,updated_at FROM writing_entries WHERE user_id=$1 ORDER BY updated_at DESC',
    [userId]
  )).rows;
  const leaderboard = (await pool.query(`
    SELECT u.display_name,u.username,u.selected_team,COALESCE(SUM(w.xp_awarded),0)::int AS writing_xp,
      COUNT(*) FILTER(WHERE w.status IN('submitted','revision','complete','reviewed'))::int AS submissions
    FROM users u
    LEFT JOIN writing_entries w ON w.user_id=u.id
    WHERE u.role='student' AND u.active=TRUE
    GROUP BY u.id
    ORDER BY writing_xp DESC,submissions DESC,u.display_name
    LIMIT 10
  `)).rows;
  return {
    entries,
    writingXp:entries.reduce((sum, row) => sum + Number(row.xp_awarded || 0), 0),
    submissions:entries.filter(row => SUBMITTED_STATUSES.includes(row.status)).length,
    returned:entries.filter(row => row.status === 'revision').length,
    completed:entries.filter(row => row.status === 'complete' || row.status === 'reviewed').length,
    leaderboard
  };
}

function entryPayload(body) {
  return {
    activity:clean(body.activity, 24),
    title:clean(body.title, 120),
    content:clean(body.content, 12000),
    checklist:{
      capitals:Boolean(body.checklist?.capitals),
      punctuation:Boolean(body.checklist?.punctuation),
      evidence:Boolean(body.checklist?.evidence),
      sentences:Boolean(body.checklist?.sentences)
    }
  };
}

async function handleWriting({ pool, req, res, path, user, sendJson, readJson }) {
  if (!path.startsWith('/api/writing/') && !path.startsWith('/api/teacher/writing')) return false;
  if (!user) { sendJson(res, 401, { error:'Please sign in.' }); return true; }

  if (path === '/api/writing/profile' && req.method === 'GET') {
    sendJson(res, 200, await profile(pool, user.id));
    return true;
  }

  if (path === '/api/writing/save' && req.method === 'POST') {
    const data = entryPayload(await readJson(req));
    if (!ACTIVITIES[data.activity]) { sendJson(res, 400, { error:'Choose a writing activity.' }); return true; }
    const existing = (await pool.query('SELECT status FROM writing_entries WHERE user_id=$1 AND activity=$2', [user.id, data.activity])).rows[0];
    if (existing?.status === 'submitted') {
      sendJson(res, 409, { error:'Your writing is with your teacher right now. You can edit again after feedback comes back.' });
      return true;
    }
    if (existing?.status === 'complete' || existing?.status === 'reviewed') {
      sendJson(res, 409, { error:'This writing piece is marked complete. Ask your teacher before changing it.' });
      return true;
    }
    const result = await pool.query(`
      INSERT INTO writing_entries(user_id,activity,title,content,checklist)
      VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(user_id,activity) DO UPDATE SET
        title=EXCLUDED.title,
        content=EXCLUDED.content,
        checklist=EXCLUDED.checklist,
        status=CASE WHEN writing_entries.status='revision' THEN 'draft' ELSE writing_entries.status END,
        updated_at=NOW()
      RETURNING *
    `, [user.id, data.activity, data.title, data.content, data.checklist]);
    sendJson(res, 200, { entry:result.rows[0], message:existing?.status === 'revision' ? 'Revision draft saved.' : 'Draft saved.' });
    return true;
  }

  if (path === '/api/writing/revise' && req.method === 'POST') {
    const body = await readJson(req);
    const activity = clean(body.activity, 24);
    if (!ACTIVITIES[activity]) { sendJson(res, 400, { error:'Choose a writing activity.' }); return true; }
    const result = await pool.query(`
      UPDATE writing_entries
      SET status='draft',updated_at=NOW()
      WHERE user_id=$1 AND activity=$2 AND status='revision'
      RETURNING *
    `, [user.id, activity]);
    if (!result.rowCount) { sendJson(res, 404, { error:'No returned writing is ready to revise.' }); return true; }
    sendJson(res, 200, { entry:result.rows[0], message:'Revision started. Use your teacher feedback, then resubmit when ready.' });
    return true;
  }

  if (path === '/api/writing/submit' && req.method === 'POST') {
    const data = entryPayload(await readJson(req));
    const info = ACTIVITIES[data.activity];
    if (!info) { sendJson(res, 400, { error:'Choose a writing activity.' }); return true; }
    if (wordCount(data.content) < 40) { sendJson(res, 400, { error:'Write at least 40 words before submitting.' }); return true; }
    if (Object.values(data.checklist).some(value => !value)) { sendJson(res, 400, { error:'Complete the writing checklist before submitting.' }); return true; }
    const existing = (await pool.query('SELECT status FROM writing_entries WHERE user_id=$1 AND activity=$2', [user.id, data.activity])).rows[0];
    if (existing?.status === 'submitted') {
      sendJson(res, 409, { error:'This writing is already waiting for teacher feedback.' });
      return true;
    }
    if (existing?.status === 'complete' || existing?.status === 'reviewed') {
      sendJson(res, 409, { error:'This writing piece is already complete.' });
      return true;
    }
    const result = await pool.query(`
      INSERT INTO writing_entries(user_id,activity,title,content,checklist,status,xp_awarded,submitted_at)
      VALUES($1,$2,$3,$4,$5,'submitted',$6,NOW())
      ON CONFLICT(user_id,activity) DO UPDATE SET
        title=EXCLUDED.title,
        content=EXCLUDED.content,
        checklist=EXCLUDED.checklist,
        status='submitted',
        xp_awarded=GREATEST(writing_entries.xp_awarded,EXCLUDED.xp_awarded),
        submitted_at=NOW(),
        reviewed_at=NULL,
        updated_at=NOW()
      RETURNING *
    `, [user.id, data.activity, data.title, data.content, data.checklist, info.xp]);
    const profileData = await profile(pool, user.id);
    const awardedBadges = await awardWritingBadges(pool, user.id, { activity:data.activity, profile:profileData }, { entryId:result.rows[0].id });
    sendJson(res, 200, { entry:result.rows[0], message:`Submitted! You earned ${info.xp} writing XP.`, ...profileData, awardedBadges });
    return true;
  }

  if (path === '/api/teacher/writing' && req.method === 'GET') {
    if (user.role !== 'teacher') { sendJson(res, 403, { error:'Teacher access required.' }); return true; }
    const rows = (await pool.query(`
      SELECT w.id,w.activity,w.title,w.content,w.checklist,w.status,w.xp_awarded,w.teacher_feedback,w.submitted_at,w.reviewed_at,w.updated_at,
        u.display_name,u.username,u.selected_team
      FROM writing_entries w
      JOIN users u ON u.id=w.user_id
      WHERE w.status IN('submitted','revision','complete','reviewed')
      ORDER BY CASE WHEN w.status='submitted' THEN 0 WHEN w.status='revision' THEN 1 ELSE 2 END,w.submitted_at DESC,w.updated_at DESC
    `)).rows;
    sendJson(res, 200, { submissions:rows });
    return true;
  }

  const match = path.match(/^\/api\/teacher\/writing\/(\d+)$/);
  if (match && req.method === 'PATCH') {
    if (user.role !== 'teacher') { sendJson(res, 403, { error:'Teacher access required.' }); return true; }
    const body = await readJson(req);
    const feedback = clean(body.feedback, 2000);
    const status = body.status === 'complete' ? 'complete' : 'revision';
    if (status === 'revision' && feedback.length < 3) {
      sendJson(res, 400, { error:'Add a quick note before returning for revision.' });
      return true;
    }
    const result = await pool.query(
      "UPDATE writing_entries SET teacher_feedback=$1,status=$2,reviewed_at=NOW(),updated_at=NOW() WHERE id=$3 AND status IN('submitted','revision','complete','reviewed') RETURNING id",
      [feedback, status, match[1]]
    );
    if (!result.rowCount) { sendJson(res, 404, { error:'Submission not found.' }); return true; }
    sendJson(res, 200, { ok:true });
    return true;
  }

  sendJson(res, 404, { error:'Writing endpoint not found.' });
  return true;
}

module.exports = { initWriting, handleWriting };
