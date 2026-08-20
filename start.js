const crypto = require('crypto');
const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required. Add PostgreSQL to the Railway project.');

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 32);
}

function normalizeSlug(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

function validPin(value) {
  return /^\d{4,8}$/.test(String(value || ''));
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function hashPin(pin, salt = crypto.randomBytes(16).toString('hex')) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(pin), salt, 64, (error, key) => {
      if (error) reject(error);
      else resolve(`${salt}:${key.toString('hex')}`);
    });
  });
}

function parseCookies(request) {
  return Object.fromEntries(
    String(request.headers.cookie || '')
      .split(';')
      .map(value => value.trim().split('=').map(decodeURIComponent))
      .filter(parts => parts.length === 2)
  );
}

function sendJson(response, status, data) {
  response.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' });
  response.end(JSON.stringify(data));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', chunk => {
      body += chunk;
      if (body.length > 100000) request.destroy();
    });
    request.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (error) { reject(error); }
    });
    request.on('error', reject);
  });
}

function safeText(value, max = 80) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function normalizeNflTeam(value) {
  const team = String(value || '').trim().toUpperCase();
  const teams = new Set(['ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAX','KC','LV','LAC','LAR','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SF','SEA','TB','TEN','WAS']);
  return teams.has(team) ? team : null;
}

async function ensureClass(pool, slug, name, targetStudentCount) {
  const normalizedSlug = normalizeSlug(slug);
  const result = await pool.query(
    `INSERT INTO classes(slug,name,target_student_count)
     VALUES($1,$2,$3)
     ON CONFLICT(slug) DO UPDATE
       SET name=EXCLUDED.name,
           target_student_count=EXCLUDED.target_student_count,
           updated_at=NOW()
     RETURNING id`,
    [normalizedSlug, name, targetStudentCount]
  );
  return result.rows[0].id;
}

async function upsertAccount(pool, { username, pin, displayName, role, classId = null, selectedTeam = null }) {
  if (!username || !validPin(pin)) return false;
  const existing = await pool.query('SELECT id FROM users WHERE username=$1', [username]);
  if (!existing.rowCount) {
    await pool.query(
      'INSERT INTO users(username,display_name,pin_hash,role,class_id,selected_team,active) VALUES($1,$2,$3,$4,$5,$6,TRUE)',
      [username, displayName, await hashPin(pin), role, classId, normalizeNflTeam(selectedTeam)]
    );
  } else {
    await pool.query(
      'UPDATE users SET display_name=COALESCE(NULLIF($2,\'\'),display_name), role=$3, class_id=$4, selected_team=COALESCE($5,selected_team), active=TRUE WHERE username=$1',
      [username, displayName, role, classId, normalizeNflTeam(selectedTeam)]
    );
  }
  return true;
}

