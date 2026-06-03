// ── UTILISATEURS (admin) ──────────────────────────────────────
const usersRouter = require('express').Router();
const bcrypt = require('bcrypt');
const { query } = require('../db/pool');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const err = validationResult(req);
  if (!err.isEmpty()) return res.status(400).json({ errors: err.array() });
  next();
};

usersRouter.get('/', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, username, nom, role, actif, last_login, created_at
       FROM utilisateurs ORDER BY created_at`);
    res.json(rows);
  } catch (err) { next(err); }
});

usersRouter.post('/', authenticate, requireAdmin, [
  body('username').trim().isLength({ min: 3, max: 50 }).withMessage('Username 3-50 chars'),
  body('password').isLength({ min: 8 }).withMessage('Mot de passe ≥ 8 caractères'),
  body('nom').trim().notEmpty().withMessage('Nom requis'),
  body('role').isIn(['admin','gestionnaire']).withMessage('Rôle invalide'),
], validate, async (req, res, next) => {
  try {
    const { username, password, nom, role } = req.body;
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await query(
      `INSERT INTO utilisateurs (username, password_hash, nom, role)
       VALUES ($1,$2,$3,$4)
       RETURNING id, username, nom, role, actif, created_at`,
      [username, hash, nom, role]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

usersRouter.patch('/:id/password', authenticate, [
  body('password').isLength({ min: 8 }).withMessage('Mot de passe ≥ 8 caractères'),
], validate, async (req, res, next) => {
  // Un admin peut changer n'importe quel mot de passe
  // Un gestionnaire ne peut changer que le sien
  if (req.user.role !== 'admin' && req.user.id !== req.params.id) {
    return res.status(403).json({ error: 'Non autorisé' });
  }
  try {
    const hash = await bcrypt.hash(req.body.password, 12);
    await query(`UPDATE utilisateurs SET password_hash = $1 WHERE id = $2`, [hash, req.params.id]);
    res.json({ message: 'Mot de passe mis à jour' });
  } catch (err) { next(err); }
});

usersRouter.patch('/:id', authenticate, requireAdmin, [
  body('role').optional().isIn(['admin','gestionnaire']),
  body('actif').optional().isBoolean(),
], validate, async (req, res, next) => {
  try {
    const allowed = ['nom','role','actif'];
    const sets = [], vals = [];
    allowed.forEach(k => { if (req.body[k] !== undefined) { vals.push(req.body[k]); sets.push(`${k} = $${vals.length}`); } });
    if (!sets.length) return res.status(400).json({ error: 'Aucun champ' });
    vals.push(req.params.id);
    const { rows } = await query(
      `UPDATE utilisateurs SET ${sets.join(', ')} WHERE id = $${vals.length}
       RETURNING id, username, nom, role, actif`, vals);
    if (!rows.length) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

usersRouter.delete('/:id', authenticate, requireAdmin, async (req, res, next) => {
  if (req.user.id === req.params.id) {
    return res.status(400).json({ error: 'Impossible de supprimer votre propre compte' });
  }
  try {
    const { rows } = await query(
      `DELETE FROM utilisateurs WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json({ message: 'Utilisateur supprimé' });
  } catch (err) { next(err); }
});

// ── DASHBOARD ─────────────────────────────────────────────────
const dashRouter = require('express').Router();

