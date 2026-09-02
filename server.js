const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const root = __dirname;
const port = Number(process.env.PORT || 3000);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required. Add PostgreSQL to the Railway project.');
const pool = new Pool({ connectionString:databaseUrl, ...(process.env.PGSSL === 'true' ? { ssl:{ rejectUnauthorized:false } } : {}) });

const SESSION_DAYS = 7;
const loginAttempts = new Map();
const mimeTypes = {
  '.html':'text/html; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg',
  '.svg':'image/svg+xml',
  '.ico':'image/x-icon',
  '.glb':'model/gltf-binary',
  '.gltf':'model/gltf+json'
};
const CLASS_SEEDS = [
  { slug:'may', name:'May Class', targetStudentCount:20 },
  { slug:'jenkins', name:'Jenkins Class', targetStudentCount:20 },
  { slug:'bolger', name:'Bolger Class', targetStudentCount:20 },
  { slug:'mccullough', name:'McCullough Class', targetStudentCount:19 }
];

function normalizeUsername(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 32); }
function normalizeSlug(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40); }
function validPin(value) { return /^\d{4,8}$/.test(String(value || '')); }
function randomToken() { return crypto.randomBytes(32).toString('base64url'); }
function tokenHash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function isTeacherLike(user) { return user && (user.role === 'teacher' || user.role === 'super_admin'); }
function isSuperAdmin(user) { return user && user.role === 'super_admin'; }
function safeText(value, max = 80) { return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max); }
function studentPagePath(page = 'dashboard') {
  const allowed = new Set(['home', 'dashboard', 'profile', 'teams', 'matchups', 'stats', 'players', 'travel', 'math', 'writing', 'cities', 'tcu']);
  const safePage = allowed.has(String(page || '').toLowerCase()) ? String(page).toLowerCase() : 'dashboard';
  return safePage === 'home' ? '/index.html' : `/index.html?page=${safePage}`;
}
function legacyClassRedirect(pathname) {
  const parts = String(pathname || '').split('/').filter(Boolean);
  return studentPagePath(parts[2] || 'dashboard');
}
function redirectPathFor(user) { if (!user) return '/login'; if (user.role === 'super_admin') return '/admin'; if (user.role === 'teacher') return '/teacher'; return studentPagePath('dashboard'); }

function hashPin(pin, salt = crypto.randomBytes(16).toString('hex')) {
  return new Promise((resolve, reject) => crypto.scrypt(String(pin), salt, 64, (error, key) => error ? reject(error) : resolve(`${salt}:${key.toString('hex')}`)));
}
async function verifyPin(pin, stored) {
  const [salt, expected] = String(stored).split(':');
  if (!salt || !expected) return false;
  const actual = await hashPin(pin, salt);
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(stored));
}
function parseCookies(request) { return Object.fromEntries(String(request.headers.cookie || '').split(';').map(value => value.trim().split('=').map(decodeURIComponent)).filter(parts => parts.length === 2)); }
function setSessionCookie(response, token) { response.setHeader('Set-Cookie', `nfl_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`); }
function clearSessionCookie(response) { response.setHeader('Set-Cookie', 'nfl_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'); }
function sendJson(response, status, data) { response.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' }); response.end(JSON.stringify(data)); }
function redirect(response, location) { response.writeHead(302, { Location:location, 'Cache-Control':'no-store' }); response.end(); }
function readJson(request) { return new Promise((resolve, reject) => { let body = ''; request.on('data', chunk => { body += chunk; if (body.length > 100000) request.destroy(); }); request.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch (error) { reject(error); } }); request.on('error', reject); }); }

