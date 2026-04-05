require('dotenv').config();

const bcrypt = require('bcrypt');
const pool = require('./pool');

const SALT_ROUNDS = 12;

async function seed() {
  const users = [
    { email: 'vlad@eviamarketing.co.uk', name: 'Vlad', password: 'changeme123' },
    { email: 'tristan@eviamarketing.co.uk', name: 'Tristan', password: 'changeme456' },
  ];

  try {
    for (const user of users) {
      const hash = await bcrypt.hash(user.password, SALT_ROUNDS);
      await pool.query(
        `INSERT INTO users (email, password_hash, name)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO NOTHING`,
        [user.email, hash, user.name]
      );
      console.log(`Seeded user: ${user.email}`);
    }
    console.log('Seed complete.');
  } catch (err) {
    console.error('Seed failed:', err);
  } finally {
    await pool.end();
  }
}

seed();
