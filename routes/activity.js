const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

// GET /api/activity
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, u.name AS user_name
       FROM activity_log a
       LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC
       LIMIT 50`
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('List activity error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
