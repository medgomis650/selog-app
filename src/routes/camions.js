const router = require('express').Router();
const { query } = require('../db/pool');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { body, param, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const err = validationResult(req);
  if (!err.isEmpty()) return res.status(400).json({ errors: err.array() });
  next();
};

// ── GET /api/camions ───────────────────────────────────────────
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT c.*,
        COUNT(l.id)              AS nb_missions,
        COALESCE(SUM(l.prix_transport), 0) AS ca_total,
        COALESCE(SUM(l.carburant + l.frais + l.ags), 0) AS cout_total,
        COUNT(p.id)              AS nb_pannes,
        COALESCE(SUM(p.cout_pieces + p.main_oeuvre), 0) AS cout_pannes
      FROM camions c
      LEFT JOIN livraisons l ON l.camion_id = c.id
      LEFT JOIN pannes p     ON p.camion_id = c.id
      GROUP BY c.id
      ORDER BY c.numero`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── GET /api/camions/:id ───────────────────────────────────────
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT * FROM camions WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Camion introuvable' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── POST /api/camions ──────────────────────────────────────────
router.post('/', authenticate, [
  body('numero').trim().notEmpty().withMessage('Numéro requis')
    .matches(/^[A-Z]{2}-\d{3}-[A-Z]{2}$/).withMessage('Format : AA-XXX-YY (ex: SN-001-AB)'),
  body('statut').optional().isIn(['actif','panne','maintenance','vendu']),
  body('marque').optional().trim().isLength({ max: 50 }),
  body('modele').optional().trim().isLength({ max: 50 }),
  body('annee').optional().isInt({ min: 1990, max: new Date().getFullYear() + 1 }),
], validate, async (req, res, next) => {
  try {
    const { numero, statut = 'actif', marque, modele, annee, notes } = req.body;
    const { rows } = await query(
      `INSERT INTO camions (numero, statut, marque, modele, annee, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [numero, statut, marque||null, modele||null, annee||null, notes||null, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// ── PATCH /api/camions/:id ─────────────────────────────────────
router.patch('/:id', authenticate, [
  body('statut').optional().isIn(['actif','panne','maintenance','vendu']),
], validate, async (req, res, next) => {
  try {
    const allowed = ['statut','marque','modele','annee','notes'];
    const sets = [], vals = [];
    allowed.forEach(k => {
      if (req.body[k] !== undefined) {
        vals.push(req.body[k]);
        sets.push(`${k} = $${vals.length}`);
      }
    });
    if (!sets.length) return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
    vals.push(req.params.id);
    const { rows } = await query(
      `UPDATE camions SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals
    );
    if (!rows.length) return res.status(404).json({ error: 'Camion introuvable' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── DELETE /api/camions/:id ────────────────────────────────────
router.delete('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await query(
      `DELETE FROM camions WHERE id = $1 RETURNING id`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Camion introuvable' });
    res.json({ message: 'Camion supprimé', id: rows[0].id });
  } catch (err) { next(err); }
});

module.exports = router;
