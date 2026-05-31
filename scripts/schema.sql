-- ============================================================
--  SELOG — Schéma PostgreSQL
--  Senegal Expert Logistique
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── UTILISATEURS ──────────────────────────────────────────────
CREATE TABLE utilisateurs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username      VARCHAR(50) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nom           VARCHAR(100) NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'gestionnaire'
                  CHECK (role IN ('admin', 'gestionnaire')),
  actif         BOOLEAN NOT NULL DEFAULT TRUE,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── FLOTTE ────────────────────────────────────────────────────
CREATE TABLE camions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero        VARCHAR(20) UNIQUE NOT NULL,   -- ex: SN-4521-C
  statut        VARCHAR(20) NOT NULL DEFAULT 'actif'
                  CHECK (statut IN ('actif', 'panne', 'maintenance', 'vendu')),
  marque        VARCHAR(50),
  modele        VARCHAR(50),
  annee         INTEGER,
  notes         TEXT,
  created_by    UUID REFERENCES utilisateurs(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── CHAUFFEURS ────────────────────────────────────────────────
CREATE TABLE chauffeurs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nom           VARCHAR(100) NOT NULL,
  date_naissance DATE,
  telephone     VARCHAR(20),
  numero_permis VARCHAR(30),
  statut        VARCHAR(20) NOT NULL DEFAULT 'actif'
                  CHECK (statut IN ('actif', 'inactif', 'suspendu')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── LIVRAISONS ────────────────────────────────────────────────
CREATE TABLE livraisons (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date_mission      DATE NOT NULL,
  camion_id         UUID NOT NULL REFERENCES camions(id) ON DELETE RESTRICT,
  chauffeur_id      UUID REFERENCES chauffeurs(id) ON DELETE SET NULL,
  numero_conteneur  VARCHAR(20) NOT NULL,
  type_conteneur    VARCHAR(20) NOT NULL DEFAULT '20 pieds'
                      CHECK (type_conteneur IN ('20 pieds', '40 pieds', '45 pieds')),
  compagnie         VARCHAR(50),
  zone_livraison    VARCHAR(100) NOT NULL,
  date_retour       DATE,
  duree_mission     INTEGER GENERATED ALWAYS AS (
                      CASE WHEN date_retour IS NOT NULL
                        THEN (date_retour - date_mission)
                        ELSE NULL END
                    ) STORED,
  prix_transport    NUMERIC(12,0) NOT NULL DEFAULT 0,
  carburant         NUMERIC(12,0) NOT NULL DEFAULT 0,
  frais             NUMERIC(12,0) NOT NULL DEFAULT 0,
  ags               NUMERIC(12,0) NOT NULL DEFAULT 0,
  nom_client        VARCHAR(100),
  statut            VARCHAR(20) NOT NULL DEFAULT 'En transit'
                      CHECK (statut IN ('En transit', 'Livré', 'Annulé')),
  notes             TEXT,
  created_by        UUID REFERENCES utilisateurs(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── PANNES ────────────────────────────────────────────────────
CREATE TABLE pannes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date_panne      DATE NOT NULL,
  camion_id       UUID NOT NULL REFERENCES camions(id) ON DELETE RESTRICT,
  nature_panne    TEXT NOT NULL,
  cout_pieces     NUMERIC(12,0) NOT NULL DEFAULT 0,
  main_oeuvre     NUMERIC(12,0) NOT NULL DEFAULT 0,
  nom_ouvrier     VARCHAR(100),
  date_fin        DATE,
  duree_depannage INTEGER GENERATED ALWAYS AS (
                    CASE WHEN date_fin IS NOT NULL
                      THEN (date_fin - date_panne)
                      ELSE NULL END
                  ) STORED,
  created_by      UUID REFERENCES utilisateurs(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── CHARGES FIXES ─────────────────────────────────────────────
CREATE TABLE charges_fixes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mois        VARCHAR(20) NOT NULL,   -- ex: 'Mai'
  annee       INTEGER NOT NULL,
  poste       VARCHAR(50) NOT NULL,
  montant     NUMERIC(12,0) NOT NULL DEFAULT 0,
  notes       TEXT,
  created_by  UUID REFERENCES utilisateurs(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mois, annee, poste)
);

-- ── EXTRA PAR CAMION ──────────────────────────────────────────
CREATE TABLE extra_camion (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date_depense DATE NOT NULL,
  camion_id   UUID NOT NULL REFERENCES camions(id) ON DELETE RESTRICT,
  motif       VARCHAR(200) NOT NULL,
  montant     NUMERIC(12,0) NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES utilisateurs(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── EXTRA GÉNÉRAL ─────────────────────────────────────────────
CREATE TABLE extra_general (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nom         VARCHAR(100) NOT NULL,
  motif       VARCHAR(200) NOT NULL,
  montant     NUMERIC(12,0) NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES utilisateurs(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── SESSIONS (refresh tokens) ─────────────────────────────────
CREATE TABLE sessions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  utilisateur_id UUID NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  refresh_token  TEXT NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── INDEX ─────────────────────────────────────────────────────
CREATE INDEX idx_livraisons_date       ON livraisons(date_mission DESC);
CREATE INDEX idx_livraisons_camion     ON livraisons(camion_id);
CREATE INDEX idx_livraisons_chauffeur  ON livraisons(chauffeur_id);
CREATE INDEX idx_livraisons_statut     ON livraisons(statut);
CREATE INDEX idx_pannes_camion         ON pannes(camion_id);
CREATE INDEX idx_pannes_date           ON pannes(date_panne DESC);
CREATE INDEX idx_charges_mois_annee    ON charges_fixes(mois, annee);
CREATE INDEX idx_extra_camion_id       ON extra_camion(camion_id);
CREATE INDEX idx_sessions_token        ON sessions(refresh_token);
CREATE INDEX idx_sessions_user         ON sessions(utilisateur_id);

-- ── TRIGGER updated_at ────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE t TEXT;
BEGIN FOR t IN SELECT unnest(ARRAY[
  'utilisateurs','camions','chauffeurs','livraisons','pannes','charges_fixes'])
LOOP EXECUTE format('
  CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I
  FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
END LOOP; END $$;

-- ── VUE — Résumé mensuel ──────────────────────────────────────
CREATE OR REPLACE VIEW v_resume_mensuel AS
SELECT
  DATE_TRUNC('month', date_mission)   AS mois,
  COUNT(*)                            AS nb_livraisons,
  SUM(prix_transport)                 AS ca_total,
  SUM(carburant + frais + ags)        AS cout_direct,
  SUM(prix_transport) - SUM(carburant + frais + ags) AS marge_brute,
  AVG(duree_mission)                  AS duree_moyenne,
  COUNT(CASE WHEN statut = 'Livré' THEN 1 END) AS livrees
FROM livraisons
GROUP BY 1 ORDER BY 1 DESC;

-- ── VUE — Performance camion ──────────────────────────────────
CREATE OR REPLACE VIEW v_perf_camion AS
SELECT
  c.numero,
  c.statut,
  COUNT(l.id)             AS nb_missions,
  COALESCE(SUM(l.prix_transport), 0)  AS ca_total,
  COALESCE(SUM(l.carburant + l.frais + l.ags), 0) AS cout_total,
  COALESCE(SUM(l.prix_transport) - SUM(l.carburant + l.frais + l.ags), 0) AS marge,
  COUNT(p.id)             AS nb_pannes,
  COALESCE(SUM(p.cout_pieces + p.main_oeuvre), 0) AS cout_pannes
FROM camions c
LEFT JOIN livraisons  l ON l.camion_id = c.id
LEFT JOIN pannes      p ON p.camion_id = c.id
GROUP BY c.id, c.numero, c.statut
ORDER BY ca_total DESC;

-- ── SEED admin par défaut ─────────────────────────────────────
-- Mot de passe: admin123 (bcrypt)
INSERT INTO utilisateurs (username, password_hash, nom, role)
VALUES (
  'admin',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBpj1zjGt3Jm9m',
  'Administrateur SELOG',
  'admin'
) ON CONFLICT DO NOTHING;