async function initDatabase() {
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
    ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname VARCHAR(40);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS jersey_number VARCHAR(2);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS favorite_position VARCHAR(24);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS team_role VARCHAR(24);

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

    CREATE TABLE IF NOT EXISTS sessions(
      token_hash CHAR(64) PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS engagement_events(
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      page VARCHAR(32) NOT NULL,
      event_type VARCHAR(32) NOT NULL DEFAULT 'page_view',
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS engagement_user_created_idx ON engagement_events(user_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS progress(
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      page VARCHAR(32) NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(user_id,page)
    );
  `);

  for (const item of CLASS_SEEDS) {
    await pool.query(
      `INSERT INTO classes(slug,name,target_student_count)
       VALUES($1,$2,$3)
       ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name,target_student_count=EXCLUDED.target_student_count,updated_at=NOW()`,
      [item.slug, item.name, item.targetStudentCount]
    );
  }

  const adminUsername = normalizeUsername(process.env.SUPER_ADMIN_USERNAME || process.env.TEACHER_USERNAME);
  const adminPin = process.env.SUPER_ADMIN_PIN || process.env.TEACHER_PIN;
  if (adminUsername && validPin(adminPin)) {
    const role = process.env.SUPER_ADMIN_USERNAME ? 'super_admin' : 'super_admin';
    const existing = await pool.query('SELECT id FROM users WHERE username=$1', [adminUsername]);
    if (!existing.rowCount) {
      await pool.query('INSERT INTO users(username,display_name,pin_hash,role) VALUES($1,$2,$3,$4)', [adminUsername, process.env.SUPER_ADMIN_DISPLAY_NAME || process.env.TEACHER_DISPLAY_NAME || 'Super Admin', await hashPin(adminPin), role]);
    } else {
      await pool.query('UPDATE users SET role=$2, active=TRUE WHERE username=$1', [adminUsername, role]);
    }
  } else {
    console.warn('Set SUPER_ADMIN_USERNAME and a 4-8 digit SUPER_ADMIN_PIN, or use TEACHER_USERNAME/TEACHER_PIN as the bootstrap super admin.');
  }

  if (process.env.SEED_CLASS_STUDENTS === 'true') {
    for (let classIndex = 0; classIndex < CLASS_SEEDS.length; classIndex += 1) {
      const item = CLASS_SEEDS[classIndex];
      const classResult = await pool.query('SELECT id FROM classes WHERE slug=$1', [item.slug]);
      const classId = classResult.rows[0]?.id;
      if (!classId) continue;
      const prefix = item.slug.replace(/[^a-z]/g, '').slice(0, 8);
      const displayPrefix = item.name.replace(/ Class$/i, '');
      for (let studentNumber = 1; studentNumber <= item.targetStudentCount; studentNumber += 1) {
        const username = normalizeUsername(`${prefix}${String(studentNumber).padStart(2, '0')}`);
        const displayName = `${displayPrefix} Student ${studentNumber}`;
        const pin = `${classIndex + 1}${String(studentNumber).padStart(3, '0')}`;
        const exists = await pool.query('SELECT id FROM users WHERE username=$1', [username]);
        if (!exists.rowCount) {
          await pool.query('INSERT INTO users(username,display_name,pin_hash,role,class_id,active) VALUES($1,$2,$3,$4,$5,TRUE)', [username, displayName, await hashPin(pin), 'student', classId]);
        } else {
          await pool.query("UPDATE users SET class_id=$2 WHERE username=$1 AND role='student' AND class_id IS NULL", [username, classId]);
        }
      }
    }
  }

  await pool.query('DELETE FROM sessions WHERE expires_at<NOW()');
}

async function getUser(request) {
  const token = parseCookies(request).nfl_session;
  if (!token) return null;
  const result = await pool.query(
    `SELECT u.id,u.username,u.display_name,u.role,u.selected_team,u.class_id,c.name AS class_name,c.slug AS class_slug
     FROM sessions s
     JOIN users u ON u.id=s.user_id
     LEFT JOIN classes c ON c.id=u.class_id
     WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.active=TRUE`,
    [tokenHash(token)]
  );
  return result.rows[0] || null;
}
async function createSession(response, id) {
  const token = randomToken();
  await pool.query(`INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '${SESSION_DAYS} days')`, [tokenHash(token), id]);
  setSessionCookie(response, token);
}
function loginAllowed(request) {
  const key = request.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const recent = (loginAttempts.get(key) || []).filter(time => now - time < 600000);
  recent.push(now);
  loginAttempts.set(key, recent);
  return recent.length <= 15;
}
function publicUser(user) {
  return {
    username:user.username,
    displayName:user.display_name,
    role:user.role,
    selectedTeam:user.selected_team,
    classId:user.class_id,
    className:user.class_name,
    classSlug:user.class_slug
  };
}
async function adminClassRows() {
  const result = await pool.query(
    `SELECT c.id,c.slug,c.name,c.target_student_count,c.active,c.school_year,c.created_at,c.updated_at,
            COUNT(u.id) FILTER (WHERE u.role='student')::int AS student_count,
            COUNT(u.id) FILTER (WHERE u.role='student' AND u.active=TRUE)::int AS active_student_count
     FROM classes c
     LEFT JOIN users u ON u.class_id=c.id
     GROUP BY c.id
     ORDER BY c.name`
  );
  return result.rows;
}
async function requireAdmin(response, user) {
  if (!user) { sendJson(response, 401, { error:'Please sign in.' }); return false; }
  if (!isSuperAdmin(user)) { sendJson(response, 403, { error:'Super admin access required.' }); return false; }
  return true;
}
async function handleAdminApi(request, response, pathname, user) {
  if (!pathname.startsWith('/api/admin/')) return false;
  if (!await requireAdmin(response, user)) return true;

  if (pathname === '/api/admin/summary' && request.method === 'GET') {
    const classes = await adminClassRows();
    const users = await pool.query("SELECT role,COUNT(*)::int AS count FROM users WHERE active=TRUE GROUP BY role");
    const totals = Object.fromEntries(users.rows.map(row => [row.role, row.count]));
    return sendJson(response, 200, { classes, totals:{ classes:classes.filter(row => row.active).length, students:totals.student || 0, teachers:totals.teacher || 0, superAdmins:totals.super_admin || 0 } }), true;
  }

  if (pathname === '/api/admin/classes' && request.method === 'GET') {
    return sendJson(response, 200, { classes:await adminClassRows() }), true;
  }

  if (pathname === '/api/admin/classes' && request.method === 'POST') {
    const body = await readJson(request);
    const name = safeText(body.name, 80);
    const slug = normalizeSlug(body.slug || name);
    const targetStudentCount = Math.max(0, Math.min(40, Number(body.targetStudentCount) || 0));
    if (!name || !slug) return sendJson(response, 400, { error:'Class name is required.' }), true;
    try {
      const result = await pool.query('INSERT INTO classes(slug,name,target_student_count,school_year) VALUES($1,$2,$3,$4) RETURNING *', [slug, name, targetStudentCount, safeText(body.schoolYear || '2026-27', 20)]);
      return sendJson(response, 201, { class:result.rows[0] }), true;
    } catch (error) {
      if (error.code === '23505') return sendJson(response, 409, { error:'That class slug already exists.' }), true;
      throw error;
    }
  }

  const classMatch = pathname.match(/^\/api\/admin\/classes\/(\d+)$/);
  if (classMatch && request.method === 'PATCH') {
    const body = await readJson(request);
    const result = await pool.query(
      `UPDATE classes
       SET name=COALESCE($2,name), target_student_count=COALESCE($3,target_student_count), active=COALESCE($4,active), school_year=COALESCE($5,school_year), updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [classMatch[1], body.name ? safeText(body.name, 80) : null, body.targetStudentCount === undefined ? null : Math.max(0, Math.min(40, Number(body.targetStudentCount) || 0)), body.active === undefined ? null : Boolean(body.active), body.schoolYear ? safeText(body.schoolYear, 20) : null]
    );
    if (!result.rowCount) return sendJson(response, 404, { error:'Class not found.' }), true;
    return sendJson(response, 200, { class:result.rows[0] }), true;
  }

  if (pathname === '/api/admin/students' && request.method === 'GET') {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    const params = [];
    let where = "u.role='student'";
    const classId = Number(url.searchParams.get('classId'));
    if (classId) { params.push(classId); where += ` AND u.class_id=$${params.length}`; }
    const result = await pool.query(
      `SELECT u.id,u.username,u.display_name,u.selected_team,u.active,u.class_id,c.name AS class_name,u.created_at,u.last_login_at
       FROM users u
       LEFT JOIN classes c ON c.id=u.class_id
       WHERE ${where}
       ORDER BY c.name NULLS LAST,u.display_name`,
      params
    );
    return sendJson(response, 200, { students:result.rows }), true;
  }

  if (pathname === '/api/admin/students' && request.method === 'POST') {
    const body = await readJson(request);
    const username = normalizeUsername(body.username);
    const displayName = safeText(body.displayName || username, 80);
    const classId = Number(body.classId) || null;
    const selectedTeam = safeText(body.selectedTeam, 12).toUpperCase() || null;
    if (username.length < 2 || !validPin(body.pin) || !displayName || !classId) return sendJson(response, 400, { error:'Enter class, username, display name, and 4-8 digit PIN.' }), true;
    try {
      const result = await pool.query(
        'INSERT INTO users(username,display_name,pin_hash,role,class_id,selected_team) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,username,display_name,class_id,selected_team,active',
        [username, displayName, await hashPin(body.pin), 'student', classId, selectedTeam]
      );
      return sendJson(response, 201, { student:result.rows[0] }), true;
    } catch (error) {
      if (error.code === '23505') return sendJson(response, 409, { error:'That username already exists.' }), true;
      throw error;
    }
  }

  const studentMatch = pathname.match(/^\/api\/admin\/students\/(\d+)$/);
  if (studentMatch && request.method === 'PATCH') {
    const body = await readJson(request);
    const result = await pool.query(
      `UPDATE users
       SET display_name=COALESCE($2,display_name), class_id=COALESCE($3,class_id), selected_team=$4, active=COALESCE($5,active)
       WHERE id=$1 AND role='student'
       RETURNING id,username,display_name,class_id,selected_team,active`,
      [studentMatch[1], body.displayName ? safeText(body.displayName, 80) : null, body.classId === undefined ? null : Number(body.classId) || null, body.selectedTeam === undefined ? null : safeText(body.selectedTeam, 12).toUpperCase() || null, body.active === undefined ? null : Boolean(body.active)]
    );
    if (!result.rowCount) return sendJson(response, 404, { error:'Student not found.' }), true;
    return sendJson(response, 200, { student:result.rows[0] }), true;
  }

  const pinMatch = pathname.match(/^\/api\/admin\/students\/(\d+)\/pin$/);
  if (pinMatch && request.method === 'PATCH') {
    const body = await readJson(request);
    if (!validPin(body.pin)) return sendJson(response, 400, { error:'PIN must contain 4-8 digits.' }), true;
    await pool.query("UPDATE users SET pin_hash=$1 WHERE id=$2 AND role='student'", [await hashPin(body.pin), pinMatch[1]]);
    await pool.query('DELETE FROM sessions WHERE user_id=$1', [pinMatch[1]]);
    return sendJson(response, 200, { ok:true }), true;
  }

  return sendJson(response, 404, { error:'Not found.' }), true;
}

