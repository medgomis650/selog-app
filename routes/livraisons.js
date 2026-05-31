// routes/livraisons.js — CRUD livraisons
const router = require('express').Router();
const { body, query: qVal, param, validationResult } = require('express-validator');
const db = require('../config/db');
const { authenticate, requireRole, auditLog } = require('../middleware/auth');

router.use(authenticate);

// GET /api/livraisons
router.get('/', async (req, res) => {
  try {
    const { camion, statut, zone, mois, annee, page = 1, limit = 50 } = req.query;
    const conditions = []; const params = [];
    let i = 1;
    if (camion)  { conditions.push(`c.numero = $${i++}`);   params.push(camion); }
    if (statut)  { conditions.push(`l.statut = $${i++}`);   params.push(statut); }
    if (zone)    { conditions.push(`l.zone_livraison ILIKE $${i++}`); params.push(`%${zone}%`); }
    if (mois)    { conditions.push(`EXTRACT(MONTH FROM l.date_livraison) = $${i++}`); params.push(mois); }
    if (annee)   { conditions.push(`EXTRACT(YEAR FROM l.date_livraison) = $${i++}`);  params.push(annee); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const offset = (page - 1) * limit;

    const { rows } = await db.query(`
      SELECT l.*, c.numero AS camion, ch.nom AS chauffeur,
             (l.carburant + l.frais + l.ags) AS cout_direct,
             (l.prix_transport - l.carburant - l.frais - l.ags) AS marge
      FROM livraisons l
      JOIN camions c ON c.id = l.camion_id
      JOIN chauffeurs ch ON ch.id = l.chauffeur_id
      ${where}
      ORDER BY l.date_livraison DESC
      LIMIT $${i++} OFFSET $${i++}`,
      [...params, limit, offset]);

    const total = await db.query(
      `SELECT COUNT(*) FROM livraisons l JOIN camions c ON c.id=l.camion_id ${where}`,
      params);

    res.json({ data: rows, total: parseInt(total.rows[0].count), page: +page, limit: +limit });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/livraisons/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT l.*, c.numero AS camion, ch.nom AS chauffeur
      FROM livraisons l
      JOIN camions c ON c.id=l.camion_id
      JOIN chauffeurs ch ON ch.id=l.chauffeur_id
      WHERE l.id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Livraison introuvable' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/livraisons
router.post('/',
  requireRole('admin', 'gestionnaire'),
  auditLog('CREATE', 'livraisons'),
  [
    body('date_livraison').isDate().withMessage('Date invalide'),
    body('camion_id').isInt({ gt: 0 }),
    body('chauffeur_id').isInt({ gt: 0 }),
    body('numero_conteneur').trim().notEmpty(),
    body('compagnie').trim().notEmpty(),
    body('zone_livraison').trim().notEmpty(),
    body('prix_transport').isInt({ min: 0 }),
    body('carburant').isInt({ min: 0 }),
    body('frais').isInt({ min: 0 }),
    body('ags').isInt({ min: 0 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const {
        date_livraison, camion_id, chauffeur_id, numero_conteneur,
        type_conteneur = '20 pieds', compagnie, zone_livraison,
        date_retour, prix_transport, carburant, frais, ags,
        nom_client, statut = 'En transit', notes
      } = req.body;

      const { rows } = await db.query(`
        INSERT INTO livraisons
          (date_livraison,camion_id,chauffeur_id,numero_conteneur,type_conteneur,
           compagnie,zone_livraison,date_retour,prix_transport,carburant,frais,ags,
           nom_client,statut,notes,created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        RETURNING *`,
        [date_livraison, camion_id, chauffeur_id, numero_conteneur, type_conteneur,
         compagnie, zone_livraison, date_retour || null, prix_transport, carburant,
         frais, ags, nom_client, statut, notes, req.user.id]);

      res.locals.createdId = rows[0].id;
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

// PATCH /api/livraisons/:id
router.patch('/:id',
  requireRole('admin', 'gestionnaire'),
  auditLog('UPDATE', 'livraisons'),
  async (req, res) => {
    try {
      const allowed = ['date_livraison','camion_id','chauffeur_id','numero_conteneur',
        'type_conteneur','compagnie','zone_livraison','date_retour','prix_transport',
        'carburant','frais','ags','nom_client','statut','notes'];
      const fields = Object.keys(req.body).filter(k => allowed.includes(k));
      if (!fields.length) return res.status(400).json({ error: 'Aucun champ à modifier' });

      const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
      const vals = fields.map(f => req.body[f]);
      const { rows } = await db.query(
        `UPDATE livraisons SET ${sets} WHERE id = $1 RETURNING *`,
        [req.params.id, ...vals]);
      if (!rows.length) return res.status(404).json({ error: 'Livraison introuvable' });
      res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
  }
);

// DELETE /api/livraisons/:id
router.delete('/:id', requireRole('admin'), auditLog('DELETE', 'livraisons'), async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM livraisons WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Livraison introuvable' });
    res.json({ message: 'Livraison supprimée' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
