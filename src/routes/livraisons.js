const router = require('express').Router();
const { query } = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { body, query: qParam, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const err = validationResult(req);
  if (!err.isEmpty()) return res.status(400).json({ errors: err.array() });
  next();
};

// ── GET /api/livraisons ────────────────────────────────────────
// Query params: camion_id, chauffeur_id, statut, mois, annee, search, limit, offset
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { camion_id, chauffeur_id, statut, mois, annee, search,
            limit = 50, offset = 0 } = req.query;

    const conds = [], vals = [];
    if (camion_id)    { vals.push(camion_id);    conds.push(`l.camion_id = $${vals.length}`); }
    if (chauffeur_id) { vals.push(chauffeur_id); conds.push(`l.chauffeur_id = $${vals.length}`); }
    if (statut)       { vals.push(statut);       conds.push(`l.statut = $${vals.length}`); }
    if (mois)         { vals.push(parseInt(mois)); conds.push(`EXTRACT(MONTH FROM l.date_mission) = $${vals.length}`); }
    if (annee)        { vals.push(parseInt(annee)); conds.push(`EXTRACT(YEAR FROM l.date_mission) = $${vals.length}`); }
    if (search) {
      vals.push(`%${search}%`);
      conds.push(`(l.numero_conteneur ILIKE $${vals.length}
                OR l.nom_client ILIKE $${vals.length}
                OR l.zone_livraison ILIKE $${vals.length}
                OR c.numero ILIKE $${vals.length})`);
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    vals.push(parseInt(limit), parseInt(offset));

    const { rows } = await query(`
      SELECT
        l.*,
        c.numero  AS camion_numero,
        ch.nom    AS chauffeur_nom
      FROM livraisons l
      LEFT JOIN camions   c  ON c.id  = l.camion_id
      LEFT JOIN chauffeurs ch ON ch.id = l.chauffeur_id
      ${where}
      ORDER BY l.date_mission DESC
      LIMIT $${vals.length - 1} OFFSET $${vals.length}
    `, vals);

    // Total pour pagination
    const { rows: countRows } = await query(
      `SELECT COUNT(*) FROM livraisons l
       LEFT JOIN camions c ON c.id = l.camion_id
       LEFT JOIN chauffeurs ch ON ch.id = l.chauffeur_id ${where}`,
      vals.slice(0, -2)
    );

    res.json({ data: rows, total: parseInt(countRows[0].count), limit, offset });
  } catch (err) { next(err); }
});

// ── GET /api/livraisons/:id ────────────────────────────────────
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT l.*, c.numero AS camion_numero, ch.nom AS chauffeur_nom
      FROM livraisons l
      LEFT JOIN camions    c  ON c.id  = l.camion_id
      LEFT JOIN chauffeurs ch ON ch.id = l.chauffeur_id
      WHERE l.id = $1`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Livraison introuvable' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── POST /api/livraisons ───────────────────────────────────────
router.post('/', authenticate, [
  body('date_mission').isDate().withMessage('Date invalide'),
  body('camion_id').isUUID().withMessage('camion_id UUID requis'),
  body('numero_conteneur').trim().notEmpty().withMessage('Numéro de conteneur requis'),
  body('zone_livraison').trim().notEmpty().withMessage('Zone de livraison requise'),
  body('prix_transport').isInt({ min: 0 }).withMessage('Prix invalide'),
  body('type_conteneur').optional().isIn(['20 pieds','40 pieds','45 pieds']),
  body('statut').optional().isIn(['En transit','Livré','Annulé']),
  body('carburant').optional().isInt({ min: 0 }),
  body('frais').optional().isInt({ min: 0 }),
  body('ags').optional().isInt({ min: 0 }),
], validate, async (req, res, next) => {
  try {
    const {
      date_mission, camion_id, chauffeur_id, numero_conteneur,
      type_conteneur = '20 pieds', compagnie, zone_livraison,
      date_retour, prix_transport, carburant = 0, frais = 0, ags = 0,
      nom_client, statut = 'En transit', notes
    } = req.body;

    const { rows } = await query(`
      INSERT INTO livraisons
        (date_mission, camion_id, chauffeur_id, numero_conteneur, type_conteneur,
         compagnie, zone_livraison, date_retour, prix_transport, carburant,
         frais, ags, nom_client, statut, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *`,
      [date_mission, camion_id, chauffeur_id||null, numero_conteneur,
       type_conteneur, compagnie||null, zone_livraison, date_retour||null,
       prix_transport, carburant, frais, ags, nom_client||null,
       statut, notes||null, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// ── PATCH /api/livraisons/:id ──────────────────────────────────
router.patch('/:id', authenticate, [
  body('statut').optional().isIn(['En transit','Livré','Annulé']),
  body('prix_transport').optional().isInt({ min: 0 }),
  body('date_retour').optional().isDate(),
], validate, async (req, res, next) => {
  try {
    const allowed = ['date_mission','camion_id','chauffeur_id','numero_conteneur',
      'type_conteneur','compagnie','zone_livraison','date_retour','prix_transport',
      'carburant','frais','ags','nom_client','statut','notes'];
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
      `UPDATE livraisons SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals
    );
    if (!rows.length) return res.status(404).json({ error: 'Livraison introuvable' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── DELETE /api/livraisons/:id ─────────────────────────────────
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query(
      `DELETE FROM livraisons WHERE id = $1 RETURNING id`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Livraison introuvable' });
    res.json({ message: 'Livraison supprimée', id: rows[0].id });
  } catch (err) { next(err); }
});

module.exports = router;
