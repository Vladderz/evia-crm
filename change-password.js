require('dotenv').config();

const bcrypt = require('bcrypt');
const pool = require('./db/pool');

async function changePassword() {
  const email = 'vlad@eviamarketing.co.uk';
  const password = 'Evia2026';

  const hash = await bcrypt.hash(password, 12);
  const result = await pool.query(
    'UPDATE users SET password_hash = $1 WHERE email = $2',
    [hash, email]
  );

  if (result.rowCount === 0) {
    console.error('No user found with email:', email);
    process.exit(1);
  }

  console.log('Password updated successfully for', email);
  await pool.end();
}

changePassword().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
