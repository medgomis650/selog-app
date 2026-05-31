-- ============================================================
--  SELOG — Schéma de base de données PostgreSQL
--  SENEGAL EXPERT LOGISTIQUE
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── UTILISATEURS ─────────────────────────────────────────────
CREATE TABLE utilisateurs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(50)  UNIQUE NOT NULL,
  password_hash TEXT         NOT NULL,
  nom           VARCHAR(120) NOT NULL,
  role          VARCHAR(20)  NOT NULL DEFAULT 'gestionnaire'
                             CHECK (role IN ('admin','gestionnaire','lecteur')),
  actif         BOOLEAN      NOT NULL DEFAULT TRUE,
  derniere_connexion TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── FLOTTE ───────────────────────────────────────────────────
CREATE TABLE camions (
  id            SERIAL PRIMARY KEY,
  numero        VARCHAR(20)  UNIQUE NOT NULL,
  statut        VARCHAR(20)  NOT NULL DEFAULT 'actif'
                             CHECK (statut IN ('actif','panne','vendu','inactif')),
  marque        VARCHAR(60),
  modele        VARCHAR(60),
  annee         SMALLINT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── CHAUFFEURS ───────────────────────────────────────────────
CREATE TABLE chauffeurs (
  id            SERIAL PRIMARY KEY,
  nom           VARCHAR(120) NOT NULL,
  date_naissance DATE,
  telephone     VARCHAR(30),
  numero_permis VARCHAR(50)  UNIQUE,
  statut        VARCHAR(20)  NOT NULL DEFAULT 'actif'
                             CHECK (statut IN ('actif','inactif','suspendu')),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── LIVRAISONS ───────────────────────────────────────────────
CREATE TABLE livraisons (
  id                SERIAL PRIMARY KEY,
  date_livraison    DATE         NOT NULL,
  camion_id         INTEGER      NOT NULL REFERENCES camions(id) ON DELETE RESTRICT,
  chauffeur_id      INTEGER      NOT NULL REFERENCES chauffeurs(id) ON DELETE RESTRICT,
  numero_conteneur  VARCHAR(20)  NOT NULL,
  type_conteneur    VARCHAR(20)  NOT NULL DEFAULT '20 pieds'
                                 CHECK (type_conteneur IN ('20 pieds','40 pieds','45 pieds')),
  compagnie         VARCHAR(80)  NOT NULL,
  zone_livraison    VARCHAR(100) NOT NULL,
  date_retour       DATE,
  duree_mission     SMALLINT     GENERATED ALWAYS AS (
                      CASE WHEN date_retour IS NOT NULL
                           THEN (date_retour - date_livraison)::SMALLINT
                           ELSE NULL END
                    ) STORED,
  prix_transport    NUMERIC(12,0) NOT NULL DEFAULT 0,
  carburant         NUMERIC(12,0) NOT NULL DEFAULT 0,
  frais             NUMERIC(12,0) NOT NULL DEFAULT 0,
  ags               NUMERIC(12,0) NOT NULL DEFAULT 0,
  nom_client        VARCHAR(120),
  statut            VARCHAR(20)  NOT NULL DEFAULT 'En transit'
                                 CHECK (statut IN ('En transit','Livré','Annulé')),
  notes             TEXT,
  created_by        UUID         REFERENCES utilisateurs(id),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── GESTION DES PANNES ───────────────────────────────────────
CREATE TABLE pannes (
  id              SERIAL PRIMARY KEY,
  date_panne      DATE         NOT NULL,
  camion_id       INTEGER      NOT NULL REFERENCES camions(id) ON DELETE RESTRICT,
  nature_panne    TEXT         NOT NULL,
  prix_pieces     NUMERIC(12,0) NOT NULL DEFAULT 0,
  main_oeuvre     NUMERIC(12,0) NOT NULL DEFAULT 0,
  nom_ouvrier     VARCHAR(120),
  date_fin        DATE,
  duree_depannage SMALLINT     GENERATED ALWAYS AS (
                    CASE WHEN date_fin IS NOT NULL
                         THEN (date_fin - date_panne)::SMALLINT
                         ELSE NULL END
                  ) STORED,
  statut          VARCHAR(20)  NOT NULL DEFAULT 'en cours'
                               CHECK (statut IN ('en cours','résolu')),
  created_by      UUID         REFERENCES utilisateurs(id),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── CHARGES FIXES ────────────────────────────────────────────
CREATE TABLE charges_fixes (
  id           SERIAL PRIMARY KEY,
  mois         SMALLINT     NOT NULL CHECK (mois BETWEEN 1 AND 12),
  annee        SMALLINT     NOT NULL,
  salaires     NUMERIC(12,0) NOT NULL DEFAULT 0,
  assur_camions NUMERIC(12,0) NOT NULL DEFAULT 0,
  assur_etudes  NUMERIC(12,0) NOT NULL DEFAULT 0,
  internet     NUMERIC(12,0) NOT NULL DEFAULT 0,
  tontine      NUMERIC(12,0) NOT NULL DEFAULT 0,
  depenses_famille NUMERIC(12,0) NOT NULL DEFAULT 0,
  electricite  NUMERIC(12,0) NOT NULL DEFAULT 0,
  gps          NUMERIC(12,0) NOT NULL DEFAULT 0,
  salle_sport  NUMERIC(12,0) NOT NULL DEFAULT 0,
  divers       NUMERIC(12,0) NOT NULL DEFAULT 0,
  created_by   UUID         REFERENCES utilisateurs(id),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (mois, annee)
);

-- ── EXTRA 1 (par camion) ─────────────────────────────────────
CREATE TABLE extra_camion (
  id        SERIAL PRIMARY KEY,
  date_dep  DATE         NOT NULL,
  camion_id INTEGER      NOT NULL REFERENCES camions(id) ON DELETE RESTRICT,
  motif     VARCHAR(200) NOT NULL,
  montant   NUMERIC(12,0) NOT NULL DEFAULT 0,
  created_by UUID        REFERENCES utilisateurs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── EXTRA 2 (général) ────────────────────────────────────────
CREATE TABLE extra_general (
  id        SERIAL PRIMARY KEY,
  nom       VARCHAR(120) NOT NULL,
  motif     VARCHAR(200) NOT NULL,
  montant   NUMERIC(12,0) NOT NULL DEFAULT 0,
  created_by UUID        REFERENCES utilisateurs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── REFRESH TOKENS ───────────────────────────────────────────
CREATE TABLE refresh_tokens (
  id          SERIAL PRIMARY KEY,
  user_id     UUID         NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  token_hash  TEXT         NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── AUDIT LOG ────────────────────────────────────────────────
CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID         REFERENCES utilisateurs(id),
  action      VARCHAR(50)  NOT NULL,
  table_name  VARCHAR(50),
  record_id   INTEGER,
  detail      JSONB,
  ip_address  INET,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════
--  VUES UTILES
-- ══════════════════════════════════════════════════════════════

CREATE VIEW v_livraisons AS
SELECT
  l.id,
  l.date_livraison,
  c.numero          AS camion,
  ch.nom            AS chauffeur,
  l.numero_conteneur,
  l.type_conteneur,
  l.compagnie,
  l.zone_livraison,
  l.date_retour,
  l.duree_mission,
  l.prix_transport,
  l.carburant,
  l.frais,
  l.ags,
  (l.carburant + l.frais + l.ags) AS cout_direct,
  (l.prix_transport - l.carburant - l.frais - l.ags) AS marge,
  l.nom_client,
  l.statut,
  l.notes,
  l.created_at,
  l.updated_at
FROM livraisons l
JOIN camions   c  ON c.id  = l.camion_id
JOIN chauffeurs ch ON ch.id = l.chauffeur_id;

CREATE VIEW v_dashboard AS
SELECT
  EXTRACT(YEAR  FROM date_livraison)::INT AS annee,
  EXTRACT(MONTH FROM date_livraison)::INT AS mois,
  COUNT(*)                                AS nb_livraisons,
  SUM(prix_transport)                     AS ca_total,
  SUM(carburant + frais + ags)            AS couts_directs,
  SUM(prix_transport - carburant - frais - ags) AS marge_brute,
  AVG(duree_mission)                      AS duree_moyenne
FROM livraisons
WHERE statut != 'Annulé'
GROUP BY 1, 2;

-- ══════════════════════════════════════════════════════════════
--  INDEXES
-- ══════════════════════════════════════════════════════════════

CREATE INDEX idx_livraisons_date    ON livraisons(date_livraison DESC);
CREATE INDEX idx_livraisons_camion  ON livraisons(camion_id);
CREATE INDEX idx_livraisons_statut  ON livraisons(statut);
CREATE INDEX idx_pannes_camion      ON pannes(camion_id);
CREATE INDEX idx_pannes_date        ON pannes(date_panne DESC);
CREATE INDEX idx_audit_user         ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_refresh_tokens     ON refresh_tokens(token_hash);

-- ══════════════════════════════════════════════════════════════
--  TRIGGER updated_at automatique
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['utilisateurs','camions','chauffeurs','livraisons','pannes','charges_fixes']
  LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;

-- ══════════════════════════════════════════════════════════════
--  DONNÉES INITIALES
-- ══════════════════════════════════════════════════════════════

-- Admin par défaut (mot de passe: admin123)
INSERT INTO utilisateurs (username, password_hash, nom, role)
VALUES ('admin', '$2b$12$placeholder_replace_with_real_hash', 'Administrateur', 'admin');

-- (Remplacer password_hash via: SELECT crypt('admin123', gen_salt('bf', 12));)
