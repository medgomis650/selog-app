// ── CHAUFFEURS ────────────────────────────────────────────────
const chauffeursRouter = require('express').Router();
const { query } = require('../db/pool');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const err = validationResult(req);
  if (!err.isEmpty()) return res.status(400).json({ errors: err.array() });
  next();
};

chauffeursRouter.get('/', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT ch.*,
        COUNT(l.id) AS nb_missions,
        COALESCE(SUM(l.prix_transport), 0) AS ca_total
      FROM chauffeurs ch
      LEFT JOIN livraisons l ON l.chauffeur_id = ch.id
      GROUP BY ch.id ORDER BY ch.nom`);
    res.json(rows);
  } catch (err) { next(err); }
});

chauffeursRouter.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT * FROM chauffeurs WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Chauffeur introuvable' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

chauffeursRouter.post('/', authenticate, [
  body('nom').trim().notEmpty().withMessage('Nom requis'),
  body('telephone').optional().trim(),
  body('numero_permis').optional().trim(),
  body('date_naissance').optional().isDate(),
  body('statut').optional().isIn(['actif','inactif','suspendu']),
], validate, async (req, res, next) => {
  try {
    const { nom, date_naissance, telephone, numero_permis, statut = 'actif' } = req.body;
    const { rows } = await query(
      `INSERT INTO chauffeurs (nom, date_naissance, telephone, numero_permis, statut)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [nom, date_naissance||null, telephone||null, numero_permis||null, statut]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

chauffeursRouter.patch('/:id', authenticate, [
  body('statut').optional().isIn(['actif','inactif','suspendu']),
], validate, async (req, res, next) => {
  try {
    const allowed = ['nom','date_naissance','telephone','numero_permis','statut'];
    const sets = [], vals = [];
    allowed.forEach(k => { if (req.body[k] !== undefined) { vals.push(req.body[k]); sets.push(`${k} = $${vals.length}`); } });
    if (!sets.length) return res.status(400).json({ error: 'Aucun champ' });
    vals.push(req.params.id);
    const { rows } = await query(`UPDATE chauffeurs SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals);
    if (!rows.length) return res.status(404).json({ error: 'Chauffeur introuvable' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

chauffeursRouter.delete('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await query(`DELETE FROM chauffeurs WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Chauffeur introuvable' });
    res.json({ message: 'Chauffeur supprimé' });
  } catch (err) { next(err); }
});

// ── PANNES ────────────────────────────────────────────────────
const pannesRouter = require('express').Router();

pannesRouter.get('/', authenticate, async (req, res, next) => {
  try {
    const { camion_id } = req.query;
    const conds = [], vals = [];
    if (camion_id) { vals.push(camion_id); conds.push(`p.camion_id = $1`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await query(`
      SELECT p.*, c.numero AS camion_numero,
        (p.cout_pieces + p.main_oeuvre) AS cout_total
      FROM pannes p
      LEFT JOIN camions c ON c.id = p.camion_id
      ${where}
      ORDER BY p.date_panne DESC`, vals);
    res.json(rows);
  } catch (err) { next(err); }
});

pannesRouter.post('/', authenticate, [
  body('date_panne').isDate().withMessage('Date requise'),
  body('camion_id').isUUID().withMessage('camion_id UUID requis'),
  body('nature_panne').trim().notEmpty().withMessage('Nature de la panne requise'),
  body('cout_pieces').optional().isInt({ min: 0 }),
  body('main_oeuvre').optional().isInt({ min: 0 }),
  body('date_fin').optional().isDate(),
], validate, async (req, res, next) => {
  try {
    const { date_panne, camion_id, nature_panne, cout_pieces = 0,
            main_oeuvre = 0, nom_ouvrier, date_fin } = req.body;
    const { rows } = await query(
      `INSERT INTO pannes (date_panne, camion_id, nature_panne, cout_pieces,
         main_oeuvre, nom_ouvrier, date_fin, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [date_panne, camion_id, nature_panne, cout_pieces, main_oeuvre,
       nom_ouvrier||null, date_fin||null, req.user.id]
    );
    // Mettre le camion en statut panne
    await query(`UPDATE camions SET statut = 'panne' WHERE id = $1`, [camion_id]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

pannesRouter.patch('/:id', authenticate, async (req, res, next) => {
  try {
    const allowed = ['date_panne','nature_panne','cout_pieces','main_oeuvre','nom_ouvrier','date_fin'];
    const sets = [], vals = [];
    allowed.forEach(k => { if (req.body[k] !== undefined) { vals.push(req.body[k]); sets.push(`${k} = $${vals.length}`); } });
    if (!sets.length) return res.status(400).json({ error: 'Aucun champ' });
    vals.push(req.params.id);
    const { rows } = await query(`UPDATE pannes SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals);
    if (!rows.length) return res.status(404).json({ error: 'Panne introuvable' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

pannesRouter.delete('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await query(`DELETE FROM pannes WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Panne introuvable' });
    res.json({ message: 'Panne supprimée' });
  } catch (err) { next(err); }
});

// ── CHARGES FIXES ─────────────────────────────────────────────
const chargesRouter = require('express').Router();

// GET toutes les charges — dédoublonné par poste (garde le plus récent)
chargesRouter.get('/', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT DISTINCT ON (LOWER(TRIM(poste))) *
      FROM charges_fixes
      ORDER BY LOWER(TRIM(poste)), updated_at DESC, created_at DESC
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

// PUT — upsert charges annuelles (un seul enregistrement par poste)
chargesRouter.put('/', authenticate, [
  body('charges').isArray().withMessage('Tableau de charges requis'),
  body('charges.*.poste').notEmpty(),
  body('charges.*.montant').isInt({ min: 0 }),
], validate, async (req, res, next) => {
  try {
    const { charges } = req.body;
    const annee = new Date().getFullYear();
    const result = [];
    for (const c of charges) {
      // Supprimer tout ancien doublon sur ce poste avant d'insérer
      await query(
        `DELETE FROM charges_fixes WHERE LOWER(TRIM(poste)) = LOWER($1) AND id NOT IN (
           SELECT id FROM charges_fixes WHERE LOWER(TRIM(poste)) = LOWER($1) ORDER BY created_at DESC LIMIT 1
         )`, [c.poste]
      );
      const { rows } = await query(
        `INSERT INTO charges_fixes (mois, annee, poste, montant, created_by)
         VALUES ('Annuel', $1, $2, $3, $4)
         ON CONFLICT (mois, annee, poste)
         DO UPDATE SET montant = EXCLUDED.montant, updated_at = NOW()
         RETURNING *`,
        [annee, c.poste, c.montant, req.user.id]
      );
      result.push(rows[0]);
    }
    res.json(result);
  } catch (err) { next(err); }
});

// DELETE — supprimer une charge par ID
chargesRouter.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query(`DELETE FROM charges_fixes WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Charge introuvable' });
    res.json({ message: 'Charge supprimee' });
  } catch (err) { next(err); }
});
// ── EXTRA ─────────────────────────────────────────────────────
const extraRouter = require('express').Router();

extraRouter.get('/camion', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT e.*, c.numero AS camion_numero
      FROM extra_camion e LEFT JOIN camions c ON c.id = e.camion_id
      ORDER BY e.date_depense DESC`);
    res.json(rows);
  } catch (err) { next(err); }
});

extraRouter.post('/camion', authenticate, [
  body('date_depense').isDate(),
  body('camion_id').isUUID(),
  body('motif').trim().notEmpty(),
  body('montant').isInt({ min: 0 }),
], validate, async (req, res, next) => {
  try {
    const { date_depense, camion_id, motif, montant } = req.body;
    const { rows } = await query(
      `INSERT INTO extra_camion (date_depense, camion_id, motif, montant, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [date_depense, camion_id, motif, montant, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

extraRouter.delete('/camion/:id', authenticate, async (req, res, next) => {
  try {
    await query(`DELETE FROM extra_camion WHERE id = $1`, [req.params.id]);
    res.json({ message: 'Supprimé' });
  } catch (err) { next(err); }
});

extraRouter.get('/general', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT * FROM extra_general ORDER BY date_depense DESC NULLS LAST, created_at DESC`);
    res.json(rows);
  } catch (err) { next(err); }
});

extraRouter.post('/general', authenticate, [
  body('nom').trim().notEmpty(),
  body('motif').trim().notEmpty(),
  body('montant').isInt({ min: 0 }),
  body('date_depense').optional({checkFalsy:true}).isDate(),
], validate, async (req, res, next) => {
  try {
    const { nom, motif, montant, date_depense } = req.body;
    const { rows } = await query(
      `INSERT INTO extra_general (nom, motif, montant, date_depense, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [nom, motif, montant, date_depense||new Date().toISOString().split('T')[0], req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

extraRouter.delete('/general/:id', authenticate, async (req, res, next) => {
  try {
    await query(`DELETE FROM extra_general WHERE id = $1`, [req.params.id]);
    res.json({ message: 'Supprimé' });
  } catch (err) { next(err); }
});

module.exports = { chauffeursRouter, pannesRouter, chargesRouter, extraRouter };
