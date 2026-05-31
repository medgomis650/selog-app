require('dotenv').config();
const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');

const authRoutes      = require('./routes/auth');
const camionsRoutes   = require('./routes/camions');
const livraisonsRoutes = require('./routes/livraisons');
const { chauffeursRouter, pannesRouter, chargesRouter, extraRouter } = require('./routes/others');
const { usersRouter, dashRouter } = require('./routes/admin');
const { errorHandler } = require('./middleware/error');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Sécurité ──────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

// ── Rate limiting ─────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,
  message: { error: 'Trop de tentatives de connexion, réessayez dans 15 minutes' }
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { error: 'Limite de requêtes atteinte' }
});

// ── Parsing ───────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// ── Logging ───────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ── Health check ──────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), env: process.env.NODE_ENV });
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

// ── 404 ───────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route introuvable : ${req.method} ${req.path}` });
});

// ── Gestionnaire d'erreurs ────────────────────────────────────
app.use(errorHandler);

// ── Démarrage ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 SELOG API démarrée sur http://localhost:${PORT}`);
  console.log(`   Environnement : ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Documentation : http://localhost:${PORT}/health\n`);
});

module.exports = app;

// Serve frontend statique (doit être après les routes API)
const path = require('path');
app.use(express.static(path.join(__dirname, '../public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});
