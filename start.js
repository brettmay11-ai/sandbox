const crypto = require('crypto');
const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required. Add PostgreSQL to the Railway project.');

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 32);
}

function validPin(value) {
  return /^\d{4,8}$/.test(String(value || ''));
}

function hashPin(pin, salt = crypto.randomBytes(16).toString('hex')) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(pin), salt, 64, (error, key) => {
      if (error) reject(error);
      else resolve(`${salt}:${key.toString('hex')}`);
    });
  });
}

async function upsertAccount(pool, { username, pin, displayName, role }) {
  if (!username || !validPin(pin)) return false;
  const existing = await pool.query('SELECT id FROM users WHERE username=$1', [username]);
  if (!existing.rowCount) {
    await pool.query(
      'INSERT INTO users(username,display_name,pin_hash,role,active) VALUES($1,$2,$3,$4,TRUE)',
      [username, displayName, await hashPin(pin), role]
    );
  } else {
    await pool.query(
      'UPDATE users SET display_name=COALESCE(NULLIF($2,\'\'),display_name), role=$3, active=TRUE WHERE username=$1',
      [username, displayName, role]
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
    `);

    const teacherUsername = normalizeUsername(process.env.TEACHER_USERNAME);
    const teacherPin = process.env.TEACHER_PIN;
    const superAdminUsername = normalizeUsername(process.env.SUPER_ADMIN_USERNAME);
    const superAdminPin = process.env.SUPER_ADMIN_PIN;

    if (teacherUsername) {
      await upsertAccount(pool, {
        username: teacherUsername,
        pin: teacherPin,
        displayName: process.env.TEACHER_DISPLAY_NAME || 'Teacher',
        role: 'teacher'
      });
    }

    if (superAdminUsername) {
      await upsertAccount(pool, {
        username: superAdminUsername,
        pin: superAdminPin,
        displayName: process.env.SUPER_ADMIN_DISPLAY_NAME || 'Super Admin',
        role: 'super_admin'
      });
    }

    if (teacherUsername && teacherUsername !== superAdminUsername) {
      await pool.query("UPDATE users SET role='teacher' WHERE username=$1 AND role='super_admin'", [teacherUsername]);
    }

    if (!superAdminUsername || !validPin(superAdminPin)) {
      console.warn('Set SUPER_ADMIN_USERNAME and SUPER_ADMIN_PIN for Brett\'s super admin account. Teacher credentials will stay teacher-only.');
    }
  } finally {
    await pool.end();
  }
}

bootstrapRoles()
  .then(() => {
    // Prevent the legacy server bootstrap from promoting TEACHER_USERNAME to super_admin.
    delete process.env.TEACHER_USERNAME;
    delete process.env.TEACHER_PIN;
    require('./game-bootstrap');
  })
  .catch(error => {
    console.error('Role bootstrap failed.', error);
    process.exit(1);
  });
