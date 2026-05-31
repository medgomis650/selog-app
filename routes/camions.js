// routes/camions.js
const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { getDb } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ─── GET /api/camions ─────────────────────────────────────────
router.get('/', (req, res) => {
  const db = getDb();
  const camions = db.prepare(`
    SELECT c.*,
      COUNT(DISTINCT l.id) AS nb_livraisons,
      COALESCE(SUM(l.prix_transport), 0) AS ca_total,
      COUNT(DISTINCT CASE WHEN p.statut = 'en_cours' THEN p.id END) AS pannes_actives
    FROM camions c
    LEFT JOIN livraisons l ON l.camion_id = c.id
    LEFT JOIN pannes p ON p.camion_id = c.id
    GROUP BY c.id
    ORDER BY c.numero
  `).all();
  res.json({ success: true, data: camions });
});

// ─── GET /api/camions/:id ─────────────────────────────────────
router.get('/:id', [param('id').isInt()], (req, res) => {
  const db = getDb();
  const camion = db.prepare('SELECT * FROM camions WHERE id = ?').get(req.params.id);
  if (!camion) return res.status(404).json({ success: false, message: 'Camion introuvable.' });

  const livraisons = db.prepare(`
    SELECT l.*, ch.nom || ' ' || ch.prenom AS chauffeur_nom
    FROM livraisons l
    LEFT JOIN chauffeurs ch ON ch.id = l.chauffeur_id
    WHERE l.camion_id = ? ORDER BY l.date_livraison DESC
  `).all(req.params.id);

  const pannes = db.prepare('SELECT * FROM pannes WHERE camion_id = ? ORDER BY date_panne DESC').all(req.params.id);
  const stats = db.prepare(`
    SELECT
      COUNT(*) AS nb_livraisons,
      COALESCE(SUM(prix_transport), 0) AS ca_total,
      COALESCE(SUM(carburant + frais + ags), 0) AS couts_variables,
      COALESCE(AVG(duree_mission), 0) AS duree_moyenne
    FROM livraisons WHERE camion_id = ?
  `).get(req.params.id);

  res.json({ success: true, data: { ...camion, livraisons, pannes, stats } });
});

// ─── POST /api/camions ────────────────────────────────────────
router.post('/', authorize('admin', 'manager'), [
  body('numero').trim().notEmpty().withMessage('Numéro immatriculation requis'),
  body('marque').optional().trim(),
  body('modele').optional().trim(),
  body('annee').optional().isInt({ min: 1990, max: 2030 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const db = getDb();
  try {
    const result = db.prepare(
      'INSERT INTO camions (numero, marque, modele, annee) VALUES (?, ?, ?, ?)'
    ).run(req.body.numero, req.body.marque || null, req.body.modele || null, req.body.annee || null);
    const camion = db.prepare('SELECT * FROM camions WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ success: true, message: 'Camion ajouté.', data: camion });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ success: false, message: 'Ce numéro existe déjà.' });
    throw e;
  }
});

// ─── PUT /api/camions/:id ─────────────────────────────────────
router.put('/:id', authorize('admin', 'manager'), [
  param('id').isInt(),
  body('statut').optional().isIn(['actif', 'panne', 'maintenance', 'vendu']),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const db = getDb();
  const { numero, marque, modele, annee, statut } = req.body;
  db.prepare(`UPDATE camions SET
    numero = COALESCE(?, numero),
    marque = COALESCE(?, marque),
    modele = COALESCE(?, modele),
    annee = COALESCE(?, annee),
    statut = COALESCE(?, statut),
    updated_at = datetime('now')
    WHERE id = ?`).run(numero, marque, modele, annee, statut, req.params.id);

  const camion = db.prepare('SELECT * FROM camions WHERE id = ?').get(req.params.id);
  res.json({ success: true, message: 'Camion mis à jour.', data: camion });
});

// ─── DELETE /api/camions/:id ──────────────────────────────────
router.delete('/:id', authorize('admin'), [param('id').isInt()], (req, res) => {
  const db = getDb();
  const hasLivraisons = db.prepare('SELECT 1 FROM livraisons WHERE camion_id = ? LIMIT 1').get(req.params.id);
  if (hasLivraisons) {
    return res.status(409).json({ success: false, message: 'Impossible de supprimer : ce camion a des livraisons.' });
  }
  db.prepare('DELETE FROM camions WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: 'Camion supprimé.' });
});

module.exports = router;
