# Phase 2 — Backend typé bout-en-bout (version détaillée)

> Document de référence reconstituant l'intégralité de la Phase 2, dans l'ordre réel d'exécution, avec toutes les explications pédagogiques, les concepts sous-jacents et les pièges rencontrés.

## Pré-requis (état en fin de Phase 1)

- Mac Apple Silicon avec Homebrew, fnm et Node.js LTS installés
- pnpm activé via Corepack
- Projet `~/Code/hackathon-lab` initialisé avec Next.js 16 + Tailwind + shadcn/ui
- Premier commit Git effectué
- Le serveur dev fonctionne avec `pnpm dev` (utilise Webpack via `next dev --webpack`, pas Turbopack — choix fait en Phase 1 pour éviter un bug de mémoire IOAccelerator sur Apple Silicon)

## Vue d'ensemble

La Phase 2 monte une pile **type-safe de bout en bout** : PostgreSQL → Prisma → tRPC → React. L'objectif pédagogique central est de comprendre comment les types TypeScript peuvent **traverser** toutes ces couches sans qu'on ait à écrire de schéma à double, ni à générer du code manuellement.

À la fin de la phase, modifier le modèle `Document` côté serveur fera apparaître immédiatement les erreurs de typage côté composants React. C'est la promesse de tRPC.

Cinq sous-phases :

| Sous-phase | Objectif | Couche |
|---|---|---|
| 2A | Installer PostgreSQL 18 | Base de données |
| 2B | Configurer Prisma 7 et créer le modèle `Document` | ORM |
| 2C | Construire le serveur tRPC (routeurs + route handler) | API serveur |
| 2D | Brancher le client tRPC dans React | API client |
| 2E | Connecter le formulaire de la page d'accueil à tRPC | Interface |

---

## Sous-phase 2A — PostgreSQL 18

### Pourquoi PostgreSQL ?

PostgreSQL est la base relationnelle open source de référence. Trois raisons pour ce projet :

- **Standard de l'industrie juridique** — la majorité des éditeurs juridiques (LexisNexis, SOQUIJ, etc.) tournent sur Postgres
- **Excellente compatibilité avec Prisma** — driver maintenu activement, types riches
- **Préparation au déploiement Azure** — la Phase 8 nous fera utiliser Azure Database for PostgreSQL Flexible Server

### 2A.1 — Installation

```bash
brew update
brew install postgresql@18
```

L'installation prend quelques minutes. Homebrew crée automatiquement un cluster de base de données par défaut, et indique son emplacement dans les *caveats*.

### 2A.2 — Ajouter au PATH

PostgreSQL via Homebrew est *keg-only* : pour éviter les conflits si plusieurs versions sont installées en parallèle, Homebrew ne met **pas** ses binaires dans le `PATH` par défaut. Il faut le faire manuellement :

```bash
echo 'export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
psql --version    # doit afficher psql (PostgreSQL) 18.x
```

Note : le chemin `/opt/homebrew/...` est spécifique à Apple Silicon. Sur Intel, ce serait `/usr/local/...`.

### 2A.3 — Démarrer le service

```bash
brew services start postgresql@18
brew services list | grep postgres    # doit afficher "started"
```

`brew services` enregistre PostgreSQL comme un service `launchd` qui redémarre automatiquement à chaque ouverture de session. On peut l'arrêter avec `brew services stop postgresql@18` pour libérer des ressources quand on ne développe pas.

### 2A.4 — Créer la base du projet

```bash
createdb hackathon_lab
psql -l | grep hackathon    # vérification
```

`createdb` est un binaire fourni avec PostgreSQL qui crée une nouvelle base de données. Sans argument supplémentaire, il utilise l'utilisateur courant macOS comme propriétaire.

### 2A.5 — Test de connexion

```bash
psql hackathon_lab
```

Dans le prompt `psql` :