async function bootstrapRoles() {
  const pool = new Pool({ connectionString:databaseUrl, ...(process.env.PGSSL === 'true' ? { ssl:{ rejectUnauthorized:false } } : {}) });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users(
        id BIGSERIAL PRIMARY KEY,
        username VARCHAR(32) UNIQUE NOT NULL,
        display_name VARCHAR(80) NOT NULL,
        pin_hash TEXT NOT NULL,
        role VARCHAR(12) NOT NULL CHECK(role IN('super_admin','teacher','student')),
        selected_team VARCHAR(12),
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_login_at TIMESTAMPTZ
      );
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
      ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN('super_admin','teacher','student'));
      ALTER TABLE users ADD COLUMN IF NOT EXISTS class_id BIGINT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS selected_team VARCHAR(12);

      CREATE TABLE IF NOT EXISTS classes(
        id BIGSERIAL PRIMARY KEY,
        slug VARCHAR(40) UNIQUE NOT NULL,
        name VARCHAR(80) NOT NULL,
        target_student_count INTEGER NOT NULL DEFAULT 0,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        school_year VARCHAR(20) NOT NULL DEFAULT '2026-27',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const mayClassId = await ensureClass(pool, 'may', 'May Class', 20);
    await ensureClass(pool, 'jenkins', 'Jenkins Class', 20);
    await ensureClass(pool, 'bolger', 'Bolger Class', 20);
    await ensureClass(pool, 'mccullough', 'McCullough Class', 19);

    const teacherUsername = normalizeUsername(process.env.TEACHER_USERNAME);
    const teacherPin = process.env.TEACHER_PIN;
    const teacherClassSlug = normalizeSlug(process.env.TEACHER_CLASS_SLUG || 'may');
    const teacherClassResult = await pool.query('SELECT id FROM classes WHERE slug=$1', [teacherClassSlug]);
    const teacherClassId = teacherClassResult.rows[0]?.id || mayClassId;

    const superAdminUsername = normalizeUsername(process.env.SUPER_ADMIN_USERNAME);
    const superAdminPin = process.env.SUPER_ADMIN_PIN;

    if (teacherUsername) {
      await upsertAccount(pool, {
        username: teacherUsername,
        pin: teacherPin,
        displayName: process.env.TEACHER_DISPLAY_NAME || 'Teacher',
        role: 'teacher',
        classId: teacherClassId,
        selectedTeam: process.env.TEACHER_TEAM || null
      });
    }

    if (superAdminUsername) {
      await upsertAccount(pool, {
        username: superAdminUsername,
        pin: superAdminPin,
        displayName: process.env.SUPER_ADMIN_DISPLAY_NAME || 'Super Admin',
        role: 'super_admin',
        classId: null
      });
    }

    if (teacherUsername && teacherUsername !== superAdminUsername) {
      await pool.query("UPDATE users SET role='teacher', class_id=$2 WHERE username=$1", [teacherUsername, teacherClassId]);
    }

    if (!superAdminUsername || !validPin(superAdminPin)) {
      console.warn('Set SUPER_ADMIN_USERNAME and SUPER_ADMIN_PIN for Brett\'s super admin account. Teacher credentials will stay teacher-only.');
    }
    if (!teacherUsername || !validPin(teacherPin)) {
      console.warn('Set TEACHER_USERNAME and TEACHER_PIN for Ms. May\'s teacher account.');
    }
  } finally {
    await pool.end();
  }
}

