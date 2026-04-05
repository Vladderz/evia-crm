const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db/pool');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const result = await pool.query(
      'SELECT id, email, password_hash, name FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    req.session.userId = user.id;
    req.session.userName = user.name;

    return res.json({ id: user.id, email: user.email, name: user.name });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out' });
    }
    res.clearCookie('connect.sid');
    return res.json({ message: 'Logged out' });
  });
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const result = await pool.query(
      'SELECT id, email, name FROM users WHERE id = $1',
      [req.session.userId]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    return res.json(user);
  } catch (err) {
    console.error('Auth me error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