- `SELECT version();` **— le `;` est obligatoire** pour terminer une instruction SQL. Sans lui, `psql` passe en mode « continuation » (le prompt change de `=#` à `-#`) parce qu'il pense que ton instruction n'est pas finie.
- `\q` pour quitter — les méta-commandes (commençant par `\`) sont propres au client `psql` et n'ont pas besoin de `;`

**Deux types de commandes dans psql** :

| Type | Exemple | Terminaison |
|---|---|---|
| **SQL** (interroge la base) | `SELECT version();` | `;` obligatoire |
| **Méta-commande psql** (commence par `\`) | `\q`, `\l`, `\du`, `\dt` | pas de `;` |

### 2A.6 — Chaîne de connexion

Avec Homebrew sur macOS, l'utilisateur macOS est superutilisateur Postgres via authentification *peer* (socket Unix). Aucun mot de passe nécessaire en local — pratique pour le développement, à durcir pour la production.

Vérifier son nom d'utilisateur :

```bash
whoami
```

La chaîne sera : `postgresql://<whoami>@localhost:5432/hackathon_lab`

### Critère de validation 2A

- [ ] `psql --version` affiche 18.x
- [ ] `brew services list` montre `postgresql@18 started`
- [ ] `psql -l` liste `hackathon_lab`
- [ ] `psql hackathon_lab` te connecte sans erreur

---

## Sous-phase 2B — Prisma 7 + modèle Document

### Pourquoi Prisma ?

Prisma est un **ORM** (Object-Relational Mapper) qui fait trois choses :

1. **Schéma déclaratif** — on décrit nos modèles dans un langage simple (`schema.prisma`), Prisma génère le SQL
2. **Client TypeScript typé** — on accède à la base via `prisma.document.findMany()` avec auto-complétion totale
3. **Migrations versionnées** — chaque modification du schéma produit un fichier SQL commité dans Git

L'alternative serait d'écrire du SQL brut + d'ajouter des types manuellement. Plus lourd, plus risqué.

### Avertissement sur Prisma 7

Prisma 7 a introduit une architecture « sans Rust au runtime » avec des changements structurants qui cassent la compatibilité avec les tutoriels écrits pour Prisma ≤ 6. Trois différences clés :

1. **`prisma.config.ts`** est désormais obligatoire à la racine du projet
2. **`DATABASE_URL`** est lue depuis `prisma.config.ts`, **pas** depuis `schema.prisma`
3. **Driver adapter requis** : `@prisma/adapter-pg` pour PostgreSQL

Si un tutoriel met `url = env("DATABASE_URL")` dans le bloc `datasource` de `schema.prisma`, c'est de l'ancien modèle. À ignorer.

### 2B.1 — Installer les dépendances

```bash
pnpm add -D prisma
pnpm add @prisma/client @prisma/adapter-pg pg dotenv
pnpm add -D @types/pg
```

**Décortiquons les paquets** :

| Paquet | Type | Rôle |
|---|---|---|
| `prisma` | dev | La CLI qui gère les migrations et la génération du client |
| `@prisma/client` | runtime | Le client typé que tu utilises dans ton code |
| `@prisma/adapter-pg` | runtime | Le pont entre Prisma 7 et le driver PostgreSQL |
| `pg` | runtime | Le driver PostgreSQL natif Node.js |
| `dotenv` | runtime | Pour charger `.env` quand la CLI Prisma s'exécute |
| `@types/pg` | dev | Types TypeScript pour `pg` |

**Piège rencontré** : pnpm bloque par défaut les scripts post-install de Prisma (sécurité). C'est une bonne pratique — un paquet malveillant ne peut pas exécuter de code à ton insu pendant `pnpm install`.

Mais conséquence : Prisma a besoin d'exécuter ses scripts pour télécharger ses moteurs binaires natifs (un par plateforme : `darwin-arm64` pour ton Mac). Sans approuver, `prisma generate` et `prisma migrate` échoueront plus loin.

**Si tu vois `[ERR_PNPM_IGNORED_BUILDS]`** dans la sortie d'installation, il faut éditer `pnpm-workspace.yaml`. La commande `pnpm approve-builds` peut ne pas fonctionner si le fichier contient des placeholders textuels du style `'set this to true or false'` — elle répondra « no packages awaiting approval » parce que la valeur n'est ni `true` ni `false`.

**Solution** : ouvrir `pnpm-workspace.yaml` et s'assurer qu'il contient :

```yaml
allowBuilds:
  '@prisma/engines': true
  prisma: true
  sharp: true
  unrs-resolver: true
  msw: true
```

Puis relancer :

```bash
pnpm install
```

Vérification finale :

```bash
pnpm prisma --version
```

Doit afficher Prisma 7.x. Le `Schema Engine` doit pointer vers `node_modules/.pnpm/@prisma+engines@.../...`.

> **Détail troublant mais normal** : avec pnpm, le dossier `node_modules/@prisma/engines/` **n'existe pas** en tant que tel. pnpm range les paquets dans son arborescence virtuelle `.pnpm/` puis crée des liens symboliques. Donc `ls node_modules/@prisma/engines/` retourne « No such file or directory » alors que tout fonctionne. Ne pas se laisser piéger.

### 2B.2 — Initialiser Prisma

```bash
pnpm prisma init --datasource-provider postgresql
```

Cette commande crée trois fichiers :

- `prisma/schema.prisma` — le schéma de la base
- `prisma.config.ts` — *nouveau en Prisma 7*, configure la CLI
- `.env` — variables d'environnement (avec un `DATABASE_URL` factice)

### 2B.3 — Configurer le .env

`prisma init` met un `DATABASE_URL` factice (`postgresql://johndoe:randompassword@.../mydb`). Le remplacer dans `.env` :

```
DATABASE_URL="postgresql://alain@localhost:5432/hackathon_lab"
```

> Remplacer `alain` par le résultat de `whoami`.

Note : retirer `?schema=public` est volontaire — c'est le schéma par défaut de Postgres, donc redondant.

### 2B.4 — Vérifier .gitignore

Deux protections **critiques** :

```bash
grep -n "\.env" .gitignore                 # doit montrer .env*
grep -n "generated" .gitignore             # doit montrer /lib/generated/prisma
```

**Pourquoi protéger `.env`** : il contiendra à terme la clé API Claude, des tokens, des secrets de déploiement. Ces secrets ne doivent jamais entrer dans Git, car Git garde l'historique pour toujours — même si tu les retires plus tard, ils restent dans les commits passés et peuvent fuiter par GitHub.

**Pourquoi protéger `lib/generated/prisma/`** : c'est du code regénéré à chaque migration. Le commiter pollue l'historique avec des changements parasites, et un développeur qui clone le dépôt aurait du code obsolète tant qu'il ne regénère pas. Mieux vaut le regénérer systématiquement (voir 2C.7).

### 2B.5 — Comprendre prisma.config.ts

Prisma 7 génère automatiquement `prisma.config.ts` à la racine du projet :

```typescript
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
```

**Différence majeure avec Prisma ≤ 6** : la CLI ne lit plus `.env` automatiquement. Le `import "dotenv/config"` est essentiel — sans lui, `process.env.DATABASE_URL` serait `undefined` quand la CLI s'exécute. C'est pour ça qu'on a installé `dotenv`.

### 2B.6 — Le schéma initial (Prisma 7)

`prisma init` crée :

```prisma
generator client {
  provider = "prisma-client"
  output   = "../lib/generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

**Différences vs Prisma ≤ 6** :

| Aspect | Ancien (Prisma ≤ 6) | Prisma 7 |
|---|---|---|
| Nom du provider | `prisma-client-js` | `prisma-client` |
| Emplacement de sortie | `node_modules/@prisma/client` | `lib/generated/prisma` (dans **ton** dépôt) |
| URL dans le schéma | `url = env("DATABASE_URL")` | **Absente** (dans `prisma.config.ts`) |

**Conséquence pratique** : le client Prisma sera généré **dans ton projet**, pas dans `node_modules`. Ce changement rend l'outil plus transparent et évite des problèmes avec certains *bundlers*.

### 2B.7 — Ajouter le modèle Document

Ajouter à `prisma/schema.prisma` :

```prisma
model Document {
  id        String   @id @default(cuid())
  title     String
  content   String   @db.Text
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**Décortiquons les annotations** :

| Annotation | Effet |
|---|---|
| `@id @default(cuid())` | Clé primaire ; CUID = chaîne courte triable générée automatiquement (alternative à UUID, mieux pour les index) |
| `@db.Text` | Force le type SQL `TEXT` (sans limite de longueur, contrairement à `VARCHAR`) |
| `@default(now())` | Postgres met l'horodatage à l'insertion via `CURRENT_TIMESTAMP` |
| `@updatedAt` | Mis à jour par **Prisma** à chaque écriture — **pas** par SQL |

**Subtilité importante sur `@updatedAt`** : ce champ n'a **pas** de `DEFAULT` ni de trigger SQL. C'est ton code (via le client Prisma) qui doit obligatoirement passer par Prisma pour modifier la table — sinon `updatedAt` ne se met pas à jour. Si tu fais un `UPDATE` SQL direct, la valeur ne bougera pas. C'est le prix de l'abstraction.

### 2B.8 — Première migration

```bash
pnpm prisma migrate dev --name init
```

`--name init` donne un nom à cette première migration. Cette commande fait quatre choses :

1. Compare ton `schema.prisma` avec l'état actuel de la base (vide)
2. Génère un fichier SQL dans `prisma/migrations/<timestamp>_init/migration.sql`
3. Applique ce SQL à la base `hackathon_lab`
4. Génère le client TypeScript dans `lib/generated/prisma/`

Le SQL généré ressemble à :

```sql
-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);
```

**Correspondance Prisma → SQL** :

| Ligne Prisma | Ligne SQL générée |
|---|---|
| `id String @id @default(cuid())` | `"id" TEXT NOT NULL` + `PRIMARY KEY ("id")` |
| `title String` | `"title" TEXT NOT NULL` |
| `content String @db.Text` | `"content" TEXT NOT NULL` (explicitement TEXT) |
| `createdAt DateTime @default(now())` | `"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP` |
| `updatedAt DateTime @updatedAt` | `"updatedAt" TIMESTAMP(3) NOT NULL` (sans DEFAULT) |

### 2B.9 — Vérifier dans Postgres

```bash
psql hackathon_lab -c "\dt"
```

Doit afficher deux tables :
- `Document` — notre table métier
- `_prisma_migrations` — table interne, Prisma s'en sert pour savoir quelles migrations ont déjà été appliquées (utile en déploiement)

### 2B.10 — Créer le singleton Prisma

Créer `lib/prisma.ts` :

```typescript
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

**Pourquoi un singleton** : en développement, Next.js recharge à chaud (HMR) à chaque sauvegarde de fichier. Sans précaution, chaque rechargement créerait une nouvelle instance `PrismaClient` qui ouvre ses propres connexions PostgreSQL. Au bout de quelques minutes de dev, tu épuises les connexions disponibles et tu obtiens des erreurs cryptiques. Le pattern `globalForPrisma` attache l'instance à l'objet global de Node.js, qui survit aux rechargements à chaud.

**Pourquoi `if (NODE_ENV !== "production")`** : en production, chaque processus Node.js est isolé et de courte durée (sur un serveur), donc pas besoin d'attacher au global. On garde ce mécanisme uniquement pour le développement.

**Important** : l'import vient de `./generated/prisma/client` (Prisma 7), **pas** de `@prisma/client`. Un piège facile.

### 2B.11 — Test avec Prisma Studio (optionnel)

```bash
pnpm prisma studio
```

Ouvre `http://localhost:5555`. Studio est une interface web qui te montre ta base comme un tableur. Pratique pour vérifier visuellement que les données sont là.

**Piège rencontré** : Studio contourne les valeurs par défaut Prisma (`@default(cuid())`, `@updatedAt`). Les documents créés via Studio peuvent avoir un `id` vide et un `updatedAt` à `1970-01-01` (l'epoch Unix). Studio écrit directement en SQL et n'applique pas les défauts définis dans le schéma Prisma.

Pour des données propres, préférer la création via tRPC (voir 2C.8).

### 2B.12 — Commit

```bash
git add -A
git commit -m "Phase 2B: Prisma 7 + PostgreSQL + modèle Document"
```

---

## Sous-phase 2C — Serveur tRPC

### Pourquoi tRPC ?

L'approche classique d'une API entre frontend et backend :
1. On définit des endpoints REST (`GET /api/documents`, `POST /api/documents`)
2. On écrit des types TypeScript côté serveur
3. On **duplique** les types côté client
4. À chaque modification du serveur, il faut **synchroniser manuellement** les deux

tRPC supprime cette duplication. On définit les procédures côté serveur, et le client **infère** les types depuis le serveur. Modifier la signature d'une procédure côté serveur fait immédiatement apparaître des erreurs de typage dans tous les composants client qui l'utilisent.

L'architecture qu'on monte :

```
[Client navigateur]  →  /api/trpc/...  →  Route handler Next.js  →  Routeur tRPC  →  Procédures  →  Prisma  →  PostgreSQL
```

### 2C.1 — Installer les paquets

```bash
pnpm add @trpc/server @trpc/client @trpc/tanstack-react-query @tanstack/react-query zod superjson
pnpm add -D server-only client-only
```

**Décortiquons** :

| Paquet | Rôle |
|---|---|
| `@trpc/server` | Cœur de tRPC côté serveur (routeurs, procédures) |
| `@trpc/client` | Client de bas niveau (utilisé indirectement) |
| `@trpc/tanstack-react-query` | Intégration moderne avec React Query — l'ancien `@trpc/react-query` est déprécié |
| `@tanstack/react-query` | Gestion d'état serveur côté client : cache, *refetch* automatique, états *loading/error* |
| `zod` | Validation **typée** des entrées des procédures (v4 utilisée ici) |
| `superjson` | Sérialise `Date`, `BigInt`, etc. à travers JSON — JSON standard ne sait pas faire |
| `server-only` | Force certains fichiers à n'exister que côté serveur (sécurité) |
| `client-only` | Symétrique : force certains fichiers à n'exister que côté client |

### 2C.2 — Créer la structure serveur

```bash
mkdir -p server/trpc/routers
```

> **Convention de séparation** : tout code serveur dans `server/`, tout code client dans `lib/trpc/`. Cette séparation des dossiers est volontaire — elle rend impossible d'importer du code serveur dans un composant client par accident.

### 2C.3 — Initialiser tRPC

Créer `server/trpc/init.ts` :

```typescript
import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

export const createTRPCContext = cache(async () => {
  return { prisma };
});

const t = initTRPC
  .context<Awaited<ReturnType<typeof createTRPCContext>>>()
  .create({
    transformer: superjson,
  });

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;
```

**Décortiquons chaque élément** :

| Élément | Rôle |
|---|---|
| `createTRPCContext` | Fonction appelée à chaque requête, expose `prisma` aux procédures via le contexte |
| `cache()` (React) | Garantit que `createTRPCContext` ne s'exécute qu'**une seule fois** par requête, même si plusieurs procédures sont appelées |
| `initTRPC.context<...>().create(...)` | Construit le « moteur » tRPC avec le type du contexte et le sérialiseur |
| `createTRPCRouter` | Helper pour grouper des procédures en routeur |
| `publicProcedure` | Procédure accessible à tous — plus tard on aura `protectedProcedure` pour les utilisateurs connectés (Phase 3) |
| `createCallerFactory` | Permet d'appeler tRPC depuis du code serveur (server components) — utile plus tard |

### 2C.4 — Créer le routeur document

Créer `server/trpc/routers/document.ts` :

```typescript
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/trpc/init";

export const documentRouter = createTRPCRouter({
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.prisma.document.findMany({
      orderBy: { createdAt: "desc" },
    });
  }),

  create: publicProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
        content: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.document.create({
        data: {
          title: input.title,
          content: input.content,
        },
      });
    }),
});
```

**Décortiquons les concepts clés** :

| Concept | Explication |
|---|---|
| `createTRPCRouter({...})` | Regroupe des procédures sous un nom logique (`document.list`, `document.create`) |
| `publicProcedure.query(...)` | Procédure de **lecture** (équivalent d'un GET REST) |
| `publicProcedure.input(z.object({...})).mutation(...)` | Procédure d'**écriture** (équivalent POST), avec validation des entrées |
| `z.object({...})` | Schéma de validation Zod — si l'entrée ne respecte pas le schéma, tRPC renvoie automatiquement une erreur 400 avec un message détaillé |
| `ctx.prisma` | Le client Prisma, disponible via le contexte qu'on a défini en 2C.3 |
| `input` | Les entrées **déjà validées et typées** par Zod — pas besoin de revérifier dans la procédure |

**Différence cruciale : `query` vs `mutation`** :

| Type | Quand l'utiliser | Comportement |
|---|---|---|
| `query` | Lecture sans effet de bord | Mise en cache automatique par React Query, ré-exécutée intelligemment |
| `mutation` | Écriture (création, modification, suppression) | Appelée explicitement, peut invalider les caches |

### 2C.5 — Créer le routeur racine

Créer `server/trpc/root.ts` :

```typescript
import { createTRPCRouter } from "@/server/trpc/init";
import { documentRouter } from "@/server/trpc/routers/document";

export const appRouter = createTRPCRouter({
  document: documentRouter,
});

export type AppRouter = typeof appRouter;
```

**Point pédagogique central** : la ligne `export type AppRouter = typeof appRouter` est le **cœur de tRPC**.

- **`appRouter`** est une **valeur** (existe au runtime, contient le vrai code des procédures)
- **`AppRouter`** est un **type** (existe uniquement au moment de la compilation TypeScript)

Côté client (navigateur), on n'importera **que le type**. Le navigateur ne reçoit donc **jamais** le code du serveur. Mais TypeScript, lui, voit le type et peut offrir une auto-complétion parfaite et détecter les erreurs.

C'est cette séparation qui permet à tRPC d'offrir la sécurité de typage bout-en-bout **sans aucune génération de code ni schéma partagé**.

### 2C.6 — Créer la route handler Next.js

```bash
mkdir -p app/api/trpc/\[trpc\]
```

> Les `\` échappent les crochets pour zsh (sinon zsh les interpréterait comme un *glob*). Les crochets `[trpc]` en Next.js désignent un **segment dynamique** — un segment d'URL qui peut prendre n'importe quelle valeur (ici, le nom de la procédure tRPC).

Créer `app/api/trpc/[trpc]/route.ts` :

```typescript
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/trpc/root";
import { createTRPCContext } from "@/server/trpc/init";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: createTRPCContext,
  });

export { handler as GET, handler as POST };
```

| Élément | Rôle |
|---|---|
| `fetchRequestHandler` | Adaptateur tRPC pour les API Web standard (`Request`/`Response`), parfait pour Next.js App Router |
| `endpoint: "/api/trpc"` | tRPC sait que tout ce qui vient après dans l'URL est un nom de procédure |
| `export { handler as GET, handler as POST }` | Une seule fonction gère **toutes** les méthodes HTTP — tRPC utilise `GET` pour les `query` et `POST` pour les `mutation` |

Convention : tRPC sera accessible via :
- `GET /api/trpc/document.list` → exécute la procédure `list`
- `POST /api/trpc/document.create` → exécute la procédure `create`

### 2C.7 — Piège classique de Prisma 7 — Régénération du client

Si le dossier `lib/generated/prisma/` n'existe pas (parce qu'il est gitignored et qu'on est sur une nouvelle session ou un clone), Webpack échoue à l'import avec :

```
Module not found: Can't resolve './generated/prisma/client'
```

**Cause** : on a mis `/lib/generated/prisma` dans `.gitignore` (2B.4), donc le dossier n'est pas versionné. Sur une nouvelle session ou un nouveau clone, il faut le regénérer.

**Solution** :

```bash
pnpm prisma generate
```

Puis vérifier :

```bash
ls lib/generated/prisma/
# Doit afficher : client.ts, models.ts, enums.ts, etc.
```

> **Recommandation forte** : ajouter `"postinstall": "prisma generate"` aux scripts du `package.json` pour automatiser cette étape après chaque `pnpm install`. Sinon n'importe quel co-développeur (ou toi sur une autre machine) tombera dans le même piège.

### 2C.8 — Tester le serveur avec curl

Dans un terminal séparé pendant que `pnpm dev` tourne :

```bash
# Test query (lecture)
curl 'http://localhost:3000/api/trpc/document.list?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%2C%22meta%22%3A%7B%22values%22%3A%5B%22undefined%22%5D%7D%7D%7D'

# Test mutation (écriture)
curl -X POST 'http://localhost:3000/api/trpc/document.create' \
  -H 'Content-Type: application/json' \
  -d '{"json":{"title":"Test","content":"Contenu"}}'
```

L'URL encodée du GET est cryptique parce que tRPC encode ses paramètres en URL pour les `query`. Le `batch=1` indique qu'on appelle une seule procédure (tRPC peut en *batcher* plusieurs en un seul appel HTTP — voir `httpBatchLink` plus loin).

La création doit renvoyer un document avec :
- `id` : chaîne CUID (`cmxxx...`)
- `createdAt` et `updatedAt` : horodatages actuels et identiques (puisqu'il vient d'être créé)

**Si l'`id` est vide ou `updatedAt` à `1970`**, c'est que le document a été créé via Prisma Studio et a contourné les défauts Prisma. Voir 2B.11.

### 2C.9 — Commit

```bash
git add -A
git commit -m "Phase 2C: serveur tRPC (routeur document + route handler)"
```

---

## Sous-phase 2D — Client tRPC

### Vue d'ensemble

Pour que React puisse appeler nos procédures tRPC, il faut quatre fichiers :

| Fichier | Rôle |
|---|---|
| `lib/trpc/query-client.ts` | Crée le `QueryClient` de React Query (gère le cache) |
| `lib/trpc/client.tsx` | Crée un *Provider* React qui rend tRPC disponible partout |
| `app/providers.tsx` | Composant qui enveloppe l'app avec le *Provider* |
| `app/layout.tsx` | Modification pour utiliser `providers.tsx` |

> Avant 2C, on écrivait du code dans `server/trpc/` (côté serveur).
> En 2D, on écrit dans `lib/trpc/` (côté client).
> Cette séparation rend impossible l'erreur d'importer du code serveur dans un composant client.

### 2D.1 — Créer la structure client

```bash
mkdir -p lib/trpc
```

### 2D.2 — Créer le QueryClient

Le `QueryClient` est l'objet central de React Query : il gère le cache, les *retries*, la durée de vie des données. On le configure une fois pour toute l'application.

Créer `lib/trpc/query-client.ts` :

```typescript
import {
  QueryClient,
  defaultShouldDehydrateQuery,
} from "@tanstack/react-query";
import superjson from "superjson";

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
      },
      dehydrate: {
        serializeData: superjson.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
      hydrate: {
        deserializeData: superjson.deserialize,
      },
    },
  });
}
```

**Pourquoi une fonction et non une constante** :

- Côté **serveur**, on veut un **nouveau** QueryClient par requête, pour éviter qu'un utilisateur lise les données mises en cache pour un autre utilisateur (fuite de données catastrophique)
- Côté **client**, on en veut un **seul**, partagé pour toute la session

On centralise la création dans une fonction et on gère ce comportement dans `client.tsx`.

| Option | Effet |
|---|---|
| `staleTime: 30 * 1000` | Une donnée est considérée fraîche 30 secondes après son arrivée. Pendant ce temps, React Query ne refait pas la requête. |
| `dehydrate` / `hydrate` | Mécanisme qui permet au serveur de « passer » l'état des requêtes au client (pour ne pas refaire les appels qu'on a déjà faits côté serveur). superjson assure que les `Date` survivent à ce transit. |

### 2D.3 — Créer le Provider tRPC

Ce fichier est le pont entre les procédures serveur et les composants React.

Créer `lib/trpc/client.tsx` :

```tsx
"use client";

