const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const root = __dirname;
const port = Number(process.env.PORT || 3000);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required. Add PostgreSQL to the Railway project.');

const pool = new Pool({ connectionString: databaseUrl, ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false } });
const SESSION_DAYS = 7;
const loginAttempts = new Map();
const mimeTypes = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon' };

function normalizeUsername(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 32); }
function validPin(value) { return /^\d{4,8}$/.test(String(value || '')); }
function randomToken() { return crypto.randomBytes(32).toString('base64url'); }
function tokenHash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function hashPin(pin, salt = crypto.randomBytes(16).toString('hex')) { return new Promise((resolve, reject) => crypto.scrypt(String(pin), salt, 64, (error, key) => error ? reject(error) : resolve(`${salt}:${key.toString('hex')}`))); }
async function verifyPin(pin, stored) { const [salt, expected] = String(stored).split(':'); if (!salt || !expected) return false; const actual = await hashPin(pin, salt); return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(stored)); }
function parseCookies(request) { return Object.fromEntries(String(request.headers.cookie || '').split(';').map(value => value.trim().split('=').map(decodeURIComponent)).filter(parts => parts.length === 2)); }
function setSessionCookie(response, token) { response.setHeader('Set-Cookie', `nfl_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`); }
function clearSessionCookie(response) { response.setHeader('Set-Cookie', 'nfl_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'); }
function sendJson(response, status, data) { response.writeHead(status, { 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store' }); response.end(JSON.stringify(data)); }
function redirect(response, location) { response.writeHead(302, { Location: location, 'Cache-Control':'no-store' }); response.end(); }
function readJson(request) { return new Promise((resolve, reject) => { let body=''; request.on('data', chunk => { body += chunk; if (body.length > 100000) request.destroy(); }); request.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch (error) { reject(error); } }); request.on('error', reject); }); }

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY, username VARCHAR(32) UNIQUE NOT NULL, display_name VARCHAR(80) NOT NULL,
      pin_hash TEXT NOT NULL, role VARCHAR(12) NOT NULL CHECK (role IN ('teacher','student')),
      selected_team VARCHAR(12), active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_login_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash CHAR(64) PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS engagement_events (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      page VARCHAR(32) NOT NULL, event_type VARCHAR(32) NOT NULL DEFAULT 'page_view',
      duration_seconds INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS engagement_user_created_idx ON engagement_events(user_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS progress (
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, page VARCHAR(32) NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT FALSE, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(user_id, page)
    );
  `);
  const teacherUsername = normalizeUsername(process.env.TEACHER_USERNAME);
  const teacherPin = process.env.TEACHER_PIN;
  if (teacherUsername && validPin(teacherPin)) {
    const existing = await pool.query('SELECT id FROM users WHERE username=$1', [teacherUsername]);
    if (!existing.rowCount) await pool.query('INSERT INTO users(username,display_name,pin_hash,role) VALUES($1,$2,$3,$4)', [teacherUsername, process.env.TEACHER_DISPLAY_NAME || 'Teacher', await hashPin(teacherPin), 'teacher']);
  } else {
    console.warn('Set TEACHER_USERNAME and a 4-8 digit TEACHER_PIN in Railway to bootstrap the teacher account.');
  }
  await pool.query('DELETE FROM sessions WHERE expires_at < NOW()');
}

async function getUser(request) {
  const token = parseCookies(request).nfl_session;
  if (!token) return null;
  const result = await pool.query(`SELECT u.id,u.username,u.display_name,u.role,u.selected_team FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.active=TRUE`, [tokenHash(token)]);
  return result.rows[0] || null;
}

async function createSession(response, userId) {
  const token = randomToken();
  await pool.query(`INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '${SESSION_DAYS} days')`, [tokenHash(token), userId]);
  setSessionCookie(response, token);
}

function loginAllowed(request) {
  const key = request.socket.remoteAddress || 'unknown';
  const now = Date.now(); const recent = (loginAttempts.get(key) || []).filter(time => now - time < 10 * 60 * 1000);
  recent.push(now); loginAttempts.set(key, recent); return recent.length <= 15;
}

async function handleApi(request, response, pathname, user) {
  if (pathname === '/api/login' && request.method === 'POST') {
    if (!loginAllowed(request)) return sendJson(response, 429, { error:'Too many login attempts. Please wait.' });
    const body = await readJson(request); const username = normalizeUsername(body.username);
    const result = await pool.query('SELECT * FROM users WHERE username=$1 AND active=TRUE', [username]); const account = result.rows[0];
    if (!account || !(await verifyPin(body.pin, account.pin_hash))) return sendJson(response, 401, { error:'Username or PIN is incorrect.' });
    await pool.query('UPDATE users SET last_login_at=NOW() WHERE id=$1', [account.id]); await createSession(response, account.id);
    return sendJson(response, 200, { user:{ username:account.username, displayName:account.display_name, role:account.role } });
  }
  if (pathname === '/api/logout' && request.method === 'POST') { const token=parseCookies(request).nfl_session; if(token) await pool.query('DELETE FROM sessions WHERE token_hash=$1',[tokenHash(token)]); clearSessionCookie(response); return sendJson(response,200,{ok:true}); }
  if (!user) return sendJson(response, 401, { error:'Please sign in.' });
  if (pathname === '/api/me' && request.method === 'GET') return sendJson(response, 200, { user:{ username:user.username, displayName:user.display_name, role:user.role, selectedTeam:user.selected_team } });
  if (pathname === '/api/engagement' && request.method === 'POST') { const body=await readJson(request); const page=String(body.page||'home').slice(0,32); const event=String(body.event||'page_view').slice(0,32); const duration=Math.max(0,Math.min(7200,Number(body.durationSeconds)||0)); await pool.query('INSERT INTO engagement_events(user_id,page,event_type,duration_seconds) VALUES($1,$2,$3,$4)',[user.id,page,event,duration]); return sendJson(response,201,{ok:true}); }
  if (pathname === '/api/progress' && request.method === 'GET') { const result=await pool.query('SELECT page,completed,updated_at FROM progress WHERE user_id=$1',[user.id]); return sendJson(response,200,{selectedTeam:user.selected_team,progress:result.rows}); }
  if (pathname === '/api/progress' && request.method === 'POST') { const body=await readJson(request); if(body.selectedTeam!==undefined) await pool.query('UPDATE users SET selected_team=$1 WHERE id=$2',[String(body.selectedTeam||'').slice(0,12)||null,user.id]); if(body.page) await pool.query('INSERT INTO progress(user_id,page,completed) VALUES($1,$2,$3) ON CONFLICT(user_id,page) DO UPDATE SET completed=EXCLUDED.completed,updated_at=NOW()',[user.id,String(body.page).slice(0,32),Boolean(body.completed)]); return sendJson(response,200,{ok:true}); }
  if (user.role !== 'teacher') return sendJson(response, 403, { error:'Teacher access required.' });
  if (pathname === '/api/teacher/students' && request.method === 'GET') { const result=await pool.query(`SELECT u.id,u.username,u.display_name,u.selected_team,u.active,u.created_at,u.last_login_at,COUNT(e.id)::int AS page_views,MAX(e.created_at) AS last_activity FROM users u LEFT JOIN engagement_events e ON e.user_id=u.id AND e.event_type='page_view' WHERE u.role='student' GROUP BY u.id ORDER BY u.display_name`); return sendJson(response,200,{students:result.rows}); }
  if (pathname === '/api/teacher/students' && request.method === 'POST') { const body=await readJson(request); const username=normalizeUsername(body.username), displayName=String(body.displayName||username).trim().slice(0,80); if(username.length<2||!validPin(body.pin)||!displayName) return sendJson(response,400,{error:'Enter a username, display name, and 4-8 digit PIN.'}); try { const result=await pool.query('INSERT INTO users(username,display_name,pin_hash,role) VALUES($1,$2,$3,$4) RETURNING id,username,display_name',[username,displayName,await hashPin(body.pin),'student']); return sendJson(response,201,{student:result.rows[0]}); } catch(error) { if(error.code==='23505') return sendJson(response,409,{error:'That username already exists.'}); throw error; } }
  const pinMatch = pathname.match(/^\/api\/teacher\/students\/(\d+)\/pin$/); if(pinMatch && request.method==='PATCH') { const body=await readJson(request); if(!validPin(body.pin)) return sendJson(response,400,{error:'PIN must contain 4-8 digits.'}); await pool.query("UPDATE users SET pin_hash=$1 WHERE id=$2 AND role='student'",[await hashPin(body.pin),pinMatch[1]]); await pool.query('DELETE FROM sessions WHERE user_id=$1',[pinMatch[1]]); return sendJson(response,200,{ok:true}); }
  const statusMatch = pathname.match(/^\/api\/teacher\/students\/(\d+)\/status$/); if(statusMatch && request.method==='PATCH') { const body=await readJson(request); await pool.query("UPDATE users SET active=$1 WHERE id=$2 AND role='student'",[Boolean(body.active),statusMatch[1]]); return sendJson(response,200,{ok:true}); }
  return sendJson(response, 404, { error:'Not found.' });
}

function serveFile(response, relativePath) {
  const filePath = path.resolve(root, relativePath.replace(/^\/+/, ''));
  if (!filePath.startsWith(root)) return sendJson(response,403,{error:'Forbidden'});
  fs.readFile(filePath, (error, contents) => { if(error){ response.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}); return response.end('Not found'); } response.writeHead(200,{'Content-Type':mimeTypes[path.extname(filePath).toLowerCase()]||'application/octet-stream','Cache-Control':'no-cache'}); response.end(contents); });
}

async function route(request, response) {
  try {
    const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname);
    const user = await getUser(request);
    if (pathname.startsWith('/api/')) return await handleApi(request,response,pathname,user);
    if (pathname === '/login' || pathname === '/login.html') return user ? redirect(response,user.role==='teacher'?'/teacher':'/') : serveFile(response,'login.html');
    if (pathname === '/teacher' || pathname === '/teacher.html') return !user ? redirect(response,'/login') : user.role!=='teacher' ? redirect(response,'/') : serveFile(response,'teacher.html');
    if (pathname === '/' || pathname === '/index.html') return !user ? redirect(response,'/login') : serveFile(response,'index.html');
    return serveFile(response, pathname);
  } catch(error) { console.error(error); sendJson(response,500,{error:'Server error.'}); }
}

initDatabase().then(() => http.createServer(route).listen(port,'0.0.0.0',()=>console.log(`NFL classroom portal listening on port ${port}`))).catch(error => { console.error('Database initialization failed.',error); process.exit(1); });