dashRouter.get('/', authenticate, async (req, res, next) => {
  try {
    const annee  = parseInt(req.query.annee  || new Date().getFullYear());
    const moisNb = parseInt(req.query.mois   || new Date().getMonth() + 1);

    const [kpi, parCamion, parZone, evolution] = await Promise.all([
      // KPIs du mois courant
      query(`
        SELECT
          COUNT(*)                         AS nb_livraisons,
          COALESCE(SUM(prix_transport), 0) AS ca_total,
          COALESCE(SUM(carburant + frais + ags), 0) AS cout_direct,
          COALESCE(AVG(CASE WHEN date_retour IS NOT NULL THEN (date_retour - date_mission) ELSE NULL END), 0) AS duree_moyenne,
          COUNT(CASE WHEN statut = 'Livré' THEN 1 END) AS nb_livrees,
          COUNT(CASE WHEN statut = 'En transit' THEN 1 END) AS nb_en_transit
        FROM livraisons
        WHERE EXTRACT(YEAR FROM date_mission) = $1
          AND EXTRACT(MONTH FROM date_mission) = $2`, [annee, moisNb]),

      // CA et missions par camion
      query(`
        SELECT c.numero, COUNT(l.id) AS nb_missions,
          COALESCE(SUM(l.prix_transport), 0) AS ca,
          COALESCE(SUM(l.carburant + l.frais + l.ags), 0) AS cout
        FROM camions c
        LEFT JOIN livraisons l ON l.camion_id = c.id
          AND EXTRACT(YEAR FROM l.date_mission) = $1
          AND EXTRACT(MONTH FROM l.date_mission) = $2
        GROUP BY c.id, c.numero ORDER BY ca DESC`, [annee, moisNb]),

      // Livraisons par zone
      query(`
        SELECT zone_livraison, COUNT(*) AS nb,
          SUM(prix_transport) AS ca
        FROM livraisons
        WHERE EXTRACT(YEAR FROM date_mission) = $1
          AND EXTRACT(MONTH FROM date_mission) = $2
        GROUP BY zone_livraison ORDER BY nb DESC`, [annee, moisNb]),

      // Évolution CA 6 derniers mois
      query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', date_mission), 'Mon YYYY') AS mois_label,
          EXTRACT(MONTH FROM date_mission) AS mois_nb,
          EXTRACT(YEAR FROM date_mission)  AS annee_nb,
          COALESCE(SUM(prix_transport), 0) AS ca,
          COUNT(*) AS nb
        FROM livraisons
        WHERE date_mission >= NOW() - INTERVAL '6 months'
        GROUP BY 1,2,3 ORDER BY annee_nb, mois_nb`),
    ]);

    // Noms de mois en français (correspondant à ce qui est stocké en base)
    const MOIS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin',
                     'Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    const moisNom     = MOIS_FR[moisNb - 1];
    const moisNomPrec = moisNb === 1 ? MOIS_FR[11] : MOIS_FR[moisNb - 2];
    const anneePrec   = moisNb === 1 ? annee - 1 : annee;

    // ── Requêtes supplémentaires en parallèle ──
    const [chargesQ, extraCamionQ, extraGenQ, pannesQ, precedentQ] = await Promise.all([

      // Charges fixes annuelles
      query(`SELECT COALESCE(SUM(montant), 0) AS total FROM charges_fixes`),

      // Extra par camion du mois courant
      query(`SELECT COALESCE(SUM(montant), 0) AS total FROM extra_camion
             WHERE EXTRACT(YEAR FROM date_depense) = $1
               AND EXTRACT(MONTH FROM date_depense) = $2`, [annee, moisNb]),

      // Extra général (cumulé)
      query(`SELECT COALESCE(SUM(montant), 0) AS total FROM extra_general`),

      // Total pannes du mois (pièces + main d'œuvre)
      query(`SELECT COALESCE(SUM(cout_pieces + main_oeuvre), 0) AS total FROM pannes
             WHERE EXTRACT(YEAR FROM date_panne) = $1
               AND EXTRACT(MONTH FROM date_panne) = $2`, [annee, moisNb]),

      // Données mois précédent (pour progression)
      query(`SELECT
               COALESCE(SUM(prix_transport),0) AS ca,
               COALESCE(SUM(carburant+frais+ags),0) AS cout_direct
             FROM livraisons
             WHERE EXTRACT(YEAR FROM date_mission) = $1
               AND EXTRACT(MONTH FROM date_mission) = $2`,
            [moisNb === 1 ? annee-1 : annee, moisNb === 1 ? 12 : moisNb-1]),
    ]);

    const caTotal        = parseFloat(kpi.rows[0]?.ca_total     || 0);
    const coutDirect     = parseFloat(kpi.rows[0]?.cout_direct  || 0); // carburant+frais+AGS
    const dureeM         = parseFloat(kpi.rows[0]?.duree_moyenne|| 0);
    const chargesTotal   = parseFloat(chargesQ.rows[0]?.total   || 0);
    const extraCamionM   = parseFloat(extraCamionQ.rows[0]?.total|| 0);
    const extraGenTotal  = parseFloat(extraGenQ.rows[0]?.total  || 0);
    const pannesTotal    = parseFloat(pannesQ.rows[0]?.total    || 0);

    // ── Bénéfice HORS charges fixes ──
    // = CA - carburant - frais - AGS - pannes - extra camion
    const beneficeHorsCharges = caTotal - coutDirect - pannesTotal - extraCamionM;

    // ── Résultat mensuel (net complet) ──
    // = CA - carburant - frais - AGS - pannes - tous extras - charges fixes
    const tousExtras   = extraCamionM + extraGenTotal;
    const resultat     = caTotal - coutDirect - pannesTotal - tousExtras - chargesTotal;

    // ── Progression vs mois précédent ──
    const caPrec       = parseFloat(precedentQ.rows[0]?.ca         || 0);
    const coutPrec     = parseFloat(precedentQ.rows[0]?.cout_direct|| 0);
    const resultatPrec = caPrec - coutPrec - pannesTotal - tousExtras - chargesTotal;
    const progression  = resultatPrec !== 0
      ? Math.round(((resultat - resultatPrec) / Math.abs(resultatPrec)) * 100)
      : (resultat > 0 ? 100 : resultat === 0 ? 0 : -100);

    // ── Statut du résultat ──
    let statut_resultat, pct_objectif;
    if (resultat === 0) {
      statut_resultat = 'atteint';
      pct_objectif    = 100;
    } else if (resultat > 0) {
      statut_resultat = 'excedent';
      pct_objectif    = caTotal > 0 ? Math.round((resultat / caTotal) * 100) : 100;
    } else {
      statut_resultat = 'deficit';
      pct_objectif    = caTotal > 0 ? Math.round((Math.abs(resultat) / caTotal) * 100) : 100;
    }

    res.json({
      kpi: {
        // Indicateurs de base
        nb_livraisons:       kpi.rows[0]?.nb_livraisons   || 0,
        ca_total:            caTotal,
        duree_moyenne:       dureeM.toFixed(1),
        // Bénéfice hors charges fixes
        benefice_hors_charges: beneficeHorsCharges,
        // Coûts détaillés
        cout_direct:         coutDirect,
        pannes_total:        pannesTotal,
        extra_camion:        extraCamionM,
        extra_general:       extraGenTotal,
        charges_fixes:       chargesTotal,
        // Résultat final
        resultat,
        statut_resultat,
        pct_objectif,
        progression,
      },
      par_camion: parCamion.rows,
      par_zone:   parZone.rows,
      evolution:  evolution.rows,
    });
  } catch (err) { next(err); }
});

module.exports = { usersRouter, dashRouter };
