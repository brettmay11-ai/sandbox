const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const pool = new Pool({
  connectionString: databaseUrl,
  ...(process.env.PGSSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {})
});

const PLACEHOLDER_PATTERNS = [
  { username: '^may[0-9]{2}$', display: '^May Student [0-9]+$' },
  { username: '^jenkins[0-9]{2}$', display: '^Jenkins Student [0-9]+$' },
  { username: '^bolger[0-9]{2}$', display: '^Bolger Student [0-9]+$' },
  { username: '^mccullough[0-9]{2}$', display: '^McCullough Student [0-9]+$' }
];

async function cleanupPlaceholders() {
  try {
    await pool.query('BEGIN');
    const conditions = PLACEHOLDER_PATTERNS.map((_, index) => `(username ~ $${index * 2 + 1} AND display_name ~ $${index * 2 + 2})`).join(' OR ');
    const params = PLACEHOLDER_PATTERNS.flatMap(pattern => [pattern.username, pattern.display]);
    const result = await pool.query(
      `DELETE FROM users
       WHERE role='student'
         AND (${conditions})`,
      params
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
