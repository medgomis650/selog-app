// db/init.js — Initialisation de la base de données SQLite
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || './db/selog.db';
const db = new Database(path.resolve(DB_PATH));

// Activer les foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('📦 Création des tables SELOG...');

db.exec(`
  -- ═══════════════════════════════════════════════
  --  UTILISATEURS
  -- ═══════════════════════════════════════════════
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nom         TEXT    NOT NULL,
    email       TEXT    NOT NULL UNIQUE,
    password    TEXT    NOT NULL,
    role        TEXT    NOT NULL DEFAULT 'operateur' CHECK(role IN ('admin','manager','operateur')),
    actif       INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- ═══════════════════════════════════════════════
  --  FLOTTE
  -- ═══════════════════════════════════════════════
  CREATE TABLE IF NOT EXISTS camions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    numero      TEXT    NOT NULL UNIQUE,
    marque      TEXT,
    modele      TEXT,
    annee       INTEGER,
    statut      TEXT    NOT NULL DEFAULT 'actif' CHECK(statut IN ('actif','panne','maintenance','vendu')),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- ═══════════════════════════════════════════════
  --  CHAUFFEURS
  -- ═══════════════════════════════════════════════
  CREATE TABLE IF NOT EXISTS chauffeurs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nom           TEXT    NOT NULL,
    prenom        TEXT    NOT NULL,
    date_naissance TEXT,
    telephone     TEXT,
    numero_permis TEXT    UNIQUE,
    statut        TEXT    NOT NULL DEFAULT 'actif' CHECK(statut IN ('actif','inactif')),
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- ═══════════════════════════════════════════════
  --  LIVRAISONS
  -- ═══════════════════════════════════════════════
  CREATE TABLE IF NOT EXISTS livraisons (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    date_livraison  TEXT    NOT NULL,
    camion_id       INTEGER NOT NULL REFERENCES camions(id),
    chauffeur_id    INTEGER NOT NULL REFERENCES chauffeurs(id),
    numero_conteneur TEXT   NOT NULL,
    type_conteneur  TEXT    NOT NULL DEFAULT '20 pieds' CHECK(type_conteneur IN ('20 pieds','40 pieds','45 pieds')),
    compagnie       TEXT,
    zone_livraison  TEXT    NOT NULL,
    date_retour     TEXT,
    duree_mission   INTEGER GENERATED ALWAYS AS (
      CASE WHEN date_retour IS NOT NULL
        THEN MAX(1, CAST((julianday(date_retour) - julianday(date_livraison)) AS INTEGER))
        ELSE NULL END
    ) STORED,
    prix_transport  REAL    NOT NULL DEFAULT 0,
    carburant       REAL    NOT NULL DEFAULT 0,
    frais           REAL    NOT NULL DEFAULT 0,
    ags             REAL    NOT NULL DEFAULT 0,
    nom_client      TEXT,
    statut          TEXT    NOT NULL DEFAULT 'en_transit' CHECK(statut IN ('en_transit','livre','annule')),
    notes           TEXT,
    created_by      INTEGER REFERENCES users(id),
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- ═══════════════════════════════════════════════
  --  PANNES
  -- ═══════════════════════════════════════════════
  CREATE TABLE IF NOT EXISTS pannes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    date_panne      TEXT    NOT NULL,
    camion_id       INTEGER NOT NULL REFERENCES camions(id),
    nature_panne    TEXT    NOT NULL,
    prix_pieces     REAL    NOT NULL DEFAULT 0,
    main_oeuvre     REAL    NOT NULL DEFAULT 0,
    nom_ouvrier     TEXT,
    date_fin        TEXT,
    duree_depannage INTEGER,
    statut          TEXT    NOT NULL DEFAULT 'en_cours' CHECK(statut IN ('en_cours','resolu')),
    notes           TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- ═══════════════════════════════════════════════
  --  CHARGES FIXES
  -- ═══════════════════════════════════════════════
  CREATE TABLE IF NOT EXISTS charges_fixes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    mois        INTEGER NOT NULL CHECK(mois BETWEEN 1 AND 12),
    annee       INTEGER NOT NULL,
    salaires    REAL    NOT NULL DEFAULT 0,
    assur_camions REAL  NOT NULL DEFAULT 0,
    assur_etudes  REAL  NOT NULL DEFAULT 0,
    internet    REAL    NOT NULL DEFAULT 0,
    tontine     REAL    NOT NULL DEFAULT 0,
    depenses_famille REAL NOT NULL DEFAULT 0,
    electricite REAL    NOT NULL DEFAULT 0,
    gps         REAL    NOT NULL DEFAULT 0,
    salle_sport REAL    NOT NULL DEFAULT 0,
    divers      REAL    NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(mois, annee)
  );

  -- ═══════════════════════════════════════════════
  --  EXTRA PAR CAMION
  -- ═══════════════════════════════════════════════
  CREATE TABLE IF NOT EXISTS extra_camion (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    date_extra  TEXT    NOT NULL,
    camion_id   INTEGER NOT NULL REFERENCES camions(id),
    motif       TEXT    NOT NULL,
    montant     REAL    NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- ═══════════════════════════════════════════════
  --  EXTRA GÉNÉRAL
  -- ═══════════════════════════════════════════════
  CREATE TABLE IF NOT EXISTS extra_general (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nom         TEXT    NOT NULL,
    motif       TEXT    NOT NULL,
    montant     REAL    NOT NULL DEFAULT 0,
    date_extra  TEXT    NOT NULL DEFAULT (date('now')),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- ═══════════════════════════════════════════════
  --  SESSIONS (refresh tokens)
  -- ═══════════════════════════════════════════════
  CREATE TABLE IF NOT EXISTS sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    token       TEXT    NOT NULL UNIQUE,
    expires_at  TEXT    NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- INDEX pour les performances
  CREATE INDEX IF NOT EXISTS idx_livraisons_date   ON livraisons(date_livraison);
  CREATE INDEX IF NOT EXISTS idx_livraisons_camion ON livraisons(camion_id);
  CREATE INDEX IF NOT EXISTS idx_pannes_camion     ON pannes(camion_id);
  CREATE INDEX IF NOT EXISTS idx_extra_camion_id   ON extra_camion(camion_id);
`);

