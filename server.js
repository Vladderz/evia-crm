require('dotenv').config();

const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const cors = require('cors');
const path = require('path');
const pool = require('./db/pool');

const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const tenderRoutes = require('./routes/tenders');
const tenderResultsRoutes = require('./routes/tenderResults');
const activityRoutes = require('./routes/activity');
const pipelineRoutes = require('./routes/pipeline');
const noMansLandRoutes = require('./routes/no-mans-land');
const requireAuth = require('./middleware/requireAuth');

const app = express();
const PORT = process.env.PORT || 8080;
const isProd = process.env.NODE_ENV === 'production';

// Required for Railway's reverse proxy so secure cookies work in production
app.set('trust proxy', 1);

app.use(express.json());
app.use(cors({
  // In dev, allow any localhost port (Vite may not always land on 5173)
  origin: isProd ? false : (origin, cb) => {
    if (!origin || /^http:\/\/localhost(:\d+)?$/.test(origin)) {
      cb(null, true);
    } else {
      cb(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(session({
  store: new pgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET || 'fallback-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));

// Auth routes - no requireAuth
app.use('/api/auth', authRoutes);

// Protected API routes
app.use('/api/clients', requireAuth, clientRoutes);
app.use('/api/tenders', requireAuth, tenderRoutes);
app.use('/api/tender-results', requireAuth, tenderResultsRoutes);
app.use('/api/activity', requireAuth, activityRoutes);
app.use('/api/prospected', requireAuth, require('./routes/prospected'));
app.use('/api/pipeline', requireAuth, pipelineRoutes);
app.use('/api/no-mans-land', requireAuth, noMansLandRoutes);

if (isProd) {
  const distPath = path.join(__dirname, 'client', 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

async function cleanupExpiredProspected() {
  try {
    const result = await pool.query(
      `DELETE FROM prospected_contracts WHERE submission_deadline < CURRENT_DATE`
    );
    if (result.rowCount > 0) {
      console.log(`[prospected] Cleaned up ${result.rowCount} expired contract(s).`);
    }
  } catch (err) {
    console.error('[prospected] Startup cleanup failed:', err.message);
  }
}

async function checkTenderResultsTable() {
  try {
    const { rows } = await pool.query(
      `SELECT to_regclass('public.tender_results') AS exists`
    );
    if (!rows[0] || !rows[0].exists) {
      const sql = `CREATE TABLE IF NOT EXISTS tender_results (
  id SERIAL PRIMARY KEY,
  tender_name VARCHAR(255) NOT NULL,
  client_name VARCHAR(255),
  contracting_authority VARCHAR(255),
  estimated_budget NUMERIC(12,2),
  our_price NUMERIC(12,2),
  bids_received INTEGER,
  winning_price NUMERIC(12,2),
  quality_price_weighting VARCHAR(10),
  outcome VARCHAR(20) CHECK (outcome IN ('Won', 'Lost', 'Awaiting')) DEFAULT 'Awaiting',
  position INTEGER,
  submitted_date DATE,
  notes TEXT,
  created_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);`;
      console.log('[tender_results] Table not found. Run this SQL on the database to create it:\n' + sql);
    } else {
      // Idempotent column additions for incremental schema changes
      await pool.query(`ALTER TABLE tender_results ADD COLUMN IF NOT EXISTS tender_url VARCHAR(500)`);
    }
  } catch (err) {
    console.error('[tender_results] Startup table check failed:', err.message);
  }
}

app.listen(PORT, () => {
  console.log(`Evia CRM server running on port ${PORT}`);
  checkTenderResultsTable();
  cleanupExpiredProspected();
});