function installAdminTeacherApi() {
  const http = require('http');
  const createServer = http.createServer.bind(http);
  const apiPool = new Pool({ connectionString:databaseUrl, ...(process.env.PGSSL === 'true' ? { ssl:{ rejectUnauthorized:false } } : {}) });

  async function getSessionUser(request) {
    const token = parseCookies(request).nfl_session;
    if (!token) return null;
    const result = await apiPool.query(
      `SELECT u.id,u.username,u.display_name,u.role,u.class_id,u.selected_team
       FROM sessions s
       JOIN users u ON u.id=s.user_id
       WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.active=TRUE`,
      [tokenHash(token)]
    );
    return result.rows[0] || null;
  }

  async function requireSuperAdmin(request, response) {
    const user = await getSessionUser(request);
    if (!user) {
      sendJson(response, 401, { error:'Please sign in.' });
      return null;
    }
    if (user.role !== 'super_admin') {
      sendJson(response, 403, { error:'Super admin access required.' });
      return null;
    }
    return user;
  }

  async function handleTeacherApi(request, response, pathname) {
    if (!pathname.startsWith('/api/admin/teachers')) return false;
    const admin = await requireSuperAdmin(request, response);
    if (!admin) return true;

    if (pathname === '/api/admin/teachers' && request.method === 'GET') {
      const result = await apiPool.query(
        `SELECT u.id,u.username,u.display_name,u.active,u.class_id,u.selected_team,c.name AS class_name,u.created_at,u.last_login_at,
                COUNT(s.id) FILTER (WHERE s.role='student')::int AS student_count
         FROM users u
         LEFT JOIN classes c ON c.id=u.class_id
         LEFT JOIN users s ON s.class_id=u.class_id AND s.role='student' AND s.active=TRUE
         WHERE u.role='teacher'
         GROUP BY u.id,c.name
         ORDER BY u.display_name`
      );
      sendJson(response, 200, { teachers:result.rows });
      return true;
    }

    if (pathname === '/api/admin/teachers' && request.method === 'POST') {
      const body = await readJson(request);
      const username = normalizeUsername(body.username);
      const displayName = safeText(body.displayName || username, 80);
      const classId = Number(body.classId) || null;
      const selectedTeam = body.selectedTeam ? normalizeNflTeam(body.selectedTeam) : null;
      if (body.selectedTeam && !selectedTeam) {
        sendJson(response, 400, { error:'Choose a valid NFL team.' });
        return true;
      }
      if (username.length < 2 || !validPin(body.pin) || !displayName || !classId) {
        sendJson(response, 400, { error:'Enter class, username, display name, and 4-8 digit PIN.' });
        return true;
      }
      const classCheck = await apiPool.query('SELECT id FROM classes WHERE id=$1 AND active=TRUE', [classId]);
      if (!classCheck.rowCount) {
        sendJson(response, 400, { error:'Choose an active class.' });
        return true;
      }
      try {
        const result = await apiPool.query(
          'INSERT INTO users(username,display_name,pin_hash,role,class_id,selected_team,active) VALUES($1,$2,$3,$4,$5,$6,TRUE) RETURNING id,username,display_name,class_id,selected_team,active',
          [username, displayName, await hashPin(body.pin), 'teacher', classId, selectedTeam]
        );
        sendJson(response, 201, { teacher:result.rows[0] });
        return true;
      } catch (error) {
        if (error.code === '23505') {
          sendJson(response, 409, { error:'That username already exists.' });
          return true;
        }
        throw error;
      }
    }

    const teacherMatch = pathname.match(/^\/api\/admin\/teachers\/(\d+)$/);
    if (teacherMatch && request.method === 'PATCH') {
      const body = await readJson(request);
      const displayName = body.displayName ? safeText(body.displayName, 80) : null;
      const classId = body.classId === undefined ? null : Number(body.classId) || null;
      const active = body.active === undefined ? null : Boolean(body.active);
      const selectedTeam = body.selectedTeam === undefined ? undefined : (body.selectedTeam ? normalizeNflTeam(body.selectedTeam) : null);
      if (body.selectedTeam && !selectedTeam) {
        sendJson(response, 400, { error:'Choose a valid NFL team.' });
        return true;
      }
      const result = await apiPool.query(
        `UPDATE users
         SET display_name=COALESCE($2,display_name),
             class_id=COALESCE($3,class_id),
             active=COALESCE($4,active),
             selected_team=CASE WHEN $5::boolean THEN $6 ELSE selected_team END
         WHERE id=$1 AND role='teacher'
         RETURNING id,username,display_name,class_id,selected_team,active`,
        [teacherMatch[1], displayName, classId, active, body.selectedTeam !== undefined, selectedTeam]
      );
      if (!result.rowCount) {
        sendJson(response, 404, { error:'Teacher not found.' });
        return true;
      }
      sendJson(response, 200, { teacher:result.rows[0] });
      return true;
    }

    const pinMatch = pathname.match(/^\/api\/admin\/teachers\/(\d+)\/pin$/);
    if (pinMatch && request.method === 'PATCH') {
      const body = await readJson(request);
      if (!validPin(body.pin)) {
        sendJson(response, 400, { error:'PIN must contain 4-8 digits.' });
        return true;
      }
      await apiPool.query("UPDATE users SET pin_hash=$1 WHERE id=$2 AND role='teacher'", [await hashPin(body.pin), pinMatch[1]]);
      await apiPool.query('DELETE FROM sessions WHERE user_id=$1', [pinMatch[1]]);
      sendJson(response, 200, { ok:true });
      return true;
    }

    sendJson(response, 404, { error:'Not found.' });
    return true;
  }

  http.createServer = function createServerWithAdminTeachers(originalListener) {
    return createServer(async (request, response) => {
      try {
        const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname);
        if (await handleTeacherApi(request, response, pathname)) return;
        originalListener(request, response);
      } catch (error) {
        console.error('Admin teacher API failed.', error);
        if (!response.headersSent) sendJson(response, 500, { error:'Server error.' });
        else response.end();
      }
    });
  };
}

bootstrapRoles()
  .then(() => {
    installAdminTeacherApi();
    // Prevent the legacy server bootstrap from promoting TEACHER_USERNAME to super_admin.
    delete process.env.TEACHER_USERNAME;
    delete process.env.TEACHER_PIN;
    require('./game-bootstrap');
  })
  .catch(error => {
    console.error('Role bootstrap failed.', error);
    process.exit(1);
  });
