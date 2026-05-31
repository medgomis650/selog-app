// routes/auth.js — Connexion, refresh, déconnexion
const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { query, withTransaction } = require('../config/db');
const { authenticate } = require('../middleware/auth');

const signAccessToken = (user) =>
  jwt.sign({ sub: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '15m' });

const signRefreshToken = () => crypto.randomBytes(64).toString('hex');

// POST /api/auth/login
router.post('/login',
  [body('username').trim().notEmpty(), body('password').notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const { username, password } = req.body;
      const { rows } = await query(
        'SELECT * FROM utilisateurs WHERE username=$1 AND actif=TRUE', [username]);
      const user = rows[0];
      const hash = user ? user.password_hash : '$2b$12$invalidhashtopreventtiming';
      const valid = await bcrypt.compare(password, hash);
      if (!user || !valid)
        return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });

      await query('UPDATE utilisateurs SET derniere_connexion=NOW() WHERE id=$1', [user.id]);

      const accessToken = signAccessToken(user);
      const refreshToken = signRefreshToken();
      const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      const expiresAt = new Date(Date.now() + 7*24*60*60*1000);
      await query('INSERT INTO refresh_tokens(user_id,token_hash,expires_at) VALUES($1,$2,$3)',
        [user.id, refreshHash, expiresAt]);

      res.json({ accessToken, refreshToken,
        user: { id: user.id, username: user.username, nom: user.nom, role: user.role } });
    } catch (err) {
      console.error('[Auth] Login:', err.message);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token manquant' });
  try {
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const { rows } = await query(
      `SELECT rt.*, u.id as uid, u.username, u.nom, u.role, u.actif
       FROM refresh_tokens rt JOIN utilisateurs u ON u.id=rt.user_id
       WHERE rt.token_hash=$1 AND rt.expires_at>NOW()`, [hash]);
    if (!rows.length || !rows[0].actif)
      return res.status(401).json({ error: 'Refresh token invalide ou expiré' });

    const row = rows[0];
    const newRT = signRefreshToken();
    const newHash = crypto.createHash('sha256').update(newRT).digest('hex');
    const exp = new Date(Date.now() + 7*24*60*60*1000);
    await withTransaction(async (c) => {
      await c.query('DELETE FROM refresh_tokens WHERE token_hash=$1', [hash]);
      await c.query('INSERT INTO refresh_tokens(user_id,token_hash,expires_at) VALUES($1,$2,$3)',
        [row.user_id, newHash, exp]);
    });
    res.json({
      accessToken: signAccessToken({ id: row.uid, username: row.username, role: row.role }),
      refreshToken: newRT });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    const h = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await query('DELETE FROM refresh_tokens WHERE token_hash=$1', [h]).catch(() => {});
  }
  res.json({ message: 'Déconnexion réussie' });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  const { id, username, nom, role } = req.user;
  res.json({ id, username, nom, role });
});

// POST /api/auth/change-password
router.post('/change-password', authenticate,
  [body('currentPassword').notEmpty(), body('newPassword').isLength({ min: 8 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const { rows } = await query('SELECT password_hash FROM utilisateurs WHERE id=$1', [req.user.id]);
      const valid = await bcrypt.compare(req.body.currentPassword, rows[0].password_hash);
      if (!valid) return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
      const hash = await bcrypt.hash(req.body.newPassword, 12);
      await query('UPDATE utilisateurs SET password_hash=$1 WHERE id=$2', [hash, req.user.id]);
      await query('DELETE FROM refresh_tokens WHERE user_id=$1', [req.user.id]);
      res.json({ message: 'Mot de passe modifié' });
    } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
  }
);

module.exports = router;