import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import { useState } from "react";
import superjson from "superjson";
import type { AppRouter } from "@/server/trpc/root";
import { makeQueryClient } from "@/lib/trpc/query-client";

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    return makeQueryClient();
  }
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

function getUrl() {
  const base = (() => {
    if (typeof window !== "undefined") return "";
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    return `http://localhost:${process.env.PORT ?? 3000}`;
  })();
  return `${base}/api/trpc`;
}

export function TRPCReactProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          transformer: superjson,
          url: getUrl(),
        }),
      ],
    })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
```

**Piège rencontré** : il faut utiliser `createTRPCClient<AppRouter>({...})` et **non** passer directement un objet `{ links: [...] }` au `TRPCProvider`. Si on oublie `createTRPCClient`, TypeScript renvoie une erreur cryptique de plusieurs lignes mentionnant `DecoratedProcedureRecord` et `BuiltRouter`.

**Décortiquons** :

| Élément | Rôle |
|---|---|
| `"use client"` | Marqueur Next.js — ce fichier est un composant client (s'exécute dans le navigateur) |
| `createTRPCContext<AppRouter>()` | Crée des hooks **typés** à partir du type du routeur serveur — c'est ici que la magie de typage opère |
| `import type { AppRouter }` | **Type uniquement** — aucun code serveur n'arrive dans le bundle |
| `httpBatchLink` | Si plusieurs `query` partent en même temps, elles sont fusionnées en une seule requête HTTP (économie de latence) |
| `useState(() => createTRPCClient(...))` | Astuce React pour instancier le client **une seule fois** pour la vie du composant (sinon il serait recréé à chaque rendu) |
| `getQueryClient()` | Renvoie un nouveau client côté serveur, un singleton côté navigateur — la sécurité des données dont on parlait en 2D.2 |

### 2D.4 — Créer le composant Providers

Créer `app/providers.tsx` :

```tsx
"use client";

