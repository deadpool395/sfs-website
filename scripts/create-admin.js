// Usage: npm run create-admin -- <username> <password>
// Creates the admin account, or resets the password if the username exists.
const bcrypt = require('bcryptjs');
const pool = require('../src/db/pool');
const migrate = require('../src/db/migrate');

async function main() {
  const [username, password] = process.argv.slice(2);
  if (!username || !password) {
    console.error('Usage: npm run create-admin -- <username> <password>');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }
  await migrate();
  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO website.admin_users (username, password_hash) VALUES ($1, $2)
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [username.toLowerCase(), hash]
  );
  console.log(`Admin "${username.toLowerCase()}" is ready. Sign in at /admin`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