async function handleApi(request, response, pathname, user) {
  if (await handleAdminApi(request, response, pathname, user)) return;

  if (pathname === '/api/login' && request.method === 'POST') {
    if (!loginAllowed(request)) return sendJson(response, 429, { error:'Too many login attempts. Please wait.' });
    const body = await readJson(request);
    const username = normalizeUsername(body.username);
    const result = await pool.query(
      `SELECT u.*,c.name AS class_name,c.slug AS class_slug
       FROM users u
       LEFT JOIN classes c ON c.id=u.class_id
       WHERE u.username=$1 AND u.active=TRUE`,
      [username]
    );
    const account = result.rows[0];
    if (!account || !await verifyPin(body.pin, account.pin_hash)) return sendJson(response, 401, { error:'Username or PIN is incorrect.' });
    await pool.query('UPDATE users SET last_login_at=NOW() WHERE id=$1', [account.id]);
    await createSession(response, account.id);
    return sendJson(response, 200, { user:publicUser(account), redirectPath:redirectPathFor(account) });
  }

  if (pathname === '/api/logout' && request.method === 'POST') {
    const token = parseCookies(request).nfl_session;
    if (token) await pool.query('DELETE FROM sessions WHERE token_hash=$1', [tokenHash(token)]);
    clearSessionCookie(response);
    return sendJson(response, 200, { ok:true });
  }

  if (!user) return sendJson(response, 401, { error:'Please sign in.' });

  if (pathname === '/api/me' && request.method === 'GET') return sendJson(response, 200, { user:publicUser(user), redirectPath:redirectPathFor(user) });

  if (pathname === '/api/engagement' && request.method === 'POST') {
    return sendJson(response, 200, { ok:true, tracked:false });
  }

  if (pathname === '/api/progress' && request.method === 'GET') {
    const result = await pool.query('SELECT page,completed,updated_at FROM progress WHERE user_id=$1', [user.id]);
    return sendJson(response, 200, { selectedTeam:user.selected_team, classId:user.class_id, className:user.class_name, progress:result.rows });
  }

  if (pathname === '/api/progress' && request.method === 'POST') {
    const body = await readJson(request);
    if (body.selectedTeam !== undefined) await pool.query('UPDATE users SET selected_team=$1 WHERE id=$2', [String(body.selectedTeam || '').slice(0,12) || null, user.id]);
    if (body.page) await pool.query('INSERT INTO progress(user_id,page,completed) VALUES($1,$2,$3) ON CONFLICT(user_id,page) DO UPDATE SET completed=EXCLUDED.completed,updated_at=NOW()', [user.id, String(body.page).slice(0,32), Boolean(body.completed)]);
    return sendJson(response, 200, { ok:true });
  }

  if (!isTeacherLike(user)) return sendJson(response, 403, { error:'Teacher access required.' });

  if (pathname === '/api/teacher/students' && request.method === 'GET') {
    const params = [];
    let classFilter = '';
    if (user.role === 'teacher' && user.class_id) { params.push(user.class_id); classFilter = `AND u.class_id=$${params.length}`; }
    const result = await pool.query(
      `SELECT u.id,u.username,u.display_name,u.selected_team,u.active,u.class_id,c.name AS class_name,u.created_at,u.last_login_at
       FROM users u
       LEFT JOIN classes c ON c.id=u.class_id
       WHERE u.role='student' ${classFilter}
       ORDER BY c.name NULLS LAST,u.display_name`,
      params
    );
    return sendJson(response, 200, { students:result.rows });
  }

  if (pathname === '/api/teacher/students' && request.method === 'POST') {
    const body = await readJson(request);
    const username = normalizeUsername(body.username);
    const displayName = safeText(body.displayName || username, 80);
    const classId = isSuperAdmin(user) ? (Number(body.classId) || user.class_id || null) : user.class_id;
    if (username.length < 2 || !validPin(body.pin) || !displayName) return sendJson(response, 400, { error:'Enter a username, display name, and 4-8 digit PIN.' });
    try {
      const result = await pool.query('INSERT INTO users(username,display_name,pin_hash,role,class_id) VALUES($1,$2,$3,$4,$5) RETURNING id,username,display_name,class_id', [username, displayName, await hashPin(body.pin), 'student', classId]);
      return sendJson(response, 201, { student:result.rows[0] });
    } catch (error) {
      if (error.code === '23505') return sendJson(response, 409, { error:'That username already exists.' });
      throw error;
    }
  }

  const pinMatch = pathname.match(/^\/api\/teacher\/students\/(\d+)\/pin$/);
  if (pinMatch && request.method === 'PATCH') {
    const body = await readJson(request);
    if (!validPin(body.pin)) return sendJson(response, 400, { error:'PIN must contain 4-8 digits.' });
    await pool.query("UPDATE users SET pin_hash=$1 WHERE id=$2 AND role='student'", [await hashPin(body.pin), pinMatch[1]]);
    await pool.query('DELETE FROM sessions WHERE user_id=$1', [pinMatch[1]]);
    return sendJson(response, 200, { ok:true });
  }

  const statusMatch = pathname.match(/^\/api\/teacher\/students\/(\d+)\/status$/);
  if (statusMatch && request.method === 'PATCH') {
    const body = await readJson(request);
    await pool.query("UPDATE users SET active=$1 WHERE id=$2 AND role='student'", [Boolean(body.active), statusMatch[1]]);
    return sendJson(response, 200, { ok:true });
  }

  return sendJson(response, 404, { error:'Not found.' });
}