console.log('✅ Tables créées avec succès');

// ═══════════════════════════════════════════════
//  DONNÉES DE DÉMO
// ═══════════════════════════════════════════════
const insertSeed = db.transaction(() => {

  // Utilisateurs
  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@selog.sn');
  if (!existingUser) {
    const hash = bcrypt.hashSync('selog2025', 10);
    db.prepare(`INSERT INTO users (nom, email, password, role) VALUES (?, ?, ?, ?)`).run('Administrateur', 'admin@selog.sn', hash, 'admin');
    db.prepare(`INSERT INTO users (nom, email, password, role) VALUES (?, ?, ?, ?)`).run('Manager Ops', 'manager@selog.sn', bcrypt.hashSync('manager123', 10), 'manager');
    db.prepare(`INSERT INTO users (nom, email, password, role) VALUES (?, ?, ?, ?)`).run('Opérateur Saisie', 'operateur@selog.sn', bcrypt.hashSync('op123456', 10), 'operateur');
    console.log('👤 Utilisateurs créés');
  }

  // Camions
  const camionsData = [
    { numero: 'SN-4521-C', marque: 'Mercedes', modele: 'Actros', annee: 2019, statut: 'actif' },
    { numero: 'SN-7832-D', marque: 'Volvo', modele: 'FH16', annee: 2020, statut: 'actif' },
    { numero: 'SN-3310-A', marque: 'MAN', modele: 'TGX', annee: 2018, statut: 'panne' },
    { numero: 'SN-6640-B', marque: 'Scania', modele: 'R500', annee: 2021, statut: 'actif' },
    { numero: 'SN-9901-E', marque: 'DAF', modele: 'XF', annee: 2019, statut: 'actif' },
    { numero: 'SN-2255-F', marque: 'Renault', modele: 'T460', annee: 2022, statut: 'actif' },
    { numero: 'SN-5588-G', marque: 'Iveco', modele: 'S-Way', annee: 2021, statut: 'actif' },
  ];
  const stmtCam = db.prepare('INSERT OR IGNORE INTO camions (numero, marque, modele, annee, statut) VALUES (?, ?, ?, ?, ?)');
  camionsData.forEach(c => stmtCam.run(c.numero, c.marque, c.modele, c.annee, c.statut));
  console.log('🚛 Camions créés');

  // Chauffeurs
  const chauffeursData = [
    { nom: 'Diallo', prenom: 'Moussa', dob: '1985-03-12', tel: '77 543 21 10', permis: 'SN-A-23456' },
    { nom: 'Sow', prenom: 'Ibrahima', dob: '1989-07-22', tel: '76 890 45 32', permis: 'SN-B-34567' },
    { nom: 'Ndiaye', prenom: 'Cheikh', dob: '1991-11-05', tel: '70 234 56 78', permis: 'SN-A-45678' },
    { nom: 'Ba', prenom: 'Aliou', dob: '1987-02-18', tel: '78 654 32 10', permis: 'SN-C-56789' },
    { nom: 'Faye', prenom: 'Mamadou', dob: '1993-09-30', tel: '77 901 23 45', permis: 'SN-B-67890' },
  ];
  const stmtChauf = db.prepare('INSERT OR IGNORE INTO chauffeurs (nom, prenom, date_naissance, telephone, numero_permis) VALUES (?,?,?,?,?)');
  chauffeursData.forEach(c => stmtChauf.run(c.nom, c.prenom, c.dob, c.tel, c.permis));
  console.log('👨‍✈️ Chauffeurs créés');

  // Livraisons
  const cam = db.prepare('SELECT id FROM camions WHERE numero = ?');
  const chf = db.prepare('SELECT id FROM chauffeurs WHERE nom = ?');
  const stmtLiv = db.prepare(`INSERT OR IGNORE INTO livraisons
    (date_livraison,camion_id,chauffeur_id,numero_conteneur,type_conteneur,compagnie,zone_livraison,date_retour,prix_transport,carburant,frais,ags,nom_client,statut)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const livraisonsData = [
    ['2025-05-20', 'SN-4521-C', 'Diallo', 'MSCU1234567', '20 pieds', 'MSC', 'Dakar', '2025-05-21', 180000, 45000, 12000, 8000, 'Coraf SA', 'livre'],
    ['2025-05-19', 'SN-7832-D', 'Sow', 'CMAU9876543', '40 pieds', 'CMA CGM', 'Thiès', '2025-05-22', 320000, 85000, 25000, 15000, 'Distribco', 'livre'],
    ['2025-05-18', 'SN-6640-B', 'Ndiaye', 'HLCU5551234', '20 pieds', 'Hapag-Lloyd', 'Kaolack', null, 280000, 95000, 30000, 18000, 'Agro Sénégal', 'en_transit'],
    ['2025-05-17', 'SN-9901-E', 'Ba', 'EVRU3344556', '40 pieds', 'Evergreen', 'Saint-Louis', '2025-05-21', 350000, 110000, 40000, 20000, 'NMA Sanders', 'livre'],
    ['2025-05-15', 'SN-4521-C', 'Diallo', 'OOLU7788990', '20 pieds', 'OOCL', 'Dakar', '2025-05-16', 160000, 38000, 10000, 7500, 'Comafrique', 'livre'],
    ['2025-05-14', 'SN-2255-F', 'Sow', 'COSU1122334', '40 pieds', 'COSCO', 'Ziguinchor', null, 420000, 130000, 50000, 25000, 'SDE', 'en_transit'],
    ['2025-04-25', 'SN-4521-C', 'Diallo', 'MSCU4433221', '20 pieds', 'MSC', 'Dakar', '2025-04-26', 170000, 42000, 11000, 7500, 'Patisen', 'livre'],
    ['2025-04-22', 'SN-5588-G', 'Faye', 'HLCU6677889', '40 pieds', 'Hapag-Lloyd', 'Thiès', '2025-04-25', 310000, 82000, 24000, 14000, 'SONACOS', 'livre'],
  ];
  livraisonsData.forEach(l => {
    const c = cam.get(l[1]);
    const h = chf.get(l[2]);
    if (c && h) stmtLiv.run(l[0], c.id, h.id, l[3], l[4], l[5], l[6], l[7], l[8], l[9], l[10], l[11], l[12], l[13]);
  });
  console.log('📦 Livraisons créées');

  // Pannes
  const stmtPanne = db.prepare(`INSERT OR IGNORE INTO pannes
    (date_panne,camion_id,nature_panne,prix_pieces,main_oeuvre,nom_ouvrier,date_fin,duree_depannage,statut)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  [
    ['2025-05-10', 'SN-3310-A', 'Pneu crevé avant gauche', 85000, 15000, 'Garages Auto Dakar', '2025-05-10', 1, 'en_cours'],
    ['2025-05-05', 'SN-7832-D', 'Problème moteur (injection)', 320000, 75000, 'Mécano Express', '2025-05-08', 3, 'resolu'],
    ['2025-04-28', 'SN-9901-E', 'Changement de freins', 95000, 25000, 'Atelier Diallo', '2025-04-29', 1, 'resolu'],
  ].forEach(p => {
    const c = cam.get(p[1]);
    if (c) stmtPanne.run(p[0], c.id, p[2], p[3], p[4], p[5], p[6], p[7], p[8]);
  });
  console.log('🔧 Pannes créées');

  // Charges fixes
  db.prepare(`INSERT OR IGNORE INTO charges_fixes
    (mois,annee,salaires,assur_camions,assur_etudes,internet,tontine,depenses_famille,electricite,gps,salle_sport,divers)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(5, 2025, 850000, 180000, 45000, 15000, 50000, 120000, 35000, 25000, 20000, 60000);
  db.prepare(`INSERT OR IGNORE INTO charges_fixes
    (mois,annee,salaires,assur_camions,assur_etudes,internet,tontine,depenses_famille,electricite,gps,salle_sport,divers)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(4, 2025, 840000, 180000, 45000, 15000, 50000, 115000, 33000, 25000, 20000, 55000);
  console.log('💰 Charges fixes créées');

  // Extra
  const cId = cam.get('SN-4521-C')?.id;
  const cId2 = cam.get('SN-7832-D')?.id;
  if (cId) db.prepare('INSERT OR IGNORE INTO extra_camion (date_extra,camion_id,motif,montant) VALUES (?,?,?,?)').run('2025-05-12', cId, 'Lavage camion', 5000);
  if (cId2) db.prepare('INSERT OR IGNORE INTO extra_camion (date_extra,camion_id,motif,montant) VALUES (?,?,?,?)').run('2025-05-08', cId2, 'Péage autoroute', 3500);
  db.prepare('INSERT OR IGNORE INTO extra_general (nom,motif,montant) VALUES (?,?,?)').run('Diallo Ousmane', 'Commission', 25000);
  db.prepare('INSERT OR IGNORE INTO extra_general (nom,motif,montant) VALUES (?,?,?)').run('Fournitures bureau', 'Papeterie', 8500);
  console.log('➕ Extra créés');
});

insertSeed();

console.log('\n✅ Base de données initialisée avec succès !');
console.log('📋 Comptes disponibles :');
console.log('   admin@selog.sn     / selog2025   (Admin)');
console.log('   manager@selog.sn   / manager123  (Manager)');
console.log('   operateur@selog.sn / op123456    (Opérateur)');

db.close();
