#!/usr/bin/env node
// Insère des données de démonstration
require('dotenv').config();
const { Client } = require('pg');
const bcrypt = require('bcrypt');

async function seed() {
  const client = new Client({
    host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  });

  try {
    await client.connect();
    console.log('🌱 Insertion des données de démonstration...\n');

    // Utilisateurs
    const adminHash = await bcrypt.hash('admin123', 12);
    const gestHash  = await bcrypt.hash('selog2025', 12);
    const { rows: [admin] } = await client.query(
      `INSERT INTO utilisateurs (username, password_hash, nom, role)
       VALUES ('admin', $1, 'Administrateur SELOG', 'admin')
       ON CONFLICT (username) DO UPDATE SET password_hash = $1 RETURNING id`, [adminHash]
    );
    await client.query(
      `INSERT INTO utilisateurs (username, password_hash, nom, role)
       VALUES ('gestionnaire', $1, 'Gestionnaire', 'gestionnaire')
       ON CONFLICT (username) DO NOTHING`, [gestHash]
    );
    console.log('✅ Utilisateurs créés');

    // Camions
    const camionsData = [
      { numero: 'SN-4521-C', statut: 'actif',  marque: 'Mercedes', modele: 'Actros', annee: 2019 },
      { numero: 'SN-7832-D', statut: 'actif',  marque: 'Volvo',    modele: 'FH16',   annee: 2020 },
      { numero: 'SN-3310-A', statut: 'panne',  marque: 'MAN',      modele: 'TGX',    annee: 2017 },
      { numero: 'SN-6640-B', statut: 'actif',  marque: 'Scania',   modele: 'R450',   annee: 2021 },
      { numero: 'SN-9901-E', statut: 'actif',  marque: 'Mercedes', modele: 'Arocs',  annee: 2018 },
      { numero: 'SN-2255-F', statut: 'actif',  marque: 'DAF',      modele: 'XF',     annee: 2022 },
      { numero: 'SN-5588-G', statut: 'actif',  marque: 'Renault',  modele: 'T520',   annee: 2020 },
    ];
    const camionIds = {};
    for (const c of camionsData) {
      const { rows: [cam] } = await client.query(
        `INSERT INTO camions (numero, statut, marque, modele, annee, created_by)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (numero) DO UPDATE SET statut = $2 RETURNING id, numero`,
        [c.numero, c.statut, c.marque, c.modele, c.annee, admin.id]
      );
      camionIds[c.numero] = cam.id;
    }
    console.log('✅ Camions créés');

    // Chauffeurs
    const chauffeursData = [
      { nom: 'Moussa Diallo',   dob: '1985-03-12', tel: '77 543 21 10', permis: 'SN-A-23456' },
      { nom: 'Ibrahima Sow',    dob: '1989-07-22', tel: '76 890 45 32', permis: 'SN-B-34567' },
      { nom: 'Cheikh Ndiaye',   dob: '1991-11-05', tel: '70 234 56 78', permis: 'SN-A-45678' },
      { nom: 'Aliou Ba',        dob: '1987-02-18', tel: '78 654 32 10', permis: 'SN-C-56789' },
      { nom: 'Mamadou Faye',    dob: '1993-09-30', tel: '77 901 23 45', permis: 'SN-B-67890', statut: 'inactif' },
    ];
    const chauffeurIds = {};
    for (const ch of chauffeursData) {
      const { rows: [chauffeur] } = await client.query(
        `INSERT INTO chauffeurs (nom, date_naissance, telephone, numero_permis, statut)
         VALUES ($1,$2,$3,$4,$5) RETURNING id, nom`,
        [ch.nom, ch.dob, ch.tel, ch.permis, ch.statut || 'actif']
      );
      chauffeurIds[ch.nom] = chauffeur.id;
    }
    console.log('✅ Chauffeurs créés');

    // Livraisons
    const livraisonsData = [
      { date: '2025-05-20', cam: 'SN-4521-C', chauf: 'Moussa Diallo',  cont: 'MSCU1234567', type: '20 pieds', comp: 'MSC',         zone: 'Dakar',       retour: '2025-05-21', prix: 180000, carb: 45000,  frais: 12000, ags: 8000,  client: 'Coraf SA',     statut: 'Livré' },
      { date: '2025-05-19', cam: 'SN-7832-D', chauf: 'Ibrahima Sow',   cont: 'CMAU9876543', type: '40 pieds', comp: 'CMA CGM',     zone: 'Thiès',       retour: '2025-05-22', prix: 320000, carb: 85000,  frais: 25000, ags: 15000, client: 'Distribco',    statut: 'Livré' },
      { date: '2025-05-18', cam: 'SN-6640-B', chauf: 'Cheikh Ndiaye',  cont: 'HLCU5551234', type: '20 pieds', comp: 'Hapag-Lloyd', zone: 'Kaolack',     retour: null,         prix: 280000, carb: 95000,  frais: 30000, ags: 18000, client: 'Agro Sénégal', statut: 'En transit' },
      { date: '2025-05-17', cam: 'SN-9901-E', chauf: 'Aliou Ba',       cont: 'EVRU3344556', type: '40 pieds', comp: 'Evergreen',   zone: 'Saint-Louis', retour: '2025-05-21', prix: 350000, carb: 110000, frais: 40000, ags: 20000, client: 'NMA Sanders',  statut: 'Livré' },
      { date: '2025-05-15', cam: 'SN-4521-C', chauf: 'Moussa Diallo',  cont: 'OOLU7788990', type: '20 pieds', comp: 'OOCL',        zone: 'Dakar',       retour: '2025-05-16', prix: 160000, carb: 38000,  frais: 10000, ags: 7500,  client: 'Comafrique',   statut: 'Livré' },
      { date: '2025-05-14', cam: 'SN-2255-F', chauf: 'Ibrahima Sow',   cont: 'COSU1122334', type: '40 pieds', comp: 'COSCO',       zone: 'Ziguinchor',  retour: null,         prix: 420000, carb: 130000, frais: 50000, ags: 25000, client: 'SDE',          statut: 'En transit' },
      { date: '2025-04-28', cam: 'SN-4521-C', chauf: 'Moussa Diallo',  cont: 'MSCU5566778', type: '20 pieds', comp: 'MSC',         zone: 'Dakar',       retour: '2025-04-29', prix: 175000, carb: 42000,  frais: 11000, ags: 7500,  client: 'Sonatel',      statut: 'Livré' },
      { date: '2025-04-25', cam: 'SN-7832-D', chauf: 'Cheikh Ndiaye',  cont: 'CMAU3344556', type: '40 pieds', comp: 'CMA CGM',     zone: 'Diourbel',    retour: '2025-04-27', prix: 290000, carb: 78000,  frais: 22000, ags: 13000, client: 'Ecobank',      statut: 'Livré' },
    ];
    for (const l of livraisonsData) {
      await client.query(
        `INSERT INTO livraisons (date_mission, camion_id, chauffeur_id, numero_conteneur,
           type_conteneur, compagnie, zone_livraison, date_retour, prix_transport,
           carburant, frais, ags, nom_client, statut, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [l.date, camionIds[l.cam], chauffeurIds[l.chauf], l.cont, l.type, l.comp,
         l.zone, l.retour||null, l.prix, l.carb, l.frais, l.ags, l.client, l.statut, admin.id]
      );
    }
    console.log('✅ Livraisons créées');

    // Pannes
    const pannesData = [
      { date: '2025-05-10', cam: 'SN-3310-A', nature: 'Pneu crevé avant gauche',     pieces: 85000,  mo: 15000, ouvrier: 'Garages Auto Dakar', fin: '2025-05-10' },
      { date: '2025-05-05', cam: 'SN-7832-D', nature: 'Problème moteur (injection)',  pieces: 320000, mo: 75000, ouvrier: 'Mécano Express',      fin: '2025-05-08' },
      { date: '2025-04-28', cam: 'SN-9901-E', nature: 'Changement de freins',         pieces: 95000,  mo: 25000, ouvrier: 'Atelier Diallo',      fin: '2025-04-29' },
    ];
    for (const p of pannesData) {
      await client.query(
        `INSERT INTO pannes (date_panne, camion_id, nature_panne, cout_pieces, main_oeuvre, nom_ouvrier, date_fin, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [p.date, camionIds[p.cam], p.nature, p.pieces, p.mo, p.ouvrier, p.fin, admin.id]
      );
    }
    console.log('✅ Pannes créées');

    // Charges fixes Mai 2025
    const charges = [
      ['Salaires',850000],['Assurances camions',180000],['Assurance études',45000],
      ['Internet',15000],['Tontine',50000],['Dépenses famille',120000],
      ['Électricité',35000],['GPS',25000],['Salle de sport',20000],['Divers',60000],
    ];
    for (const [poste, montant] of charges) {
      await client.query(
        `INSERT INTO charges_fixes (mois, annee, poste, montant, created_by)
         VALUES ('Mai', 2025, $1, $2, $3)
         ON CONFLICT (mois, annee, poste) DO UPDATE SET montant = $2`,
        [poste, montant, admin.id]
      );
    }
    console.log('✅ Charges fixes créées');

    console.log('\n🎉 Seed terminé avec succès !');
    console.log('\n🔑 Comptes disponibles :');
    console.log('   admin        / admin123');
    console.log('   gestionnaire / selog2025\n');

  } catch (err) {
    console.error('❌ Erreur seed :', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seed();
