const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const pool = new Pool({
  connectionString: databaseUrl,
  ...(process.env.PGSSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {})
});

// These are the generated demo usernames from the original class seeding logic.
// Teachers creating real students should use actual names/usernames, not these generated prefixes.
const PLACEHOLDER_USERNAME_PATTERNS = [
  '^may[0-9]{2}$',
  '^jenkins[0-9]{2}$',
  '^bolger[0-9]{2}$',
  '^mccullough[0-9]{2}$'
];

async function cleanupPlaceholders() {
  try {
    await pool.query('BEGIN');
    const conditions = PLACEHOLDER_USERNAME_PATTERNS.map((_, index) => `username ~ $${index + 1}`).join(' OR ');
    const result = await pool.query(
      `DELETE FROM users
       WHERE role='student'
         AND (${conditions})`,
      PLACEHOLDER_USERNAME_PATTERNS
    );
    await pool.query('COMMIT');
    if (result.rowCount > 0) {
      console.log(`Removed ${result.rowCount} generated placeholder student account(s).`);
    } else {
      console.log('No generated placeholder student accounts found.');
    }
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  } finally {
    await pool.end();
  }
}

cleanupPlaceholders().catch(error => {
  console.error('Placeholder cleanup failed.', error);
  process.exit(1);
});
