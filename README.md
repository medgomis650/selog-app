# SELOG Backend — API REST

**Senegal Expert Logistique** — Backend Node.js + PostgreSQL

---

## Stack technique

| Composant    | Technologie              |
|-------------|--------------------------|
| Runtime      | Node.js 18+              |
| Framework    | Express 4                |
| Base de données | PostgreSQL 14+        |
| Auth         | JWT (access + refresh)   |
| Sécurité     | Helmet, CORS, bcrypt, rate-limit |
| Validation   | express-validator        |

---

## Installation rapide

### 1. Prérequis

```bash
# Node.js 18+
node --version

# PostgreSQL 14+
psql --version
```

### 2. Créer la base de données PostgreSQL

```sql
-- Dans psql en tant que superuser :
CREATE USER selog_user WITH PASSWORD 'votre_mot_de_passe';
CREATE DATABASE selog_db OWNER selog_user;
GRANT ALL PRIVILEGES ON DATABASE selog_db TO selog_user;
```

### 3. Configurer l'environnement

```bash
cp .env.example .env
# Editer .env avec vos valeurs
nano .env
```

### 4. Installer les dépendances

```bash
npm install
```

### 5. Appliquer le schéma

```bash
npm run db:migrate
```

### 6. Insérer les données de démonstration

```bash
npm run db:seed
```

### 7. Démarrer le serveur

```bash
# Production
npm start

# Développement (rechargement automatique)
npm run dev
```

Le serveur écoute sur `http://localhost:3000`

---

## Endpoints API

### Authentification

| Méthode | Route             | Description              | Auth |
|---------|-------------------|--------------------------|------|
| POST    | /api/auth/login   | Connexion                | ❌   |
| POST    | /api/auth/refresh | Renouveler access token  | ❌   |
| POST    | /api/auth/logout  | Déconnexion              | ✅   |
| GET     | /api/auth/me      | Profil connecté          | ✅   |

**Login — exemple :**
```json
POST /api/auth/login
{ "username": "admin", "password": "admin123" }

Réponse :
{
  "accessToken": "eyJ...",
  "refreshToken": "uuid...",
  "user": { "id": "...", "username": "admin", "nom": "...", "role": "admin" }
}
```

**Headers requis pour routes protégées :**
```
Authorization: Bearer <accessToken>
```

---

### Tableau de bord

| Méthode | Route          | Description                    |
|---------|----------------|--------------------------------|
| GET     | /api/dashboard | KPIs + graphes + zones         |

Query params : `?mois=5&annee=2025`

---

### Camions

| Méthode | Route            | Description            | Rôle     |
|---------|------------------|------------------------|----------|
| GET     | /api/camions     | Liste + stats          | tous     |
| GET     | /api/camions/:id | Détail                 | tous     |
| POST    | /api/camions     | Créer                  | tous     |
| PATCH   | /api/camions/:id | Modifier               | tous     |
| DELETE  | /api/camions/:id | Supprimer              | admin    |

---

### Livraisons

| Méthode | Route               | Description        |
|---------|---------------------|--------------------|
| GET     | /api/livraisons     | Liste (filtrable)  |
| GET     | /api/livraisons/:id | Détail             |
| POST    | /api/livraisons     | Créer              |
| PATCH   | /api/livraisons/:id | Modifier           |
| DELETE  | /api/livraisons/:id | Supprimer          |

Query params : `?camion_id=&statut=Livré&mois=5&annee=2025&search=&limit=50&offset=0`

---

### Chauffeurs

| Méthode | Route               | Description |
|---------|---------------------|-------------|
| GET     | /api/chauffeurs     | Liste       |
| GET     | /api/chauffeurs/:id | Détail      |
| POST    | /api/chauffeurs     | Créer       |
| PATCH   | /api/chauffeurs/:id | Modifier    |
| DELETE  | /api/chauffeurs/:id | Supprimer (admin) |

---

### Pannes

| Méthode | Route          | Description            |
|---------|----------------|------------------------|
| GET     | /api/pannes    | Liste (`?camion_id=`)  |
| POST    | /api/pannes    | Déclarer               |
| PATCH   | /api/pannes/:id| Modifier               |
| DELETE  | /api/pannes/:id| Supprimer (admin)      |

---

### Charges fixes

| Méthode | Route         | Description                    |
|---------|---------------|--------------------------------|
| GET     | /api/charges  | `?mois=Mai&annee=2025`         |
| PUT     | /api/charges  | Upsert tableau de charges      |

**Exemple PUT :**
```json
{
  "mois": "Mai", "annee": 2025,
  "charges": [
    { "poste": "Salaires", "montant": 850000 },
    { "poste": "Internet", "montant": 15000 }
  ]
}
```

---

### Extra

| Méthode | Route                  | Description      |
|---------|------------------------|------------------|
| GET     | /api/extra/camion      | Liste extra camion |
| POST    | /api/extra/camion      | Ajouter          |
| DELETE  | /api/extra/camion/:id  | Supprimer        |
| GET     | /api/extra/general     | Liste extra général |
| POST    | /api/extra/general     | Ajouter          |
| DELETE  | /api/extra/general/:id | Supprimer        |

---

### Utilisateurs (admin uniquement)

| Méthode | Route               | Description          |
|---------|---------------------|----------------------|
| GET     | /api/users          | Liste                |
| POST    | /api/users          | Créer compte         |
| PATCH   | /api/users/:id      | Modifier rôle/actif  |
| PATCH   | /api/users/:id/password | Changer mot de passe |
| DELETE  | /api/users/:id      | Supprimer            |

---

## Structure du projet

```
selog-backend/
├── src/
│   ├── server.js           # Point d'entrée
│   ├── db/
│   │   └── pool.js         # Connexion PostgreSQL
│   ├── middleware/
│   │   ├── auth.js         # JWT + rôles
│   │   └── error.js        # Gestion erreurs
│   └── routes/
│       ├── auth.js         # Login / refresh / logout
│       ├── camions.js      # CRUD camions
│       ├── livraisons.js   # CRUD livraisons
│       ├── others.js       # Chauffeurs, pannes, charges, extra
│       └── admin.js        # Users + dashboard
├── scripts/
│   ├── schema.sql          # Schéma PostgreSQL complet
│   ├── migrate.js          # Applique le schéma
│   └── seed.js             # Données de démonstration
├── .env.example
├── package.json
└── README.md
```

---

## Sécurité en production

- Définir `NODE_ENV=production`
- Utiliser un `JWT_SECRET` aléatoire long (≥ 64 chars) : `openssl rand -hex 64`
- Activer HTTPS (nginx reverse proxy recommandé)
- Restreindre `CORS_ORIGIN` à votre domaine
- Sauvegardes PostgreSQL automatiques (`pg_dump`)

---

## Codes HTTP utilisés

| Code | Signification                 |
|------|-------------------------------|
| 200  | Succès                        |
| 201  | Créé                          |
| 400  | Données invalides             |
| 401  | Non authentifié / token expiré|
| 403  | Non autorisé (rôle)           |
| 404  | Ressource introuvable         |
| 409  | Conflit (doublon)             |
| 429  | Trop de requêtes              |
| 500  | Erreur serveur                |
