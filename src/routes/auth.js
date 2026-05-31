const router  = require('express').Router();
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query }      = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

// ── POST /api/auth/login ───────────────────────────────────────
router.post('/login', [
  body('username').trim().notEmpty().withMessage('Identifiant requis'),
  body('password').notEmpty().withMessage('Mot de passe requis'),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { username, password } = req.body;

    // Récupérer l'utilisateur
    const { rows } = await query(
      `SELECT id, username, password_hash, nom, role, actif
       FROM utilisateurs WHERE username = $1`, [username]
    );
    const user = rows[0];

    if (!user || !user.actif) {
      return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
    }

    // Vérifier le mot de passe
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
    }

    // Générer les tokens
    const accessToken = jwt.sign(
      { id: user.id, username: user.username, role: user.role, nom: user.nom },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
    );
    const refreshToken = uuidv4();
    const refreshExpiry = new Date(Date.now() + 7 * 24 * 3600 * 1000);

    // Stocker le refresh token
    await query(
      `INSERT INTO sessions (utilisateur_id, refresh_token, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, refreshToken, refreshExpiry]
    );

    // Mettre à jour last_login
    await query(`UPDATE utilisateurs SET last_login = NOW() WHERE id = $1`, [user.id]);

    res.json({
      accessToken,
      refreshToken,
      user: { id: user.id, username: user.username, nom: user.nom, role: user.role }
    });
  } catch (err) { next(err); }
});

// ── POST /api/auth/refresh ─────────────────────────────────────
router.post('/refresh', async (req, res, next) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token requis' });

  try {
    const { rows } = await query(
      `SELECT s.*, u.username, u.nom, u.role, u.actif
       FROM sessions s
       JOIN utilisateurs u ON u.id = s.utilisateur_id
       WHERE s.refresh_token = $1 AND s.expires_at > NOW()`,
      [refreshToken]
    );
    if (!rows.length || !rows[0].actif) {
      return res.status(401).json({ error: 'Session invalide ou expirée' });
    }
    const s = rows[0];
    const accessToken = jwt.sign(
      { id: s.utilisateur_id, username: s.username, role: s.role, nom: s.nom },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
    );
    res.json({ accessToken });
  } catch (err) { next(err); }
});

// ── POST /api/auth/logout ──────────────────────────────────────
router.post('/logout', authenticate, async (req, res, next) => {
  const { refreshToken } = req.body;
  try {
    if (refreshToken) {
      await query(`DELETE FROM sessions WHERE refresh_token = $1`, [refreshToken]);
    }
    res.json({ message: 'Déconnexion réussie' });
  } catch (err) { next(err); }
});

// ── GET /api/auth/me ───────────────────────────────────────────
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, username, nom, role, last_login FROM utilisateurs WHERE id = $1`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
