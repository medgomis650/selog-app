// Centralise la gestion des erreurs Express
function errorHandler(err, req, res, next) {
  console.error(`[ERR] ${req.method} ${req.path}`, err.message);

  // Erreur de contrainte PostgreSQL
  if (err.code === '23505') {
    const field = err.detail?.match(/\((.+?)\)/)?.[1] || 'champ';
    return res.status(409).json({ error: `Doublon : ${field} existe déjà` });
  }
  if (err.code === '23503') {
    return res.status(409).json({ error: 'Référence inexistante (clé étrangère)' });
  }
  if (err.code === '23502') {
    return res.status(400).json({ error: 'Champ obligatoire manquant' });
  }

  // Erreur applicative connue
  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }

  // Erreur générique
  res.status(500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Erreur interne du serveur'
      : err.message
  });
}

// Crée une erreur avec code HTTP
function createError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

module.exports = { errorHandler, createError };
