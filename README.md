# Recherche de personnes — Documentation

Application web qui permet de chercher des personnes dans une base
**MongoDB** en **langage naturel** (ex : *« les gens de plus de 30 ans
qui s'appellent Marc »*). Le projet tourne **en local sur Node** via
`bun run dev` (ou `npm run dev`).

---

## 1. Stack & langages utilisés (qui fait quoi, dans quel langage)

| Endroit dans le projet | Langage | Pourquoi ce langage ici |
| --- | --- | --- |
| `src/routes/*.tsx`, `src/components/**` | **TypeScript + JSX (React 19)** | Toute l'UI : composants typés, JSX pour le rendu, hooks React pour l'état (`useState`, `useEffect`). TypeScript évite les erreurs de typage entre client et serveur. |
| `src/styles.css` + classes Tailwind dans le JSX | **CSS (Tailwind v4)** | Styles utilitaires + tokens sémantiques (couleurs, radius…) déclarés en CSS pur via `@import` / `@theme`. |
| `src/lib/*.functions.ts` (`mongoSearch`, `promptToFilter`) | **TypeScript (Node, côté serveur)** | Server functions TanStack Start : code exécuté sur Node, jamais envoyé au navigateur. C'est là qu'on lit les variables d'env et qu'on appelle le proxy. **Zod** (TS) valide les entrées. |
| `proxy/server.js` | **JavaScript (Node, ESM)** | Petit service HTTP autonome : pas besoin du build TS, on garde du JS natif Node pour démarrer vite avec `node server.js`. Utilise **Express** (HTTP) et le driver **`mongodb`** (TCP vers Atlas). |
| Base de données | **MongoDB** (BSON / requêtes JSON) | Stockage des documents `personnes`. Les filtres envoyés (`$gt`, `$in`, `$and`…) sont du langage de requête MongoDB. |
| Outils | **Vite 7**, **bun** / **npm** | Build + dev server (Vite) ; gestionnaire de paquets. |

En résumé : **TS partout côté app** (client *et* server functions), **JS pur**
pour le micro-service proxy, **CSS** pour le style, **MongoDB query language**
pour parler à la base.

En local, **tout tourne sur Node** : pas d'edge runtime. Deux process Node
sont lancés côté serveur :

1. l'app TanStack Start (port Vite, ex. `5173`),
2. le proxy MongoDB (port `3000`).

---

## 2. Pourquoi un proxy MongoDB ?

**Ce projet utilise un proxy**, et c'est un choix assumé même en local.
Voici les raisons :

1. **Portabilité edge.** Le code a été pensé pour pouvoir être déployé sur
   un runtime *edge* (type Cloudflare Workers) qui n'autorise **que du
   HTTP/HTTPS** : pas de TCP brut, pas de modules natifs Node. Le driver
   officiel `mongodb` (qui parle TCP) ne fonctionne pas dans ce contexte.
   Passer par un proxy HTTP rend l'app exécutable partout sans changer une
   ligne côté app.
2. **Séparation des responsabilités.** L'app ne connaît jamais la chaîne
   de connexion MongoDB ni les credentials Atlas. Elle parle uniquement
   au proxy via un Bearer token. La DB n'est jamais exposée à Internet.
3. **Une seule connexion poolée.** Le proxy ouvre **une** connexion
   MongoDB au démarrage et la réutilise pour toutes les requêtes (pooling
   du driver). On évite d'ouvrir/fermer une connexion à chaque appel.
4. **Filtrage en deux temps.** Le proxy applique le filtre Mongo natif ;
   l'app ré-applique un filtre JS de sécurité (`matchDoc`) au cas où un
   opérateur exotique passerait à travers.

Schéma :

```
 Navigateur ──HTTP──▶ App TanStack (Node) ──HTTP──▶ Proxy Node ──TCP──▶ MongoDB
                      (createServerFn)        (fetch)     (driver mongodb)
```

Le proxy ([`proxy/server.js`](./proxy/server.js)) est un mini-serveur
Express qui :

1. expose `POST /search`,
2. vérifie un **Bearer token** (`PROXY_API_KEY`),
3. exécute `db.collection(...).find(filter).limit(...).toArray()`,
4. renvoie le résultat en JSON.

### Variante : parler à MongoDB **sans** proxy

Techniquement, comme on tourne sur Node en local, on **pourrait** appeler
MongoDB directement depuis la server function, sans proxy. Un commentaire
dans `src/lib/mongo.functions.ts` (dans le `.handler()` de `mongoSearch`)
montre comment remplacer le `fetch` par un appel direct au driver :

```ts
import { MongoClient } from "mongodb";
const client = new MongoClient(process.env.MONGODB_URI!);
await client.connect();
const db = client.db(process.env.MONGODB_DATABASE!);
const docs = await db.collection(data.collection)
  .find(data.filter ?? {}).limit(data.limit).toArray();
return { data: docs };
```

👉 On **garde quand même le proxy par défaut** dans ce projet : c'est ce
qui permet de garder le même code app en local *et* sur un runtime edge,
et d'isoler les credentials MongoDB du reste de l'application.

---

## 3. Flux d'une recherche

Exemple : l'utilisateur tape *« plus de 30 ans qui s'appellent Marc »*.

### Étape 1 — Prompt → filtre MongoDB

`src/lib/ai-search.functions.ts` expose la server fn `promptToFilter`.
**Aucune IA externe** : un parseur local à base de règles reconnaît :

- `plus de N` → `{ age: { $gt: N } }`
- `moins de N` → `{ age: { $lt: N } }`
- `entre A et B` → `{ age: { $gte: A, $lte: B } }`
- `N ans` → `{ age: N }`
- `tout / tous / tout le monde` → `{}` (pas de filtre)
- mots restants (hors stopwords) → noms/prénoms via `$in` avec
  variantes de casse (`Marc`, `marc`, `MARC`).

Plusieurs critères sont combinés avec `$and`.

### Étape 2 — Filtre → MongoDB

`src/lib/mongo.functions.ts` expose la server fn `mongoSearch` :

1. Valide l'entrée avec **Zod** : `{ collection, filter, limit }`.
2. Lit `MONGO_PROXY_URL` et `MONGO_PROXY_API_KEY` (variables d'env
   serveur — jamais exposées au navigateur).
3. `fetch` HTTP vers `${MONGO_PROXY_URL}/search` avec
   `Authorization: Bearer …`.
4. Le proxy fait `db.collection(c).find(filter).limit(n).toArray()`.
5. **Filet de sécurité** : si le proxy renvoyait tous les documents
   (cas où il ignorerait certains opérateurs), le serveur ré-applique
   le filtre en JS via `matchDoc()` (`$eq/$ne/$gt/$gte/$lt/$lte/$in/
   $nin/$regex/$and/$or/$nor`).
6. Retourne `{ data: Personne[] }`.

### Étape 3 — Affichage React

`src/routes/index.tsx` :

- `useServerFn(promptToFilter)` + `useServerFn(mongoSearch)` pour
  appeler les server functions de façon typée.
- `useState` pour `query`, `loading`, `results`, `error`.
- Au montage : charge tous les documents (`runSearch({})`).
- À la soumission : `prompt → filtre → recherche → affichage`.
- Boutons d'**exemples** qui pré-remplissent le champ.

---

## 4. Liaison avec la base de données

### Proxy (`proxy/server.js`)

Variables d'environnement requises :

| Variable | Exemple | Rôle |
| --- | --- | --- |
| `MONGODB_URI` | `mongodb://localhost:27017` ou `mongodb+srv://user:pwd@cluster0.xxxx.mongodb.net/` | Chaîne de connexion. |
| `MONGODB_DATABASE` | `taskapp` | Base utilisée. |
| `PROXY_API_KEY` | chaîne aléatoire | Secret partagé avec l'app. |
| `PORT` | `3000` | Port HTTP du proxy. |

Au démarrage : `new MongoClient(MONGODB_URI).connect()` ouvre **une
seule** connexion réutilisée (pooling du driver).

### Application (`src/lib/mongo.functions.ts`)

Variables d'environnement serveur (fichier `.env` à la racine) :

| Variable | Valeur en local |
| --- | --- |
| `MONGO_PROXY_URL` | `http://localhost:3000` |
| `MONGO_PROXY_API_KEY` | **identique** à `PROXY_API_KEY` du proxy |

Elles sont lues **uniquement** dans le `.handler()` de `mongoSearch`.

---

## 5. Structure du projet

```
src/
├── routes/
│   ├── __root.tsx                # Shell HTML
│   └── index.tsx                 # Page de recherche
├── lib/
│   ├── ai-search.functions.ts    # prompt → filtre Mongo (parseur local)
│   └── mongo.functions.ts        # filtre → proxy → résultats
└── components/ui/                # shadcn/ui
proxy/
├── server.js                     # Express + driver mongodb
├── package.json
└── README.md
```

---

## 6. Lancer en local

**Pré-requis :** Node ≥ 20, `bun` (ou `npm`), et un MongoDB accessible
(local sur `mongodb://localhost:27017` ou un cluster Atlas).

### Terminal 1 — Proxy

```bash
cd proxy
npm install
MONGODB_URI="mongodb://localhost:27017" \
MONGODB_DATABASE="taskapp" \
PROXY_API_KEY="dev-secret" \
npm start
# → http://localhost:3000
```

### Terminal 2 — Application

Créer un fichier `.env` à la racine :

```
MONGO_PROXY_URL=http://localhost:3000
MONGO_PROXY_API_KEY=dev-secret
```

Puis :

```bash
bun install
bun run dev
# → http://localhost:5173
```

### Données d'exemple

Insérer quelques documents dans la collection `personnes` :

```js
use taskapp
db.personnes.insertMany([
  { nom: "Dupont", prenom: "Jean",  age: 28 },
  { nom: "Martin", prenom: "Marc",  age: 35 },
  { nom: "Durand", prenom: "Marc",  age: 22 },
  { nom: "Bernard", prenom: "Alice", age: 41 },
])
```

---

## 7. Exemples de requêtes

| Prompt utilisateur | Filtre Mongo généré |
| --- | --- |
| `affiche tout le monde` | `{}` |
| `Marc` | `{ $or: [ { nom: { $in: [...] } }, { prenom: { $in: [...] } } ] }` |
| `plus de 30 ans` | `{ age: { $gt: 30 } }` |
| `entre 20 et 25 ans` | `{ age: { $gte: 20, $lte: 25 } }` |
| `Jean Dupont` | `{ $and: [ <clause Jean>, <clause Dupont> ] }` |
| `Marc de plus de 30 ans` | `{ $and: [ { age: { $gt: 30 } }, <clause Marc> ] }` |

---

## 8. Sécurité

- Le proxy exige un **Bearer token** : `401` sans en-tête valide.
- Les secrets (`MONGODB_URI`, `PROXY_API_KEY`) restent **côté serveur**.
- Dans l'app, ils sont lus uniquement dans les `.handler()` des server
  functions — jamais bundlés dans le JS du navigateur.
- Les entrées sont validées par **Zod** avant d'atteindre le proxy.
- Limite dure : `limit ≤ 200` documents par requête.