import { TRPCReactProvider } from "@/lib/trpc/client";

export function Providers({ children }: { children: React.ReactNode }) {
  return <TRPCReactProvider>{children}</TRPCReactProvider>;
}
```

> **Fichier mince volontairement** : sert de passerelle car `layout.tsx` est un *server component* qui ne peut pas importer directement un *client component* avec `"use client"`. La règle Next.js : un server component peut importer un client component **via une enveloppe**, mais pas directement utiliser ses hooks.

Plus tard (Phase 3), on y ajoutera d'autres providers : authentification, thème, etc.

### 2D.5 — Brancher dans le layout racine

Dans `app/layout.tsx`, deux ajouts :

1. Importer `Providers` :

```tsx
import { Providers } from "@/app/providers";
```

2. Envelopper `{children}` dans le body :

```tsx
<body className="min-h-full flex flex-col">
  <Providers>{children}</Providers>
</body>
```

Sans cette modification, aucun composant ne peut utiliser `useTRPC` — il faut que le provider soit présent quelque part au-dessus dans l'arbre React.

### 2D.6 — Vérifier que rien n'est cassé

Lancer `pnpm dev`, ouvrir `http://localhost:3000`, vérifier :
- La page se charge sans erreur (même page que fin Phase 1, on n'a rien modifié visuellement)
- Aucune erreur rouge dans le terminal
- Aucune erreur rouge dans la console du navigateur

> ⚠️ **Faux positif courant** : le message `Unchecked runtime.lastError: Could not establish connection. Receiving end does not exist.` est un bruit d'**extension de navigateur** (bloqueurs de pub, gestionnaires de mots de passe, React DevTools, Grammarly, etc.), pas du code. Pour confirmer : ouvrir la page en navigation privée — l'erreur disparaît.

### 2D.7 — Commit

```bash
git add -A
git commit -m "Phase 2D: client tRPC (Providers + QueryClient + TRPCProvider)"
```

---

## Sous-phase 2E — Page d'accueil branchée

### Objectif

Remplacer le formulaire statique de la Phase 1 par un **formulaire fonctionnel** qui :
1. Affiche la **liste des documents** existants (via `document.list`)
2. Permet de **créer un nouveau document** (via `document.create`)
3. **Rafraîchit automatiquement** la liste après création

C'est l'aboutissement de tout ce qu'on a construit.

### Approche

Découpe en deux composants spécialisés :

| Composant | Rôle |
|---|---|
| `DocumentForm` | Le formulaire de création |
| `DocumentList` | La liste des documents existants |

Cette séparation est une bonne habitude : un composant = une responsabilité.

### 2E.1 — Ajouter le composant Input de shadcn

```bash
pnpm dlx shadcn@latest add input
```

On aura besoin du composant `Input` (champ texte d'une seule ligne, pour le titre).

### 2E.2 — Composant DocumentList

Créer `components/documents/document-list.tsx` :

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function DocumentList() {
  const trpc = useTRPC();

  const { data, isLoading, error } = useQuery(
    trpc.document.list.queryOptions()
  );

  if (isLoading) {
    return <p className="text-sm text-neutral-500">Chargement des documents…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">Erreur : {error.message}</p>;
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        Aucun document pour l'instant. Crée le premier ci-dessus.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((doc) => (
        <Card key={doc.id || doc.createdAt.toISOString()}>
          <CardHeader>
            <CardTitle className="text-base">{doc.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-neutral-700 whitespace-pre-wrap">
              {doc.content}
            </p>
            <p className="text-xs text-neutral-400">
              Créé le {doc.createdAt.toLocaleString("fr-CA")}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

**Décortiquons les éléments tRPC** :

| Élément | Explication |
|---|---|
| `useTRPC()` | Récupère le client tRPC injecté par `TRPCReactProvider` |
| `trpc.document.list.queryOptions()` | Construit les options pour React Query : URL, clés de cache, etc. API moderne de `@trpc/tanstack-react-query` |
| `useQuery(...)` | Hook React Query qui exécute l'appel et gère le cache automatiquement |
| `data` | Typé **automatiquement** comme `Document[]` — TypeScript le sait sans qu'on lui dise |
| `doc.createdAt.toLocaleString("fr-CA")` | `createdAt` est un vrai objet `Date` grâce à superjson — sans lui, ce serait une chaîne ISO |
| `doc.id \|\| doc.createdAt.toISOString()` | Bricolage pour gérer un document avec ID vide (résidu de Prisma Studio, voir 2B.11) |

**Auto-complétion à essayer** : dans VS Code, tape `trpc.` et tu verras `document` apparaître. Puis `trpc.document.` et tu verras `list` et `create`. Aucun fichier de types généré ; tout vient de `import type { AppRouter }`.

### 2E.3 — Composant DocumentForm

Créer `components/documents/document-form.tsx` :

```tsx
"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function DocumentForm() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const createDocument = useMutation(
    trpc.document.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.document.list.queryKey(),
        });
        setTitle("");
        setContent("");
      },
    })
  );

  function handleSubmit() {
    if (!title.trim() || !content.trim()) return;
    createDocument.mutate({ title, content });
  }

  return (
    <div className="space-y-4">
      <Input
        placeholder="Titre du document"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={createDocument.isPending}
      />
      <Textarea
        placeholder="Contenu du document…"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={6}
        disabled={createDocument.isPending}
      />
      <Button
        onClick={handleSubmit}
        disabled={
          createDocument.isPending || !title.trim() || !content.trim()
        }
        className="w-full"
      >
        {createDocument.isPending ? "Création…" : "Créer le document"}
      </Button>
      {createDocument.error && (
        <p className="text-sm text-red-600">
          Erreur : {createDocument.error.message}
        </p>
      )}
    </div>
  );
}
```

**Décortiquons les concepts** :

| Concept | Explication |
|---|---|
| `useMutation(...)` | Hook React Query pour les **écritures**. Contrairement à `useQuery`, ne s'exécute pas tout seul — on appelle `.mutate(...)` explicitement |
| `trpc.document.create.mutationOptions({...})` | Construit les options : URL, callbacks de succès/erreur |
| `onSuccess: async () => { ... }` | Callback exécuté après une création réussie côté serveur |
| `queryClient.invalidateQueries({...})` | Dit à React Query : « cette donnée est périmée, refais l'appel ». La liste se rafraîchit toute seule sans rechargement de page |
| `trpc.document.list.queryKey()` | Renvoie la clé de cache de `list`, utilisée pour l'invalider |
| `createDocument.isPending` | Vrai pendant l'appel serveur — utilisé pour désactiver le bouton et empêcher les doubles soumissions |
| `createDocument.error` | Contient l'erreur si la création a échoué (validation Zod, problème réseau, etc.) |

**Concept central : l'invalidation de cache**. C'est le pattern fondamental de React Query :
1. La liste est chargée et mise en cache (via `useQuery`)
2. L'utilisateur crée un nouveau document (via `useMutation`)
3. Au succès, on **invalide** la requête `list` → React Query la refait automatiquement
4. Tous les composants qui utilisent `list` reçoivent les nouvelles données

Sans cette invalidation, la liste continuerait d'afficher les anciennes données jusqu'à un rechargement manuel.

### 2E.4 — Réécrire la page d'accueil

`app/page.tsx` (server component, sans `"use client"`) :

```tsx
import { DocumentForm } from "@/components/documents/document-form";
import { DocumentList } from "@/components/documents/document-list";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home() {
  return (
    <main className="min-h-svh p-6 bg-neutral-50">
      <div className="mx-auto max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Hackathon Lab — Bac à sable</CardTitle>
            <CardDescription>
              Phase 2 — Créer et lister des documents via tRPC + Prisma.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DocumentForm />
          </CardContent>
        </Card>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-neutral-700">
            Documents existants
          </h2>
          <DocumentList />
        </section>
      </div>
    </main>
  );
}
```

**Bonne pratique fondamentale** : `app/page.tsx` redevient un **server component** (le défaut de Next.js App Router). En Phase 1, on avait `"use client"` parce que la page entière était interactive. Maintenant, les parties interactives sont déléguées à `DocumentForm` et `DocumentList` (qui portent eux-mêmes `"use client"`).

Bénéfices :
- HTML rendu côté serveur, plus rapide à afficher
- Moins de JavaScript envoyé au navigateur
- Le routage et la composition restent côté serveur

C'est le pattern recommandé : garder les server components quand possible, passer en client uniquement aux **feuilles** de l'arbre qui ont besoin d'interactivité.

### 2E.5 — Tester

Avec `pnpm dev` actif :

1. Ouvrir `http://localhost:3000`
2. Vérifier que les documents existants apparaissent dans la section « Documents existants »
3. Remplir le formulaire et cliquer « Créer le document »
4. **Observer** : le formulaire se vide, le nouveau document apparaît **instantanément** en tête de liste (grâce à l'invalidation de cache)
5. Recharger la page : le document persiste (PostgreSQL fait son travail)

### 2E.6 — Commit final

```bash
git add -A
git commit -m "Phase 2E: page d'accueil branchée sur tRPC (list + create)"
```

---

## Bilan de la Phase 2

### Structure finale du projet (extraits pertinents)

```
hackathon-lab/
├── app/
│   ├── api/trpc/[trpc]/route.ts      # Route handler tRPC
│   ├── layout.tsx                     # Avec <Providers>
│   ├── page.tsx                       # Server component utilisant les deux feuilles
│   └── providers.tsx                  # Passerelle vers TRPCReactProvider
├── components/
│   ├── documents/
│   │   ├── document-form.tsx          # Formulaire de création
│   │   └── document-list.tsx          # Liste des documents
│   └── ui/                            # shadcn (Button, Card, Input, Textarea)
├── lib/
│   ├── generated/prisma/              # Client Prisma généré (gitignored)
│   ├── trpc/
│   │   ├── client.tsx                 # TRPCReactProvider + useTRPC
│   │   └── query-client.ts            # makeQueryClient()
│   ├── prisma.ts                      # Singleton PrismaClient
│   └── utils.ts                       # cn() de shadcn
├── prisma/
│   ├── migrations/
│   │   └── <timestamp>_init/
│   │       └── migration.sql
│   └── schema.prisma
├── server/
│   └── trpc/
│       ├── routers/
│       │   └── document.ts            # documentRouter (list, create)
│       ├── init.ts                    # createTRPCContext, helpers
│       └── root.ts                    # appRouter + AppRouter (type)
├── .env                               # DATABASE_URL (gitignored)
├── prisma.config.ts                   # Config Prisma 7
└── pnpm-workspace.yaml                # Build allowlist
```

### Pipeline complet (à mémoriser)

```
Navigateur (DocumentForm/DocumentList)
   ↓ useQuery / useMutation
Hooks tRPC typés (useTRPC)
   ↓ HTTP /api/trpc/document.{list,create}
Route handler Next.js
   ↓
Routeur tRPC + validation Zod
   ↓
Procédures (ctx.prisma.document.*)
   ↓
Singleton Prisma + adapter PG
   ↓
PostgreSQL local
```

### Pièges majeurs rencontrés et leçons à retenir

1. **`pnpm-workspace.yaml` avec placeholders** — pnpm ne construit pas les scripts tant que les valeurs ne sont pas explicitement `true`. `pnpm approve-builds` ne corrige pas un placeholder textuel ; il faut éditer le fichier manuellement.

2. **Prisma 7 « sans Rust »** — différences avec Prisma ≤ 6 :
   - `prisma.config.ts` obligatoire avec `import "dotenv/config"`
   - `DATABASE_URL` lue dans la config, pas dans le schéma
   - Output du client dans `lib/generated/prisma/` (à mettre dans `.gitignore`)
   - Provider `prisma-client` (pas `prisma-client-js`)
   - Import : `from "./generated/prisma/client"` (pas `from "@prisma/client"`)
   - Driver adapter obligatoire : `@prisma/adapter-pg`
   - Le dossier `node_modules/@prisma/engines/` n'existe pas en tant que tel avec pnpm (rangé dans `.pnpm/`)

3. **`lib/generated/prisma/` est gitignored** — il faut lancer `pnpm prisma generate` après chaque clone, nouveau worktree, ou si le dossier est supprimé. Recommandation : ajouter un script `postinstall`.

4. **Prisma Studio contourne les défauts Prisma** — `@default(cuid())` et `@updatedAt` ne s'appliquent pas pour les écritures faites directement dans Studio. Préférer la création via les procédures tRPC.

5. **`createTRPCClient<AppRouter>` est obligatoire** côté client — passer juste `{ links: [...] }` au `TRPCProvider` provoque une erreur TypeScript cryptique de plusieurs lignes.

6. **Séparation server/client** — convention claire : code serveur dans `server/`, code client dans `lib/trpc/`. Rend impossible l'import croisé accidentel.

7. **Server components par défaut** — `app/page.tsx` n'a pas besoin de `"use client"` ; seules les feuilles interactives en ont besoin. Plus performant, moins de JS au navigateur.

8. **Bruit d'extensions de navigateur** — le message `Unchecked runtime.lastError` vient d'extensions Chrome/Safari, pas du code. À ignorer ou tester en navigation privée.

### Concepts clés à maîtriser pour la suite

- **Typage bout-en-bout** : modifier le routeur côté serveur fait apparaître les erreurs côté client immédiatement. Aucune génération de code.
- **Singleton Prisma** : pattern essentiel pour éviter l'explosion des connexions en dev.
- **`query` vs `mutation`** : lecture mise en cache automatiquement vs écriture déclenchée explicitement.
- **Invalidation de cache** : pattern central de React Query pour rafraîchir l'UI après une écriture.
- **Server vs client components** : par défaut server (Next.js App Router) ; client seulement aux feuilles interactives.
- **superjson** : permet aux `Date`, `BigInt`, etc. de survivre au transit JSON entre serveur et client.

### Commandes utiles à retenir

| Action | Commande |
|---|---|
| Démarrer Postgres | `brew services start postgresql@18` |
| Arrêter Postgres | `brew services stop postgresql@18` |
| Lancer le dev server | `pnpm dev` (utilise Webpack via `next dev --webpack`) |
| Régénérer Prisma | `pnpm prisma generate` |
| Nouvelle migration | `pnpm prisma migrate dev --name <nom>` |
| GUI Prisma | `pnpm prisma studio` |
| Inspecter la base | `psql hackathon_lab` puis `\dt`, `SELECT ...;`, `\q` |

### Indicateur de progression

À la fin de la Phase 2, l'application :
- Fonctionne en local avec base PostgreSQL persistante
- Liste et crée des documents via une UI fonctionnelle
- Offre une auto-complétion et un typage TypeScript bout-en-bout
- Compte 5 commits Git propres, un par sous-phase

Prochaine étape : **Phase 3 — Authentification**.