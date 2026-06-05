const router = require('express').Router();
const { query } = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const err = validationResult(req);
  if (!err.isEmpty()) return res.status(400).json({ errors: err.array() });
  next();
};

// ── GET /api/previsions ────────────────────────────────────────
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { statut, search } = req.query;
    const conds = [], vals = [];
    if (statut) { vals.push(statut); conds.push(`p.statut = $${vals.length}`); }
    if (search) {
      vals.push(`%${search}%`);
      conds.push(`(p.numero_facture ILIKE $${vals.length}
               OR p.numero_conteneur ILIKE $${vals.length}
               OR p.numero_bl ILIKE $${vals.length}
               OR p.destination ILIKE $${vals.length})`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await query(`
      SELECT p.*, u.nom AS created_by_nom
      FROM previsions p
      LEFT JOIN utilisateurs u ON u.id = p.created_by
      ${where}
      ORDER BY p.date_facturation DESC, p.numero_facture
    `, vals);
    res.json(rows);
  } catch (err) { next(err); }
});

// ── GET /api/previsions/by-facture/:numero ─────────────────────
// Retourne tous les conteneurs d'une facture (pour autocomplete livraison)
router.get('/by-facture/:numero', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT id, numero_conteneur, type_conteneur, compagnie,
             destination, date_fin_validite, statut, numero_bl
      FROM previsions
      WHERE UPPER(TRIM(numero_facture)) = UPPER(TRIM($1))
        AND statut IN ('en_attente','en_cours')
      ORDER BY numero_conteneur
    `, [req.params.numero]);
    res.json(rows);
  } catch (err) { next(err); }
});

// ── GET /api/previsions/:id ────────────────────────────────────
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT * FROM previsions WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Prévision introuvable' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── POST /api/previsions ───────────────────────────────────────
router.post('/', authenticate, [
  body('date_facturation').isDate().withMessage('Date de facturation requise'),
  body('numero_facture').trim().notEmpty().withMessage('N° facture requis'),
  body('numero_conteneur')
    .trim().notEmpty().withMessage('N° conteneur requis')
    .toUpperCase()
    .matches(/^[A-Z]{4}[0-9]{7}$/).withMessage('Format conteneur : 4 lettres + 7 chiffres'),
  body('type_conteneur').optional().isIn(['20 pieds','40 pieds','45 pieds']),
  body('date_fin_validite').optional().isDate(),
], validate, async (req, res, next) => {
  try {
    const {
      date_facturation, numero_facture, numero_bl, destination,
      date_fin_validite, numero_conteneur, type_conteneur = '20 pieds',
      compagnie, notes
    } = req.body;
    const { rows } = await query(`
      INSERT INTO previsions
        (date_facturation, numero_facture, numero_bl, destination,
         date_fin_validite, numero_conteneur, type_conteneur,
         compagnie, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *`,
      [date_facturation, numero_facture.toUpperCase().trim(),
       numero_bl||null, destination||null, date_fin_validite||null,
       numero_conteneur.toUpperCase().trim(), type_conteneur,
       compagnie||null, notes||null, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// ── PATCH /api/previsions/:id ──────────────────────────────────
router.patch('/:id', authenticate, [
  body('statut').optional().isIn(['en_attente','en_cours','livre','expire']),
  body('date_facturation').optional().isDate(),
  body('date_fin_validite').optional().isDate(),
], validate, async (req, res, next) => {
  try {
    const allowed = ['date_facturation','numero_facture','numero_bl','destination',
      'date_fin_validite','numero_conteneur','type_conteneur','compagnie','statut',
      'livraison_id','notes'];
    const sets = [], vals = [];
    allowed.forEach(k => {
      if (req.body[k] !== undefined) {
        vals.push(req.body[k]);
        sets.push(`${k} = $${vals.length}`);
      }
    });
    if (!sets.length) return res.status(400).json({ error: 'Aucun champ' });
    vals.push(req.params.id);
    const { rows } = await query(
      `UPDATE previsions SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals);
    if (!rows.length) return res.status(404).json({ error: 'Prévision introuvable' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── DELETE /api/previsions/:id ─────────────────────────────────
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query(
      `DELETE FROM previsions WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Prévision introuvable' });
    res.json({ message: 'Prévision supprimée' });
  } catch (err) { next(err); }
});

module.exports = router;
