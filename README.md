# Séances Violoncelle — Guide de déploiement

## Structure des fichiers

```
/
├── css/
│   └── global.css          ← Styles partagés
├── js/
│   ├── supabase.js         ← Client Supabase + helpers auth
│   └── session.js          ← Toute la logique métier (session, filtrage, shuffle)
├── login.html              ← Connexion / inscription
├── index.html              ← Formulaire de génération de séance
├── preview.html            ← Aperçu et modification des blocs
├── lecture.html            ← Lecteur plein écran (séance en cours)
├── historique.html         ← Historique des séances
├── admin.html              ← Gestion bibliothèque + élèves (prof)
└── supabase_setup.sql      ← SQL à exécuter une fois dans Supabase
```

---

## Mise en place Supabase (10 min)

### 1. Créer un projet
→ https://supabase.com → New project (gratuit)

### 2. Créer les tables
→ Dashboard → SQL Editor → coller et exécuter `supabase_setup.sql`

### 3. Configurer le storage
→ Dashboard → Storage → New bucket
- Nom : `partitions`
- Cocher "Public bucket"

### 4. Récupérer les clés API
→ Dashboard → Settings → API
- Copier `Project URL` et `anon public key`

### 5. Configurer l'app
Ouvrir `js/supabase.js` et remplacer :
```js
const SUPABASE_URL     = "https://VOTRE_PROJET.supabase.co";
const SUPABASE_ANON_KEY = "VOTRE_ANON_KEY";
```

---

## Premier lancement

1. Ouvrir `login.html` dans un navigateur
2. S'inscrire avec votre email de professeur
3. Dans Supabase Dashboard → SQL Editor, promouvoir votre compte :
   ```sql
   UPDATE public.profiles
   SET role = 'prof', statut = 'actif'
   WHERE email = 'votre@email.com';
   ```
4. Se connecter → accès à `admin.html`
5. Ajouter des pièces dans la bibliothèque
6. Les élèves peuvent s'inscrire → vous les validez depuis `admin.html`

---

## Déploiement

L'app est un site statique — aucun serveur nécessaire.

**Options gratuites :**
- **GitHub Pages** : pousser les fichiers sur un repo public
- **Netlify** : drag & drop du dossier sur app.netlify.com
- **Vercel** : idem

**Pour iPad en PWA** (optionnel) :
Ajouter un `manifest.webmanifest` et un service worker basique pour l'icône sur l'écran d'accueil.

---

## Logique métier — résumé

| Fichier | Responsabilité |
|---------|---------------|
| `session.js` | Construction de session, pauses, remplacement de bloc, sauvegarde |
| `supabase.js` | Auth, accès données, helpers |
| `index.html` | Collecte des paramètres utilisateur |
| `preview.html` | Affichage, modification durée, remplacement de blocs |
| `lecture.html` | Lecture PDF, timers, tap/swipe, fin de séance |

**Règle clé :** la session (tableau de blocs avec pauses) est construite **une seule fois** dans `index.html` via `session.js`, puis stockée dans `sessionStorage`. Preview et Lecture lisent ce tableau sans le reconstruire.