function serveFile(response, relative) {
  const file = path.resolve(root, relative.replace(/^\/+/, ''));
  if (!file.startsWith(root)) return sendJson(response, 403, { error:'Forbidden' });
  fs.readFile(file, (error, content) => {
    if (error) { response.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' }); return response.end('Not found'); }
    const contentType=mimeTypes[path.extname(file).toLowerCase()] || 'application/octet-stream';
    response.writeHead(200, { 'Content-Type':contentType, 'Cache-Control':file.endsWith('.html')?'no-store':'no-cache' });
    response.end(content);
  });
}

async function route(request, response) {
  try {
    const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname);
    const user = await getUser(request);
    if (pathname.startsWith('/api/')) return await handleApi(request, response, pathname, user);
    if (pathname === '/login' || pathname === '/login.html') return user ? redirect(response, redirectPathFor(user)) : serveFile(response, 'login.html');
    if (pathname === '/admin' || pathname === '/admin.html') return !user ? redirect(response, '/login') : !isSuperAdmin(user) ? redirect(response, redirectPathFor(user)) : serveFile(response, 'admin.html');
    if (pathname === '/teacher' || pathname === '/teacher.html') return !user ? redirect(response, '/login') : !isTeacherLike(user) ? redirect(response, redirectPathFor(user)) : serveFile(response, 'teacher.html');
    if (pathname.startsWith('/class/')) return !user ? redirect(response, '/login') : redirect(response, legacyClassRedirect(pathname));
    if (pathname === '/' || pathname === '/index.html') return !user ? redirect(response, '/login') : user.role === 'super_admin' ? redirect(response, '/admin') : serveFile(response, 'index.html');
    return serveFile(response, pathname);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error:'Server error.' });
  }
}

initDatabase()
  .then(() => http.createServer(route).listen(port, '0.0.0.0', () => console.log(`NFL classroom portal listening on port ${port}`)))
  .catch(error => { console.error('Database initialization failed.', error); process.exit(1); });
