require('dotenv').config();
const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const morgan     = require('morgan');
const path       = require('path');
const rateLimit  = require('express-rate-limit');

const authRoutes       = require('./routes/auth');
const camionsRoutes    = require('./routes/camions');
const livraisonsRoutes = require('./routes/livraisons');
const { chauffeursRouter, pannesRouter, chargesRouter, extraRouter } = require('./routes/others');
const { usersRouter, dashRouter } = require('./routes/admin');
const { errorHandler } = require('./middleware/error');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── IMPORTANT : faire confiance au proxy Railway ──────────────
app.set('trust proxy', 1);

// ── Sécurité ──────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));

// ── Rate limiting ─────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  message: { error: 'Trop de tentatives, réessayez dans 15 minutes' }
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, max: 300,
  message: { error: 'Limite de requêtes atteinte' }
});

// ── Parsing ───────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Health check ──────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ── Routes API ────────────────────────────────────────────────
app.use('/api/auth',       loginLimiter, authRoutes);
app.use('/api',            apiLimiter);
app.use('/api/dashboard',  dashRouter);
app.use('/api/camions',    camionsRoutes);
app.use('/api/livraisons', livraisonsRoutes);
app.use('/api/chauffeurs', chauffeursRouter);
app.use('/api/pannes',     pannesRouter);
app.use('/api/charges',    chargesRouter);
app.use('/api/extra',      extraRouter);
app.use('/api/users',      usersRouter);

// ── Erreurs API ───────────────────────────────────────────────
app.use('/api', errorHandler);

// ── Frontend statique ─────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

// ── Démarrage ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 SELOG démarrée sur http://localhost:${PORT}`);
  console.log(`   Environnement : ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = app;
