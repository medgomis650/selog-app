// middleware/auth.js — Vérification JWT + contrôle des rôles
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');

const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer '))
      return res.status(401).json({ error: 'Token manquant' });
    const token = header.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await query(
      'SELECT id, username, nom, role, actif FROM utilisateurs WHERE id = $1',
      [payload.sub]
    );
    if (!rows.length || !rows[0].actif)
      return res.status(401).json({ error: 'Utilisateur inactif ou supprimé' });
    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return res.status(401).json({ error: 'Token expiré', code: 'TOKEN_EXPIRED' });
    return res.status(401).json({ error: 'Token invalide' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role))
    return res.status(403).json({ error: 'Accès refusé — rôle insuffisant' });
  next();
};

const auditLog = (action, tableName) => async (req, res, next) => {
  res.on('finish', async () => {
    if (res.statusCode < 400 && req.user) {
      try {
        await query(
          `INSERT INTO audit_log (user_id,action,table_name,record_id,detail,ip_address)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [req.user.id, action, tableName,
           req.params.id || res.locals.createdId || null,
           JSON.stringify({ body: req.body, params: req.params }), req.ip]
        );
      } catch (_) {}
    }
  });
  next();
};

module.exports = { authenticate, requireRole, auditLog };
