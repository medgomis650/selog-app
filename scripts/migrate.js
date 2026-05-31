#!/usr/bin/env node
// Lance le schéma SQL sur la base de données
require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function migrate() {
  const client = new Client({
    host:     process.env.DB_HOST,
    port:     parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    console.log('🔌 Connexion à PostgreSQL...');
    await client.connect();
    console.log('✅ Connecté');

    const sql = fs.readFileSync(
      path.join(__dirname, '../scripts/schema.sql'), 'utf8'
    );

    console.log('⚙️  Application du schéma...');
    await client.query(sql);
    console.log('✅ Schéma appliqué avec succès');
    console.log('\n📋 Tables créées :');
    const { rows } = await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    );
    rows.forEach(r => console.log(`   • ${r.tablename}`));
    console.log('\n🎉 Migration terminée !');
  } catch (err) {
    console.error('❌ Erreur migration :', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
