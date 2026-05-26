# Phase 2 — Concepts en profondeur

> Document complémentaire à `phase-2.md`. Le premier explique **comment** refaire ; celui-ci explique **pourquoi** ça fonctionne comme ça.
>
> Lecture suggérée : parcourir une première fois pour vue d'ensemble, puis revenir sur les concepts précis quand on en a besoin.

## Table des matières

1. [Le problème fondamental : comment garder client et serveur cohérents](#1-le-problème-fondamental)
2. [La pile de la Phase 2 : qui fait quoi](#2-la-pile-de-la-phase-2)
3. [PostgreSQL : la base relationnelle](#3-postgresql)
4. [Prisma : l'ORM typé](#4-prisma)
5. [tRPC : l'API typée bout-en-bout](#5-trpc)
6. [React Query : le cache côté client](#6-react-query)
7. [superjson : faire voyager les Date](#7-superjson)
8. [Zod : la validation typée](#8-zod)
9. [Server components vs Client components](#9-server-components-vs-client-components)
10. [Le pattern singleton pour Prisma](#10-le-pattern-singleton-pour-prisma)
11. [L'invalidation de cache](#11-linvalidation-de-cache)
12. [Server-side rendering, hydration, dehydration](#12-ssr-hydration-dehydration)
13. [Les pièges et leurs causes profondes](#13-les-pièges)

---

## 1. Le problème fondamental

Avant de comprendre les outils, il faut comprendre **ce qu'ils résolvent**.

Une application web moderne a deux côtés :
- **Le serveur** — qui parle à la base de données et expose une API
- **Le client** — qui s'exécute dans le navigateur de l'utilisateur

Ces deux côtés sont des **processus séparés** qui communiquent par HTTP. Ils ne partagent **rien automatiquement** : ni variables, ni types, ni code.

### Le problème concret

Imagine que tu écris une API REST classique :

**Côté serveur** (`/api/documents`) :
```typescript
// Le serveur retourne ceci
type Document = {
  id: string;
  title: string;
  content: string;
};
```

**Côté client** (le composant React) :
```typescript
// Tu dois redéclarer le type
type Document = {
  id: string;
  title: string;
  content: string;
};

const response = await fetch("/api/documents");
const data: Document[] = await response.json();
```

Le problème saute aux yeux : **les deux types sont déclarés deux fois**. Si tu ajoutes un champ `createdAt` côté serveur, le client ne le saura pas tant que tu n'as pas modifié le type manuellement. Et rien ne te le rappelle — ton code compile et plante au runtime.

### Les approches pour résoudre ça

| Approche | Comment | Limite |
|---|---|---|
| **OpenAPI / Swagger** | Décrire l'API dans un fichier YAML, générer les types | Lourd, génération à maintenir, désynchronisation possible |
| **GraphQL** | Schéma central, requêtes typées | Courbe d'apprentissage, infrastructure lourde |
| **tRPC** | Le client **infère** les types directement depuis le serveur | Demande TypeScript des deux côtés, fonctionne mal entre langages |

Pour un projet TypeScript+TypeScript comme le nôtre, **tRPC est imbattable**. Pas de fichier intermédiaire, pas de génération, pas de désynchronisation possible.

---

## 2. La pile de la Phase 2

```
┌─────────────────────────────────────────┐
│  Composants React (DocumentForm/List)   │
│  • useQuery() pour lire                 │
│  • useMutation() pour écrire            │
└────────────────┬────────────────────────┘
                 │ hooks typés
┌────────────────▼────────────────────────┐
│  React Query (TanStack Query)           │
│  • cache, états loading/error           │
│  • refetch automatique                  │
└────────────────┬────────────────────────┘
                 │ HTTP via httpBatchLink
┌────────────────▼────────────────────────┐
│  Route handler Next.js                  │
│  app/api/trpc/[trpc]/route.ts           │
└────────────────┬────────────────────────┘
                 │ délégation
┌────────────────▼────────────────────────┐
│  Routeur tRPC                           │
│  • validation Zod des entrées           │
│  • appel des procédures                 │
└────────────────┬────────────────────────┘
                 │ ctx.prisma.document.*
┌────────────────▼────────────────────────┐
│  Prisma Client (singleton)              │
│  • requêtes typées                      │
│  • adaptateur pg                        │
└────────────────┬────────────────────────┘
                 │ SQL via le driver pg
┌────────────────▼────────────────────────┐
│  PostgreSQL                             │
│  • base hackathon_lab, table Document   │
└─────────────────────────────────────────┘
```

Chaque couche a une responsabilité unique. Comprendre chaque pièce séparément rend le tout beaucoup plus clair.

---

## 3. PostgreSQL

### À quoi ça sert

PostgreSQL est un **système de gestion de base de données relationnelle**. Il stocke des données dans des **tables** avec des **lignes** et des **colonnes**, et permet de les interroger avec **SQL**.

### Concepts à maîtriser

**Table** — une structure tabulaire avec un nom (`Document`) et des colonnes typées :

```
Document
┌────────┬─────────┬──────────┬─────────────┬─────────────┐
│ id     │ title   │ content  │ createdAt   │ updatedAt   │
├────────┼─────────┼──────────┼─────────────┼─────────────┤
│ cm123… │ Test    │ Lorem…   │ 2026-05-13… │ 2026-05-13… │
│ cm456… │ Hello   │ Bonjour… │ 2026-05-14… │ 2026-05-14… │
└────────┴─────────┴──────────┴─────────────┴─────────────┘
```

**Clé primaire** — colonne qui identifie chaque ligne de manière unique. Dans notre cas, `id`.

**Type SQL** — chaque colonne a un type (`TEXT`, `INTEGER`, `TIMESTAMP`, etc.). On l'a vu dans le SQL généré :

```sql
"id" TEXT NOT NULL,
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
```

**Schéma** — un *namespace* dans la base. Par défaut on travaille dans le schéma `public`.

### Pourquoi PostgreSQL plutôt qu'autre chose

- **SQLite** : très simple mais mono-utilisateur, pas adapté pour un serveur web
- **MySQL/MariaDB** : équivalent mais Postgres a une meilleure conformité SQL, des types plus riches (JSON, géospatial), et une meilleure réputation chez les éditeurs juridiques
- **MongoDB** : base NoSQL, schéma flexible — mais pour des données structurées comme des documents juridiques avec relations, le relationnel est mieux

### Commande clé

`psql <base>` ouvre un client interactif. Méta-commandes utiles :

- `\dt` — lister les tables
- `\d <table>` — décrire la structure d'une table
- `\l` — lister les bases
- `\q` — quitter

Le `;` est obligatoire à la fin de chaque instruction SQL. Sans lui, `psql` attend la suite (prompt passe de `=#` à `-#`).

---

## 4. Prisma

### À quoi ça sert

Prisma est un **ORM** (Object-Relational Mapper) : il fait le pont entre les **objets TypeScript** et les **lignes SQL**.

Sans Prisma, on écrirait directement du SQL :

```typescript
const result = await pgClient.query(
  "SELECT id, title, content FROM \"Document\" ORDER BY \"createdAt\" DESC"
);
// result.rows : any[]  ← aucun typage
```

Avec Prisma :

```typescript
const documents = await prisma.document.findMany({
  orderBy: { createdAt: "desc" },
});
// documents : Document[]  ← typé automatiquement !
```

### Trois pièces à distinguer

1. **Le schéma** (`prisma/schema.prisma`) — la **vérité** sur la structure de tes données
2. **Les migrations** (`prisma/migrations/*.sql`) — l'**historique** des modifications du schéma
3. **Le client généré** (`lib/generated/prisma/`) — le **code TypeScript** que tu utilises

**Exemple concret du flux** : tu veux ajouter un champ `tags` au modèle Document.

1. Tu modifies `schema.prisma` :
```prisma
   model Document {
     // ... champs existants
     tags String[] @default([])
   }
```
2. Tu lances `pnpm prisma migrate dev --name add-tags`
3. Prisma compare l'état actuel avec ton schéma, génère un fichier SQL :
```sql
   ALTER TABLE "Document" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
```
4. Prisma applique ce SQL à la base
5. Prisma régénère le client : le type `Document` inclut maintenant `tags: string[]`
6. **Immédiatement**, tous tes appels `prisma.document.create({...})` te demanderont (ou pas) un `tags` selon la valeur par défaut. TypeScript te signale tout incohérence.

### Pourquoi Prisma 7 a changé l'architecture

Avant la v7, Prisma utilisait des **moteurs binaires en Rust** (un par plateforme : `linux-x64`, `darwin-arm64`, etc.) pour exécuter les requêtes. Ces binaires étaient lourds, posaient des problèmes dans des environnements *serverless* (taille des bundles, *cold starts*), et compliquaient le déploiement.

En v7, le runtime est **du TypeScript pur** + un **driver adapter** (`@prisma/adapter-pg`) qui parle directement au driver Postgres `pg`. Plus léger, plus rapide à démarrer, mais ça oblige à installer explicitement le driver adapter et à le configurer dans le client.

Conséquence : le `lib/prisma.ts` qu'on a écrit fait deux choses (et pas une) :

```typescript
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
//     ^^^^^^^ branche le driver pg sur Prisma
const prisma = new PrismaClient({ adapter });
//             ^^^^^^^^^^^^^^^^ instancie le client qui utilise cet adapter
```

### Annotations du schéma — exemples concrets

| Annotation | Effet | Exemple |
|---|---|---|
| `@id` | Marque la clé primaire | `id String @id` |
| `@default(cuid())` | Génère automatiquement un CUID à la création | `id String @id @default(cuid())` |
| `@unique` | Index unique | `email String @unique` |
| `@db.Text` | Force le type SQL `TEXT` (pas de limite de taille) | `content String @db.Text` |
| `@db.VarChar(255)` | Force `VARCHAR(255)` (limite à 255 caractères) | `slug String @db.VarChar(255)` |
| `@default(now())` | Postgres met l'horodatage à la création | `createdAt DateTime @default(now())` |
| `@updatedAt` | **Prisma** (pas Postgres) met à jour la valeur à chaque écriture | `updatedAt DateTime @updatedAt` |
| `@relation(...)` | Définit une relation entre tables | (Phase 3 avec User) |

### Pourquoi `@updatedAt` est subtil

C'est **Prisma** qui maintient ce champ, pas Postgres. Si tu fais un `UPDATE` SQL direct (via `psql` ou un autre outil), `updatedAt` ne bouge pas. Conséquence : si tu écris des scripts de migration de données en SQL brut, tu dois mettre à jour `updatedAt` manuellement.

C'est aussi pour ça que Prisma Studio écrit des `updatedAt` à `1970-01-01` quand on crée une ligne via son interface — il écrit en SQL direct sans passer par la logique applicative.

---

## 5. tRPC

### Le problème que ça résout

Voir [section 1](#1-le-problème-fondamental). tRPC élimine la duplication de types entre client et serveur.

### Comment ça marche concrètement

Côté serveur, tu écris :

```typescript
export const documentRouter = createTRPCRouter({
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.prisma.document.findMany();
  }),
});

export const appRouter = createTRPCRouter({
  document: documentRouter,
});

export type AppRouter = typeof appRouter;
```

`AppRouter` est un **type TypeScript** qui décrit toute la structure de ton API : tous les routeurs, toutes les procédures, leurs entrées, leurs sorties.

Côté client, tu écris :

```typescript
import type { AppRouter } from "@/server/trpc/root";
//     ^^^^^^^^^ uniquement le type, jamais le code

const trpc = useTRPC<AppRouter>();
const { data } = useQuery(trpc.document.list.queryOptions());
//                              ^^^^^^^^ auto-complétion garantie
```

TypeScript voit `AppRouter`, en déduit que `document.list` existe, que c'est une `query`, et que `data` est de type `Document[]`. **Aucun fichier généré.**

### Le voyage d'un appel

Quand tu écris dans un composant React :

```typescript
const { data } = useQuery(trpc.document.list.queryOptions());
```

Voici ce qui se passe :

1. `trpc.document.list.queryOptions()` construit un objet contenant l'URL (`/api/trpc/document.list`), une clé de cache, et la fonction `fetch`
2. `useQuery` exécute cette fonction → requête HTTP GET vers `/api/trpc/document.list`
3. Le `httpBatchLink` (côté client) peut fusionner plusieurs requêtes simultanées en une seule HTTP
4. La route handler Next.js (`app/api/trpc/[trpc]/route.ts`) reçoit la requête
5. `fetchRequestHandler` délègue au routeur tRPC
6. Le routeur identifie la procédure (`document.list`), crée le contexte (`{ prisma }`)
7. La procédure s'exécute : `ctx.prisma.document.findMany()` → SQL vers Postgres
8. Postgres retourne les lignes
9. Prisma les convertit en objets TypeScript
10. tRPC les sérialise avec **superjson** (préserve les `Date`)
11. Réponse HTTP au client
12. `httpBatchLink` désérialise avec superjson
13. React Query met en cache et appelle `setState` sur le composant
14. Le composant se re-rend avec `data` rempli

Ça paraît compliqué, mais c'est l'**équivalent typé** d'un simple `fetch()`. Et tout est automatique.

### `query` vs `mutation` — pourquoi cette distinction

- **`query`** : pas d'effet de bord, idempotent. React Query peut la **mettre en cache**, la **refaire automatiquement** (à la reconnexion réseau, au changement d'onglet, etc.), la dédupliquer si plusieurs composants la demandent.
- **`mutation`** : effet de bord. Ne se déclenche que par un appel **explicite** (`.mutate(...)`) du code. Pas de cache.

Cette distinction est cruciale parce qu'elle gouverne le comportement de React Query.

### Pourquoi Zod pour la validation

Les entrées d'une procédure viennent du **navigateur de l'utilisateur**. On ne peut **jamais** leur faire confiance — un utilisateur malveillant peut envoyer n'importe quoi.

Zod fait deux choses en une :

```typescript
.input(
  z.object({
    title: z.string().min(1).max(200),
    content: z.string().min(1),
  })
)
```

1. **Au runtime** : valide que `title` est bien une chaîne de 1 à 200 caractères. Si ce n'est pas le cas, tRPC renvoie une erreur 400 automatiquement.
2. **À la compilation** : TypeScript voit que `input` est typé `{ title: string; content: string }`. Pas besoin de redéclarer le type.

C'est un cas rare où **runtime et compilation utilisent la même source de vérité**.

### tRPC vs REST — quand choisir quoi

| Critère | tRPC | REST |
|---|---|---|
| Stack TypeScript de bout en bout | ✅ Idéal | OK mais répétitif |
| Stack hétérogène (Python, Go, etc. consomme l'API) | ❌ Impossible | ✅ Standard universel |
| API publique pour des tiers | ❌ Trop liée à TS | ✅ Documentation OpenAPI |
| Vitesse de développement interne | ✅ Imbattable | Plus lent |

Pour notre projet (TypeScript des deux côtés, API consommée par notre seul client), tRPC est le bon choix. Si on devait exposer notre API à des partenaires externes, on rajouterait une couche REST par-dessus (ou on passerait sur REST).

---

## 6. React Query

### À quoi ça sert

React Query (officiellement « TanStack Query ») est une bibliothèque de **gestion d'état serveur** côté client. Elle s'occupe de :

- **Cacher** les réponses des requêtes
- **Suivre** les états : *loading*, *error*, *success*
- **Rafraîchir** automatiquement les données périmées
- **Dédupliquer** les requêtes simultanées
- **Synchroniser** entre composants

### Sans React Query

```typescript
const [data, setData] = useState<Document[] | null>(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<Error | null>(null);

useEffect(() => {
  fetch("/api/documents")
    .then(r => r.json())
    .then(d => setData(d))
    .catch(e => setError(e))
    .finally(() => setLoading(false));
}, []);
```

Ça marche, mais :
- Pas de cache (recharge à chaque montage du composant)
- Pas de *refetch* automatique
- Code répétitif pour chaque requête
- Pas de déduplication entre composants

### Avec React Query

```typescript
const { data, isLoading, error } = useQuery({
  queryKey: ["documents"],
  queryFn: () => fetch("/api/documents").then(r => r.json()),
});
```

- Cache automatique : si un autre composant fait la même requête (même `queryKey`), il reçoit le cache, pas un nouvel appel HTTP
- *Refetch* automatique : à la reconnexion réseau, au focus de l'onglet (configurable)
- États gérés : `isLoading`, `isFetching`, `error`, etc.

### Avec tRPC + React Query

```typescript
const { data, isLoading, error } = useQuery(trpc.document.list.queryOptions());
```

`trpc.document.list.queryOptions()` génère automatiquement la `queryKey` et la `queryFn`. Plus aucun code répétitif, et tout est typé.

### Concepts clés

**`staleTime`** — durée pendant laquelle une donnée est considérée « fraîche ». Tant qu'elle est fraîche, React Query ne refait pas la requête, même si tu remontes le composant. Réglé à 30 secondes par défaut dans notre projet.

**`queryKey`** — l'**identifiant** d'une requête dans le cache. Deux requêtes avec la même `queryKey` partagent le cache.

**`invalidateQueries`** — marque une requête (ou un groupe) comme périmée. React Query la refait automatiquement la prochaine fois qu'elle est utilisée.

---

## 7. superjson

### Le problème

JSON ne sait pas sérialiser tous les types JavaScript. Exemples qui posent problème :

```javascript
JSON.stringify(new Date())       // "2026-05-13T18:54:24.528Z" ← devient une string
JSON.stringify(BigInt(123))      // ❌ TypeError: BigInt cannot be serialized
JSON.stringify({ s: new Set([1,2]) }) // {"s":{}}  ← perd les valeurs
JSON.stringify({ m: new Map() }) // {"m":{}}  ← perd les valeurs
```

Si ton serveur retourne un objet `Document` avec un champ `createdAt: Date`, le client le recevrait comme une **chaîne**, pas comme un `Date`. Tu ne pourrais plus faire `doc.createdAt.toLocaleString()` côté client.

### Comment superjson résout ça

superjson sérialise en deux parties : la valeur, plus un objet `meta` qui décrit les types spéciaux :

```javascript
superjson.stringify({ d: new Date("2026-05-13") })
// {
//   "json": { "d": "2026-05-13T00:00:00.000Z" },
//   "meta": { "values": { "d": ["Date"] } }
// }
```

À la désérialisation, superjson voit le `meta` et **reconstruit** un objet `Date` (pas une chaîne).

### Où c'est configuré dans notre projet

Trois endroits :

1. `server/trpc/init.ts` :
```typescript
   const t = initTRPC.context<...>().create({
     transformer: superjson,
   });
```
2. `lib/trpc/client.tsx` :
```typescript
   httpBatchLink({
     transformer: superjson,
     url: getUrl(),
   })
```
3. `lib/trpc/query-client.ts` (pour la *dehydration/hydration* SSR — voir section 12)

**Les trois configurations doivent utiliser superjson, sinon la sérialisation casse.**

---

## 8. Zod

### À quoi ça sert (en plus de la validation tRPC)

Zod est une bibliothèque de **validation de schémas** qui produit en même temps des **types TypeScript**.

```typescript
const userSchema = z.object({
  email: z.string().email(),
  age: z.number().int().min(18),
});

type User = z.infer<typeof userSchema>;
// type User = { email: string; age: number }
```

Le `z.infer<>` extrait le type TypeScript du schéma. **Une seule source de vérité** pour la validation runtime et le typage.

### Pourquoi c'est révolutionnaire

Avant Zod, on faisait :
```typescript
type User = { email: string; age: number };
function validate(data: unknown): User { /* code de validation manuel */ }
```

Deux choses à maintenir : le type et la validation. Zod fusionne les deux.

### Mini-exemple en dehors de tRPC

Lire un fichier JSON et valider sa structure :

```typescript
const configSchema = z.object({
  database: z.string().url(),
  port: z.number().int().positive(),
});

const raw = JSON.parse(fs.readFileSync("config.json", "utf-8"));
const config = configSchema.parse(raw);
// config est maintenant typé ET validé
// Si JSON invalide, .parse() throw une ZodError détaillée
```

---

## 9. Server components vs Client components

### Le contexte

Next.js App Router introduit une **distinction fondamentale** entre deux types de composants React :

**Server components** (le défaut) :
- S'exécutent **côté serveur**
- Peuvent faire des requêtes async directement (`await prisma.document.findMany()`)
- Le HTML est généré sur le serveur et envoyé au navigateur
- **Pas de JavaScript** envoyé au navigateur pour ces composants
- Ne peuvent pas utiliser de hooks React (`useState`, `useEffect`, etc.)
- Ne peuvent pas avoir d'interactivité (`onClick`, `onChange`, etc.)

**Client components** (marqués par `"use client"`) :
- S'exécutent **côté serveur** (au premier rendu) **puis côté navigateur** (interactivité)
- Peuvent utiliser des hooks et de l'interactivité
- Leur JavaScript est envoyé au navigateur
- Ne peuvent pas faire `await prisma.document.findMany()` directement

### Mini-exemple

Server component (pas de `"use client"`) :
```typescript
export default async function Page() {
  const documents = await prisma.document.findMany();
  return (
    <ul>
      {documents.map(doc => <li key={doc.id}>{doc.title}</li>)}
    </ul>
  );
}
```

Le serveur :
1. Reçoit la requête HTTP
2. Exécute le code (qui fait la requête Postgres)
3. Génère le HTML final
4. L'envoie au navigateur
5. **Aucun JavaScript** pour ce composant

Client component :
```typescript
"use client";
export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

Le serveur :
1. Génère le HTML initial avec `count = 0`
2. Envoie le HTML + le JavaScript du composant
3. Le navigateur **hydrate** : prend le HTML statique et y attache l'interactivité

### Pourquoi cette séparation est puissante

Sans elle, **tout** le JavaScript de l'app finirait dans le navigateur, même les pages purement lectures. Avec elle :
- Une page d'accueil statique = 0 JavaScript
- Un formulaire interactif = juste le JS du formulaire
- **Beaucoup** moins de JS = pages plus rapides

### La règle d'or

> Marque `"use client"` aussi **bas** que possible dans l'arbre des composants.

Notre `app/page.tsx` n'a pas `"use client"`. Seuls `DocumentForm` et `DocumentList` (les feuilles interactives) l'ont. Conséquence : la structure de la page, les `Card`, le titre, etc. sont tous des server components → moins de JS envoyé.

### Pourquoi le fichier `providers.tsx`

`app/layout.tsx` est un **server component**. Il ne peut pas directement utiliser `<TRPCReactProvider>` qui est un client component avec des hooks.

La règle Next.js : un server component peut **importer et rendre** un client component, mais ne peut pas en utiliser les hooks.

`providers.tsx` est une **passerelle** : un mince client component qui enveloppe les enfants. `layout.tsx` (server) l'importe et l'utilise comme une boîte noire :

```tsx
// layout.tsx (server component)
<body>
  <Providers>{children}</Providers>
</body>
```

Sans cette passerelle, le `TRPCReactProvider` ne pourrait pas être placé dans le layout racine.

---

## 10. Le pattern singleton pour Prisma

### Le problème en développement

Next.js a une fonctionnalité appelée **HMR** (Hot Module Replacement) : à chaque sauvegarde de fichier, Next recharge les modules modifiés sans redémarrer le serveur. C'est ce qui te permet de voir tes changements instantanément.

Mais HMR a un effet de bord : les modules sont **réexécutés**. Si tu fais simplement :

```typescript
// lib/prisma.ts
export const prisma = new PrismaClient();
```

À chaque rechargement, **une nouvelle instance** `PrismaClient` est créée. Chaque instance ouvre ses propres connexions à Postgres. Au bout de quelques minutes :

```
Error: too many clients already
```

### La solution : le pattern singleton

```typescript
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

Explication étape par étape :

1. `globalThis` est l'objet global de Node.js. Il **survit** aux rechargements HMR.
2. On crée une « case mémoire » nommée `prisma` sur ce global, typée pour TypeScript.
3. Au premier import : `globalForPrisma.prisma` est `undefined`, donc on crée une nouvelle instance et on l'assigne.
4. Aux imports suivants (après HMR) : `globalForPrisma.prisma` existe déjà → on le réutilise.
5. La sauvegarde sur le global est conditionnelle (`if NODE_ENV !== "production"`) parce qu'en production, le serveur ne fait jamais de HMR — chaque processus est isolé et stable.

### Pourquoi ce pattern existe dans plein de bibliothèques

Tout objet qui maintient un **pool de ressources** (connexions DB, sockets, etc.) a ce problème en dev avec HMR. Le pattern est universel pour :
- Prisma Client
- Apollo Client
- ioredis
- Mongoose
- ... etc.

Tu retrouveras toujours le même boilerplate `globalForX = globalThis as unknown as { x?: X }`.

---

## 11. L'invalidation de cache

### Le problème

React Query met les `query` en cache. Imagine :

1. La page charge → `useQuery(trpc.document.list)` récupère 3 documents → cache rempli
2. L'utilisateur crée un nouveau document via `useMutation`
3. Le serveur retourne le succès

**Mais le cache de `list` contient toujours les 3 anciens documents.** L'UI ne se rafraîchit pas. L'utilisateur ne voit pas son nouveau document.

### La solution : invalidation

```typescript
const createDocument = useMutation(
  trpc.document.create.mutationOptions({
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: trpc.document.list.queryKey(),
      });
    },
  })
);
```

`invalidateQueries` dit à React Query : « la donnée `list` est périmée ». Conséquence immédiate :
- React Query refait la requête en arrière-plan
- Quand la nouvelle donnée arrive, tous les composants utilisant `list` se re-rendent automatiquement
- L'utilisateur voit son nouveau document apparaître

### Variations possibles

| Approche | Comment | Quand l'utiliser |
|---|---|---|
| **Invalidation** | `invalidateQueries` puis refetch automatique | Le plus simple, sûr |
| **Optimistic update** | Mettre à jour le cache **avant** la réponse serveur, rollback si erreur | UX premium pour des actions fréquentes (like, etc.) |
| **Réécriture du cache** | `setQueryData` pour mettre à jour le cache avec la réponse de la mutation | Quand la réponse contient déjà la nouvelle donnée |

Pour notre projet, l'invalidation simple est parfaite. Une page qui se rafraîchit en 50ms n'a pas besoin d'optimistic updates.

### Mini-exemple alternatif : réécriture du cache

```typescript
onSuccess: (newDoc) => {
  queryClient.setQueryData(
    trpc.document.list.queryKey(),
    (old: Document[] | undefined) => [newDoc, ...(old ?? [])]
  );
}
```

Plus rapide qu'une invalidation (pas de re-requête réseau), mais demande de **savoir** où placer le document dans la liste. Pour une liste triée par date décroissante, on le met en tête. Mais si la liste avait une pagination ou un filtre, il faudrait plus de logique.

---

## 12. SSR, hydration, dehydration

### Le contexte

Next.js fait du **server-side rendering** (SSR) : le HTML est généré sur le serveur puis envoyé au navigateur. Avantages :
- Premier rendu rapide (l'utilisateur voit du contenu immédiatement)
- Bon pour le SEO (les moteurs lisent le HTML)

Mais il y a un problème : si une page utilise React Query côté client, le serveur n'a aucune idée des données qu'elle va demander. Donc :
1. Le serveur envoie un HTML « vide » (juste la coquille)
2. Le navigateur fait une requête React Query
3. Quand la donnée arrive, le composant se rend pour la première fois

Résultat : l'utilisateur voit un *flash* (page vide → page remplie).

### La solution : prefetch sur le serveur

Idée : le serveur fait la requête **avant** de générer le HTML, et **passe le résultat** au client avec le HTML.

1. **Dehydration** (côté serveur) — sérialiser l'état de React Query :
```typescript
   dehydrate: {
     serializeData: superjson.serialize,
   }
```
2. **Hydration** (côté client) — désérialiser l'état et le remettre dans le QueryClient :
```typescript
   hydrate: {
     deserializeData: superjson.deserialize,
   }
```

Ces options sont dans `lib/trpc/query-client.ts`.

### Mini-exemple concret

Sans dehydrate/hydrate :
- Le serveur génère le HTML sans les documents
- Le client reçoit le HTML, le navigateur affiche la page vide
- Le client fait `GET /api/trpc/document.list`
- Le client reçoit la donnée, met à jour le DOM
- L'utilisateur voit le contenu (300-500ms après le chargement initial)

Avec dehydrate/hydrate :
- Le serveur fait `prefetch(trpc.document.list)` → exécute la requête
- Le serveur génère le HTML **avec** les documents inclus
- Le serveur **sérialise** l'état de React Query et l'embarque dans le HTML
- Le client reçoit le HTML rempli
- Le client **hydrate** : reprend l'état React Query depuis le HTML, pas de requête réseau
- L'utilisateur voit le contenu instantanément

### Pourquoi superjson dans dehydrate

Parce que la sérialisation traverse JSON, et JSON ne sait pas représenter les `Date` natifs (voir section 7). Sans superjson, les `createdAt` deviendraient des chaînes ISO et `doc.createdAt.toLocaleString()` planterait côté client après hydration.

### Note : on ne l'utilise pas encore activement

Notre projet a configuré dehydrate/hydrate dans le QueryClient, mais on n'a pas encore branché de prefetch côté serveur. Tous nos appels passent par `useQuery` côté client. On pourra optimiser plus tard.

---

## 13. Les pièges

### 13.1 — `pnpm-workspace.yaml` avec placeholders

**Symptôme** : pnpm refuse d'exécuter les scripts post-install de Prisma. `pnpm approve-builds` répond « no packages awaiting approval ».

**Cause profonde** : pnpm v10+ a un mécanisme de sécurité pour bloquer les scripts post-install non approuvés. Si le fichier contient un placeholder textuel (`'set this to true or false'`), pnpm ne le lit ni comme `true`, ni comme `false` — il l'ignore complètement. Donc rien n'est en attente, donc `approve-builds` ne propose rien, donc rien ne se construit.

**Solution** : éditer manuellement le fichier pour mettre `true` partout.

**Pourquoi c'est arrivé** : la combinaison Next.js + Prisma + pnpm v10+ est récente. Les outils communiquent encore mal entre eux à ce niveau.

### 13.2 — `Module not found: Can't resolve './generated/prisma/client'`

**Symptôme** : Webpack échoue à compiler `lib/prisma.ts` avec cette erreur.

**Cause profonde** : on a mis `/lib/generated/prisma` dans `.gitignore`, donc le dossier n'est jamais commité. Sur une nouvelle session, nouveau clone, ou après suppression accidentelle du dossier, le code généré n'existe pas localement. Mais `lib/prisma.ts` essaie d'importer depuis ce dossier inexistant.

**Solution immédiate** : `pnpm prisma generate`.

**Solution durable** : ajouter à `package.json` :
```json
"scripts": {
  "postinstall": "prisma generate"
}
```

Comme ça, `pnpm install` lance automatiquement la génération à la fin.

### 13.3 — Document avec `id` vide et `updatedAt` à 1970

**Symptôme** : un document apparaît avec `id: ""` et `updatedAt: "1970-01-01T05:00:00.000Z"`.

**Cause profonde** : Prisma Studio écrit directement en SQL via le moteur de Prisma, sans passer par la couche applicative. Les défauts `@default(cuid())` et `@updatedAt` sont définis **au niveau de Prisma**, pas au niveau de Postgres (voir section 4, annotation `@updatedAt`). Studio les ignore donc.

**Solution** : créer les documents via les procédures tRPC (qui passent par `prisma.document.create(...)`).

### 13.4 — Erreur TypeScript `Property 'document' is missing in type`

**Symptôme** : une longue erreur cryptique mentionnant `DecoratedProcedureRecord`, `BuiltRouter`, etc. dans `lib/trpc/client.tsx`.

**Cause profonde** : on essayait de passer un objet `{ links: [...] }` directement au `<TRPCProvider>`. Mais ce composant attend un **vrai client tRPC**, pas une configuration. La différence : un vrai client a des **méthodes décorées** par tRPC (`client.document.list.query(...)`, etc.), alors qu'un simple objet de configuration n'en a pas.

**Solution** : envelopper la configuration dans `createTRPCClient<AppRouter>(...)`. Cette fonction prend la config et produit le vrai client typé.

### 13.5 — `Unchecked runtime.lastError` dans la console

**Symptôme** : un message rouge dans la console du navigateur.

**Cause profonde** : ce message vient de **l'API `chrome.runtime`** utilisée par les extensions de navigateur. Une extension essaie de communiquer avec son *service worker* qui n'a pas répondu. Ça n'a **rien à voir** avec notre code.

**Solution** : ignorer, ou tester en navigation privée (la plupart des extensions sont désactivées).

**Pourquoi on s'y trompe** : la console affiche cette erreur en rouge comme n'importe quelle erreur, sans distinction de provenance. On apprend à reconnaître ce message-là et à passer dessus.

---

## Conclusion : la promesse vérifiée

À la fin de la Phase 2, on a une application où :

1. Le **modèle de données** est défini une seule fois (dans `schema.prisma`)
2. Ce modèle est **automatiquement** propagé partout :
   - Postgres (via migration SQL)
   - Le client Prisma TypeScript (via `prisma generate`)
   - Les procédures tRPC (via `ctx.prisma.document`)
   - Le client React (via inférence de `AppRouter`)
3. **Aucune duplication** de schéma, **aucune génération manuelle** de types côté client
4. Toute modification du modèle propage automatiquement les erreurs TypeScript là où il faut

C'est la promesse de la stack T3 (Next.js + tRPC + Prisma), et elle tient.

**Indicateur** : essaie d'ajouter un champ au modèle `Document`, lance `prisma migrate dev --name add-X`, et regarde ton IDE — tu verras immédiatement où les composants doivent être adaptés.