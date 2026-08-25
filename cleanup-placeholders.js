const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const pool = new Pool({
  connectionString: databaseUrl,
  ...(process.env.PGSSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {})
});

// These are the generated demo accounts from the original class seeding logic.
// Teachers creating real students should use actual names/usernames, not these generated prefixes.
const PLACEHOLDER_USERNAME_PATTERNS = [
  '^may[0-9]{2}$',
  '^jenkins[0-9]{2}$',
  '^bolger[0-9]{2}$',
  '^mccullough[0-9]{2}$'
];

const PLACEHOLDER_DISPLAY_PATTERNS = [
  '^May Student [0-9]+$',
  '^Jenkins Student [0-9]+$',
  '^Bolger Student [0-9]+$',
  '^McCullough Student [0-9]+$'
];

async function cleanupPlaceholders() {
  try {
    await pool.query('BEGIN');
    const usernameConditions = PLACEHOLDER_USERNAME_PATTERNS.map((_, index) => `username ~ $${index + 1}`);
    const displayOffset = PLACEHOLDER_USERNAME_PATTERNS.length;
    const displayConditions = PLACEHOLDER_DISPLAY_PATTERNS.map((_, index) => `display_name ~* $${displayOffset + index + 1}`);
    const conditions = [...usernameConditions, ...displayConditions].join(' OR ');
    const result = await pool.query(
      `DELETE FROM users
       WHERE role='student'
         AND (${conditions})`,
      [...PLACEHOLDER_USERNAME_PATTERNS, ...PLACEHOLDER_DISPLAY_PATTERNS]
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
