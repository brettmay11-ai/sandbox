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

function hashPin(pin, salt = crypto.randomBytes(16).toString('hex')) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(pin), salt, 64, (error, key) => {
      if (error) reject(error);
      else resolve(`${salt}:${key.toString('hex')}`);
    });
  });
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

async function upsertAccount(pool, { username, pin, displayName, role, classId = null }) {
  if (!username || !validPin(pin)) return false;
  const existing = await pool.query('SELECT id FROM users WHERE username=$1', [username]);
  if (!existing.rowCount) {
    await pool.query(
      'INSERT INTO users(username,display_name,pin_hash,role,class_id,active) VALUES($1,$2,$3,$4,$5,TRUE)',
      [username, displayName, await hashPin(pin), role, classId]
    );
  } else {
    await pool.query(
      'UPDATE users SET display_name=COALESCE(NULLIF($2,\'\'),display_name), role=$3, class_id=$4, active=TRUE WHERE username=$1',
      [username, displayName, role, classId]
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
        classId: teacherClassId
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
