# Phase 3 — Authentification (version détaillée)

> Document de référence reconstituant l'intégralité de la Phase 3, dans l'ordre réel d'exécution, avec toutes les explications pédagogiques et les pièges rencontrés.

## Pré-requis (état en fin de Phase 2)

- Stack Next.js 16 + TypeScript + Tailwind + shadcn/ui + tRPC + Prisma 7 + PostgreSQL 18 fonctionnelle
- 5 commits Git propres
- L'application liste et crée des documents via une UI typée bout-en-bout
- Pas encore d'utilisateurs ni d'authentification : tout est public

## Choix de la Phase 3

| Décision | Justification |
|---|---|
| **Better Auth** (plutôt que Clerk ou Auth.js) | Activement maintenu en 2026, intégration native avec Prisma, configuration entièrement dans le code, propriété complète des données, idéal pour un projet auto-hébergé sur Azure. |
| **Email/mot de passe + OAuth (Google + GitHub)** | Couvre les deux scénarios principaux d'un hackathon : inscription rapide via OAuth, repli email pour les utilisateurs sans compte chez les providers. |
| **Documents rattachés à l'utilisateur** | Chaque utilisateur ne voit que ses propres documents (isolation logique). Préparation à un scénario juridique réel où la confidentialité est non négociable. |

## Plan complet de la Phase 3 (six sous-phases)

| Sous-phase | Objectif | Couche |
|---|---|---|
| 3A | Installer Better Auth + modèles utilisateur | Base de données + config |
| 3B | Route handler Next.js | API auth |
| 3C | Client Better Auth + pages signup/signin + barre supérieure | Interface |
| 3D | Session dans tRPC + `protectedProcedure` | Sécurité API |
| 3E | Relation `Document → User` + filtrage par propriétaire | Modèle de données |
| 3F | OAuth Google + GitHub | OAuth |

---

## Sous-phase 3A — Installer Better Auth et générer le schéma utilisateur

### Pourquoi Better Auth

Trois raisons centrales :
1. **Activement maintenu en 2026** — releases fréquentes, équipe responsable, doc à jour
2. **Intégration native avec Prisma + tRPC** — pas de couche d'adaptation à écrire
3. **Propriété complète des données** — toute la config est dans ton code, toutes les données dans ta base. Pas de service tiers à configurer (contrairement à Clerk), pas de mode de maintenance (contrairement à Auth.js qui est en patch-only depuis sept. 2025)

### Concepts clés introduits

#### Pourquoi un secret cryptographique
Better Auth signe les cookies de session avec un secret. Sans connaître ce secret, un attaquant ne peut pas forger un cookie valide. **32 octets aléatoires (256 bits)** est le standard.

> ⚠️ **Réflexe à acquérir** : ne jamais partager ce secret (Slack, email, screenshot, commit). Ne jamais le réutiliser entre environnements (dev / staging / production).

#### Les quatre modèles requis par Better Auth

| Modèle | Rôle |
|---|---|
| `User` | L'utilisateur lui-même (email, nom, image) |
| `Session` | Sessions actives — un utilisateur peut en avoir plusieurs simultanément (laptop + téléphone) |
| `Account` | Méthodes d'authentification liées à un utilisateur (`credential`, `google`, `github`...) — un utilisateur peut en avoir plusieurs |
| `Verification` | Codes temporaires (reset password, OTP, email verification) |

Un utilisateur qui s'inscrit avec email puis lie Google aura **deux** lignes `Account` qui pointent vers le **même** `User`.

#### Convention de nommage `@@map`
Better Auth utilise `@@map("user")`, `@@map("session")`, etc. pour forcer les **tables SQL en minuscules** (convention Better Auth) tout en gardant les **modèles Prisma en CamelCase** (convention TypeScript).

#### `ON DELETE CASCADE`
Quand un utilisateur est supprimé, ses sessions et ses comptes liés disparaissent automatiquement (RGPD/Loi 25).

### 3A.1 — Installer le paquet principal

```bash
pnpm add better-auth
```

> **À NE PAS faire** : `pnpm add -D @better-auth/cli`. Ce paquet (1.4.21, mars 2026) est obsolète depuis Better Auth 1.5 et provoque l'erreur :
> ```
> SyntaxError: The requested module 'better-call' does not provide an export named 'kAPIErrorHeaderSymbol'
> ```
> **Solution** : utiliser directement `pnpm dlx auth@latest generate` plus loin — la nouvelle CLI s'appelle simplement `auth` et reste synchronisée avec Better Auth.

### 3A.2 — Mettre à jour `pnpm-workspace.yaml`

L'installation tire deux paquets transitifs qui demandent des scripts post-install : `@prisma/client@5` (vieille version, dépendance interne) et `better-sqlite3` (qu'on n'utilise pas).

Éditer `pnpm-workspace.yaml` :

```yaml
allowBuilds:
  '@prisma/client': false
  '@prisma/engines': true
  better-sqlite3: false
  msw: true
  prisma: true
  sharp: true
  unrs-resolver: true
```

Puis `pnpm install` — aucun avertissement `[ERR_PNPM_IGNORED_BUILDS]` ne doit subsister.

### 3A.3 — Générer un secret cryptographique

```bash
openssl rand -base64 32
```

Garder la chaîne **en local seulement**, ne jamais l'envoyer dans un message.

### 3A.4 — Ajouter au `.env`

```
BETTER_AUTH_SECRET="<chaîne générée à 3A.3>"
BETTER_AUTH_URL="http://localhost:3000"
```

Better Auth lit ces deux variables **automatiquement** depuis `process.env` — pas besoin de les passer explicitement à la config.

### 3A.5 — Créer `lib/auth.ts`

```typescript
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
});
```

> **Piège important** : utiliser l'import relatif `./prisma`, **pas** l'alias `@/lib/prisma`. La CLI Better Auth qu'on lance à l'étape suivante s'exécute dans un environnement isolé qui ne comprend pas les alias TypeScript. L'alias resterait fonctionnel pour le reste de l'application — on ne le change que dans ce fichier précis.

### 3A.6 — Générer les modèles dans un fichier séparé

```bash
pnpm dlx auth@latest generate --output prisma/auth-schema.prisma --yes
```

**Pourquoi `--output` plutôt qu'écrire dans `prisma/schema.prisma` directement** : la CLI propose d'**écraser** le schéma existant. Trop risqué — ton modèle `Document` y serait perdu. La meilleure pratique : générer à part et fusionner manuellement.

Si pnpm te repose la question sur les builds : ne sélectionner rien, appuyer sur Entrée.

### 3A.7 — Fusionner dans `prisma/schema.prisma`

Inspecter `prisma/auth-schema.prisma`. **Ne pas** copier ses blocs `generator client` ni `datasource db` (ton fichier les contient déjà avec ton `output` personnalisé). **Copier uniquement les quatre `model`** à la fin de `prisma/schema.prisma`, après le modèle `Document` :

```prisma
model User {
  id            String    @id
  name          String
  email         String
  emailVerified Boolean   @default(false)
  image         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  sessions      Session[]
  accounts      Account[]

  @@unique([email])
  @@map("user")
}

model Session {
  id        String   @id
  expiresAt DateTime
  token     String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  ipAddress String?
  userAgent String?
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([token])
  @@index([userId])
  @@map("session")
}

model Account {
  id                    String    @id
  accountId             String
  providerId            String
  userId                String
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  @@index([userId])
  @@map("account")
}

model Verification {
  id         String   @id
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([identifier])
  @@map("verification")
}
```

Supprimer le fichier temporaire :

```bash
rm prisma/auth-schema.prisma
```

#### Subtilité sur les `id`

Les `id` n'ont **pas** `@default(cuid())` dans ces modèles. C'est intentionnel : **Better Auth génère ses propres IDs** (nanoid), il ne laisse pas Prisma le faire. C'est différent du modèle `Document` où on utilise `@default(cuid())`.

### 3A.8 — Migration Prisma

```bash
pnpm prisma migrate dev --name add-auth-models
```

Cette commande :
1. Génère un fichier SQL dans `prisma/migrations/<timestamp>_add_auth_models/migration.sql`
2. Applique 4 `CREATE TABLE`, 2 `UNIQUE INDEX`, 3 `INDEX`, 2 `FOREIGN KEY ... ON DELETE CASCADE`
3. Régénère le client TypeScript dans `lib/generated/prisma/`

### 3A.9 — Vérifier dans Postgres

```bash
psql hackathon_lab -c "\dt"
```

Six tables doivent apparaître : `Document`, `_prisma_migrations`, `account`, `session`, `user`, `verification`.

### 3A.10 — Commits

```bash
git add -A
git commit -m "Phase 3A: installer Better Auth et créer lib/auth.ts (sans schéma)"
git add -A
git commit -m "Phase 3A: Better Auth installé + modèles User/Session/Account/Verification"
```

(Deux commits pour cette sous-phase parce qu'on a procédé en deux temps : installation puis schéma.)

---

## Sous-phase 3B — Route handler Next.js

### Concept clé : route catch-all `[...all]`

Better Auth expose une foule d'endpoints : `sign-up/email`, `sign-in/email`, `sign-out`, `get-session`, `callback/google`, `callback/github`, `forget-password`, `reset-password`, etc.

Plutôt que de créer un fichier par endpoint, Next.js permet une **route catch-all** : un seul fichier qui attrape **tout** ce qui suit `/api/auth/`. La convention : `[...all]` (avec trois points, le « rest parameter » de JavaScript).

| Pattern | Effet |
|---|---|
| `[trpc]` | Capture **un** segment dynamique (`/api/trpc/document.list`) |
| `[...all]` | Capture **plusieurs** segments dynamiques (`/api/auth/sign-up/email`, `/api/auth/callback/google`, ...) |

### 3B.1 — Créer le dossier et le fichier

```bash
mkdir -p 'app/api/auth/[...all]'
code 'app/api/auth/[...all]/route.ts'
```

> Les guillemets simples autour de `[...all]` évitent que zsh interprète les caractères spéciaux.

Contenu de `route.ts` :

```typescript
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { POST, GET } = toNextJsHandler(auth);
```

Trois points importants :

1. **Ici on utilise l'alias `@/lib/auth`** (et non l'import relatif). Pourquoi : ce fichier sera lu par Next.js, qui résout parfaitement l'alias. Seule la CLI Better Auth avait du mal — c'est pour ça qu'on a corrigé `lib/auth.ts` uniquement.
2. **`toNextJsHandler(auth)`** transforme l'objet `auth` en handlers HTTP compatibles avec Next.js App Router.
3. **Une seule ligne pour les deux exports** : la déstructuration `{ POST, GET }` produit les exports nommés que Next.js attend.

### 3B.2 — Tester avec curl

Démarrer le serveur dans un terminal :

```bash
pnpm dev
```

#### Test 1 — Endpoint `get-session`

```bash
curl -i http://localhost:3000/api/auth/get-session
```

Réponse attendue : `HTTP 200 OK` avec un corps `null` (pas de session active, comportement normal).

#### Test 2 — Création de compte

```bash
curl -i -X POST http://localhost:3000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123!",
    "name": "Test User"
  }'
```

Réponse attendue : `HTTP 200 OK` avec un JSON contenant `token` et `user`, plus un en-tête `set-cookie` du genre :

```
set-cookie: better-auth.session_token=...; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax
```

#### Anatomie du cookie de session

| Attribut | Rôle |
|---|---|
| `better-auth.session_token=...` | Token signé, correspond à `Session.token` en base |
| `Max-Age=604800` | 7 jours (604 800 secondes) |
| `Path=/` | Cookie envoyé pour toutes les URLs du domaine |
| `HttpOnly` | **JavaScript ne peut pas lire ce cookie** — protection XSS |
| `SameSite=Lax` | **Protection CSRF** : pas envoyé sur requêtes cross-site dangereuses |

### 3B.3 — Piège classique : « Model user does not exist »

**Symptôme** : le serveur retourne `HTTP 500` avec dans la console :
```
ERROR [Better Auth]: Model user does not exist in the database. 
If you haven't generated the Prisma client, you need to run 'npx prisma generate'
```

**Cause profonde** : le serveur `pnpm dev` a été démarré **avant** la migration de la sous-phase 3A et garde en mémoire l'ancien client Prisma sans les modèles auth.

**Solution** :
1. `Ctrl+C` dans le terminal `pnpm dev`
2. `pnpm prisma generate` (force la régénération)
3. `pnpm dev` (redémarrage propre)
4. Refaire le test

**Leçon générale** : après chaque `pnpm prisma migrate dev`, il faut **redémarrer le serveur dev** pour qu'il prenne en compte le nouveau client. Webpack ne le détecte pas tout seul.

### 3B.4 — Vérification croisée en base

```bash
psql hackathon_lab -c "SELECT id, name, email FROM \"user\";"
psql hackathon_lab -c "SELECT id, \"userId\", \"expiresAt\" FROM session;"
psql hackathon_lab -c "SELECT \"providerId\", \"accountId\", password FROM account;"
```

#### Décodage du mot de passe haché

Le champ `password` de la table `account` ressemble à :

```
71076087a7336072c5117e8eb956020e:901945d05d9a7128a7c1f79d8b820defd0...
```

**Format** : `sel:hash`

| Partie | Rôle |
|---|---|
| Avant le `:` (32 caractères hex) | Le **sel** — chaîne aléatoire unique à cet utilisateur (16 octets) |
| Après le `:` (128 caractères hex) | Le **hash** — résultat de `scrypt(password, sel)` (64 octets) |

**Pourquoi le sel** : empêche les *rainbow tables* — deux utilisateurs avec le même mot de passe ont des hashs différents.

**Pourquoi scrypt** : fonction de hachage *volontairement lente* (~100 ms par calcul). Un bruteforce devient impraticable même si la base entière fuite.

### 3B.5 — Commit

```bash
git add -A
git commit -m "Phase 3B: route handler Better Auth (/api/auth/*)"
```

---

## Sous-phase 3C — Client Better Auth + pages signup/signin + barre supérieure

### Vue d'ensemble

Quatre fichiers à créer/modifier :

| Fichier | Rôle |
|---|---|
| `lib/auth-client.ts` | Client Better Auth côté navigateur |
| `app/sign-up/page.tsx` | Page d'inscription |
| `app/sign-in/page.tsx` | Page de connexion |
| `components/auth/auth-header.tsx` | Barre supérieure (état de session) |
| `app/layout.tsx` | Modification — placer `<AuthHeader />` dans le body |

### Concepts clés introduits

#### Client Better Auth — équivalent côté navigateur

Le client est l'équivalent de `lib/auth.ts` (serveur) pour le navigateur. Il expose des **hooks React** et des **fonctions** pour appeler les endpoints `/api/auth/*`.

| Méthode/Hook | Usage |
|---|---|
| `signUp.email({ name, email, password })` | Crée un compte. Better Auth crée automatiquement la session. |
| `signIn.email({ email, password })` | Connecte un utilisateur existant. |
| `signIn.social({ provider, callbackURL })` | OAuth (3F). Gère **automatiquement** création ET connexion. |
| `signOut()` | Déconnecte. Supprime le cookie. |
| `useSession()` | Hook React — retourne `{ data, isPending, error }`. `data` est `null` si non connecté. |

#### Navigation programmatique avec `router.push` + `router.refresh`

Après une inscription ou connexion réussie :
- `router.push("/")` change l'URL sans recharger toute la page
- `router.refresh()` force Next.js à re-rendre les **server components**, ce qui fait apparaître l'état connecté **immédiatement**

Sans `router.refresh()`, la barre supérieure resterait en mode « non connecté » jusqu'à un rechargement manuel.

#### Pourquoi placer `<AuthHeader />` à l'intérieur de `<Providers>`

`AuthHeader` utilise `useSession()`, qui a besoin que les providers React Query et tRPC soient déjà actifs. En plaçant `<AuthHeader />` **à l'intérieur** de `<Providers>`, on garantit cet ordre.

#### Le piège du *flash* visuel

Au tout premier rendu, `useSession()` retourne `{ data: null, isPending: true }`. Si on affichait directement « Se connecter / Créer un compte », l'utilisateur connecté verrait un *flash* avant que sa session se charge.

**Solution** : afficher un placeholder « Chargement… » pendant `isPending`. Discret mais évite les sauts visuels.

### 3C.1 — Créer le client Better Auth

`lib/auth-client.ts` :

```typescript
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
```

**Note** : pas de `baseURL` spécifié. Par défaut, le client appelle la même origine que la page courante (`http://localhost:3000/api/auth/*`).

### 3C.2 — Créer la page d'inscription

`app/sign-up/page.tsx` (version finale avec OAuth de 3F) :

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn, signUp } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setIsPending(true);

    const result = await signUp.email({ name, email, password });

    setIsPending(false);

    if (result.error) {
      setError(result.error.message ?? "Erreur lors de l'inscription");
      return;
    }

    router.push("/");
    router.refresh();
  }

  async function handleOAuth(provider: "github" | "google") {
    setError(null);
    await signIn.social({
      provider,
      callbackURL: "/",
    });
  }

  return (
    <main className="min-h-svh flex items-center justify-center p-6 bg-neutral-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Créer un compte</CardTitle>
          <CardDescription>
            Inscris-toi avec ton email, ou via Google/GitHub.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Nom"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isPending}
          />
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isPending}
          />
          <Input
            type="password"
            placeholder="Mot de passe (8 caractères minimum)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isPending}
          />
          <Button
            onClick={handleSubmit}
            disabled={
              isPending || !name.trim() || !email.trim() || password.length < 8
            }
            className="w-full"
          >
            {isPending ? "Création…" : "Créer mon compte"}
          </Button>
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-neutral-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-2 text-neutral-500">ou</span>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => handleOAuth("github")}
          >
            Continuer avec GitHub
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => handleOAuth("google")}
          >
            Continuer avec Google
          </Button>

          <p className="text-sm text-neutral-500 text-center pt-2">
            Déjà un compte ?{" "}
            <Link href="/sign-in" className="underline">
              Se connecter
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
```

**Note** : on présente la **version finale** (avec OAuth) — la version initiale de 3C n'avait pas les boutons OAuth, qui ont été ajoutés en 3F. Quand tu refais le projet, autant les inclure dès 3C si tu vises l'OAuth.

### 3C.3 — Créer la page de connexion

`app/sign-in/page.tsx` (version finale avec OAuth de 3F) :

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setIsPending(true);

    const result = await signIn.email({ email, password });

    setIsPending(false);

    if (result.error) {
      setError(result.error.message ?? "Email ou mot de passe incorrect");
      return;
    }

    router.push("/");
    router.refresh();
  }

  async function handleOAuth(provider: "github" | "google") {
    setError(null);
    await signIn.social({
      provider,
      callbackURL: "/",
    });
  }

  return (
    <main className="min-h-svh flex items-center justify-center p-6 bg-neutral-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Connexion</CardTitle>
          <CardDescription>
            Connecte-toi avec ton email et ton mot de passe, ou via Google/GitHub.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isPending}
          />
          <Input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isPending}
          />
          <Button
            onClick={handleSubmit}
            disabled={isPending || !email.trim() || !password.trim()}
            className="w-full"
          >
            {isPending ? "Connexion…" : "Se connecter"}
          </Button>
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-neutral-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-2 text-neutral-500">ou</span>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => handleOAuth("github")}
          >
            Continuer avec GitHub
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => handleOAuth("google")}
          >
            Continuer avec Google
          </Button>

          <p className="text-sm text-neutral-500 text-center pt-2">
            Pas encore de compte ?{" "}
            <Link href="/sign-up" className="underline">
              Créer un compte
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
```

### 3C.4 — Créer le composant barre supérieure

`components/auth/auth-header.tsx` :

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function AuthHeader() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  async function handleSignOut() {
    await signOut();
    router.push("/");
    router.refresh();
  }

  if (isPending) {
    return (
      <div className="h-10 flex items-center justify-end px-6">
        <span className="text-xs text-neutral-400">Chargement…</span>
      </div>
    );
  }

  return (
    <header className="h-12 flex items-center justify-between px-6 border-b border-neutral-200 bg-white">
      <Link href="/" className="text-sm font-semibold text-neutral-900">
        Hackathon Lab
      </Link>

      <div className="flex items-center gap-3">
        {session ? (
          <>
            <span className="text-sm text-neutral-700">
              Bonjour, {session.user.name}
            </span>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              Se déconnecter
            </Button>
          </>
        ) : (
          <>
            <Link href="/sign-in">
              <Button variant="ghost" size="sm">
                Se connecter
              </Button>
            </Link>
            <Link href="/sign-up">
              <Button size="sm">Créer un compte</Button>
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
```

**Structure typée de `session`** : c'est un objet `{ session, user }`. `session` contient les infos de la session (id, token, expiresAt, etc.). `user` contient `{ id, name, email, emailVerified, image, ... }`.

### 3C.5 — Brancher dans le layout racine

Dans `app/layout.tsx`, deux modifications :

Ajouter l'import :

```tsx
import { AuthHeader } from "@/components/auth/auth-header";
```

Remplacer le `<body>` :

```tsx
<body className="min-h-full flex flex-col">
  <Providers>
    <AuthHeader />
    {children}
  </Providers>
</body>
```

> **Important** : `<AuthHeader />` est **à l'intérieur** de `<Providers>` parce qu'il utilise `useSession()` qui requiert que React Query soit déjà initialisé.

### 3C.6 — Tester

Avec `pnpm dev` actif :

1. **Affichage initial (non connecté)** : la page d'accueil montre la barre avec « Se connecter » + « Créer un compte »
2. **Inscription** : aller sur `/sign-up`, remplir le formulaire, soumettre → redirection vers l'accueil avec « Bonjour [nom] »
3. **Déconnexion** : clic sur « Se déconnecter » → la barre repasse en mode non-connecté
4. **Connexion** : aller sur `/sign-in`, saisir le même email/mot de passe → succès
5. **Mauvais mot de passe** : message d'erreur rouge visible

### 3C.7 — Important : la protection n'existe PAS encore

À la fin de 3C, **un utilisateur non connecté peut toujours voir et créer des documents**. Les procédures tRPC `document.list` et `document.create` sont restées **publiques**. C'est volontaire : la sous-phase 3D va ajouter la **vraie protection**.

### 3C.8 — Commit

```bash
git add -A
git commit -m "Phase 3C: pages signup/signin + client Better Auth + AuthHeader"
```

---

## Sous-phase 3D — Session dans tRPC + `protectedProcedure`

### Concept central

C'est ici qu'on fait passer la sécurité du serveur à un niveau **production**. Jusqu'ici, n'importe qui pouvait appeler nos procédures tRPC. Après 3D, seuls les utilisateurs authentifiés y arrivent.

Trois étapes conceptuelles :
1. **Charger** la session côté serveur à chaque requête (via cookies + Better Auth)
2. **Injecter** la session dans le contexte tRPC
3. **Créer un middleware** qui refuse les requêtes sans session valide

### 3D.1 — Modifier `server/trpc/init.ts`

```typescript
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { cache } from "react";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * Contexte tRPC : objets disponibles dans toutes les procédures.
 */
export const createTRPCContext = cache(async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return { prisma, session };
});

const t = initTRPC
  .context<Awaited<ReturnType<typeof createTRPCContext>>>()
  .create({
    transformer: superjson,
  });

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

/**
 * protectedProcedure : refuse les requêtes non authentifiées.
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Tu dois être connecté pour effectuer cette action.",
    });
  }

  return next({
    ctx: {
      ...ctx,
      session: ctx.session, // TypeScript sait maintenant que session.user existe
    },
  });
});
```

**Décortiquons** :

| Élément | Rôle |
|---|---|
| `import { TRPCError }` | Erreurs typées avec code HTTP standard |
| `headers()` (de `next/headers`) | Helper Next.js pour lire les en-têtes (donc les cookies) de la requête courante. **Asynchrone** dans Next.js récent — d'où le `await`. |
| `auth.api.getSession({ headers })` | Lit le cookie `better-auth.session_token`, vérifie sa signature, retourne `{ user, session }` ou `null` |
| `protectedProcedure` | Middleware `.use(...)` qui intercepte avant la procédure : 401 si pas de session, sinon enrichit `ctx` avec un `session` non-nullable |

### 3D.2 — Modifier le routeur document

Trois changements minimes dans `server/trpc/routers/document.ts` :

1. Import : `protectedProcedure` au lieu de `publicProcedure`
2. `list: protectedProcedure.query(...)` au lieu de `publicProcedure.query(...)`
3. `create: protectedProcedure.input(...)` au lieu de `publicProcedure.input(...)`

Le **corps des procédures ne change pas** à cette étape. Toute la sécurité est dans le middleware `protectedProcedure`.

### 3D.3 — Tester

1. **Redémarrer Next.js** (`Ctrl+C` puis `pnpm dev`) — Webpack pourrait avoir mis en cache l'ancienne version
2. **Non connecté** : ouvrir l'app en navigation privée → la section « Documents existants » affiche `Erreur : Tu dois être connecté pour effectuer cette action.`
3. **Tentative de création** : message d'erreur similaire sous le bouton
4. **Connexion** : tout refonctionne normalement

### 3D.4 — Commit

```bash
git add -A
git commit -m "Phase 3D: protectedProcedure dans tRPC (session injectée)"
```

---

## Sous-phase 3E — Rattacher `Document` à `User`

### Objectif

Maintenant que les procédures sont protégées (3D), tous les utilisateurs connectés voient encore **tous** les documents. On veut une **isolation par propriétaire** : chaque utilisateur ne voit que ses propres documents.

### 3E.1 — Supprimer les documents existants

Les documents créés en Phase 2 et 3D n'ont pas de propriétaire. La migration qui suit refuserait de leur attribuer un `userId` non-nul. On les supprime.

```bash
psql hackathon_lab -c 'DELETE FROM "Document";'
psql hackathon_lab -c 'SELECT COUNT(*) FROM "Document";'
```

Le `COUNT(*)` doit afficher `0`.

### 3E.2 — Modifier `prisma/schema.prisma`

Deux modifications :

**1. Enrichir le modèle `Document`** :

```prisma
model Document {
  id        String   @id @default(cuid())
  title     String
  content   String   @db.Text
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Propriétaire du document
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

**2. Ajouter la liste inverse au modèle `User`** :

Dans le bloc `User`, après `accounts Account[]`, ajouter :

```prisma
documents     Document[]
```

### 3E.3 — Migration Prisma

```bash
pnpm prisma migrate dev --name document-user-relation
```

Le SQL généré :

```sql
ALTER TABLE "Document" ADD COLUMN "userId" TEXT NOT NULL;
CREATE INDEX "Document_userId_idx" ON "Document"("userId");
ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_fkey" 
  FOREIGN KEY ("userId") REFERENCES "user"("id") 
  ON DELETE CASCADE ON UPDATE CASCADE;
```

Avertissement dans le SQL généré :
> `Added the required column userId to the Document table without a default value. This is not possible if the table is not empty.`

C'est exactement pour ça qu'on a vidé la table en 3E.1.

### 3E.4 — Piège classique : erreur TypeScript résiduelle

Après la migration, VS Code peut afficher :
```
Object literal may only specify known properties, and 'userId' does not exist in type 'DocumentWhereInput'.
```

**Cause** : le serveur TypeScript de VS Code lit encore l'ancien client Prisma mis en cache.

**Solution** :
1. `Cmd+Shift+P` → `TypeScript: Restart TS Server`
2. Si ça ne marche pas : `pnpm prisma generate`, puis refaire le Restart TS Server

### 3E.5 — Modifier les procédures tRPC

`server/trpc/routers/document.ts` :

```typescript
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc/init";

export const documentRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.document.findMany({
      where: { userId: ctx.session.user.id }, // ← filtre par propriétaire
      orderBy: { createdAt: "desc" },
    });
  }),

  create: protectedProcedure
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
          userId: ctx.session.user.id, // ← propriétaire forcé côté serveur
        },
      });
    }),
});
```

**Point pédagogique central — pourquoi c'est sûr** : le schéma Zod n'accepte **que** `title` et `content`. Un attaquant qui essaierait d'envoyer `{ userId: "autre" }` se ferait rejeter (ou ignorer), et le code écrase de toute façon avec `ctx.session.user.id`. **Toujours forcer l'identité du propriétaire côté serveur.**

### 3E.6 — Tester avec deux comptes

1. **Compte A** (Safari normal) : crée un document
2. **Compte B** (Safari privé, nouveau compte) : la liste doit être vide → crée un document
3. **Retour A** : recharge, ne vois que le document de A

### 3E.7 — Vérification croisée en base

```bash
psql hackathon_lab -c 'SELECT d.title, u.name AS owner FROM "Document" d JOIN "user" u ON d."userId" = u.id;'
```

Doit afficher chaque document avec son propriétaire.

### 3E.8 — Commit

```bash
git add -A
git commit -m "Phase 3E: relation Document → User + filtrage par propriétaire"
```

---

## Sous-phase 3F — OAuth Google + GitHub

### Le flux OAuth en deux phrases

1. Notre application redirige l'utilisateur vers GitHub/Google avec notre `client_id`
2. GitHub/Google le redirige vers `/api/auth/callback/<provider>` avec un code temporaire
3. Better Auth échange ce code contre un `accessToken`, récupère le profil, crée le compte si nouveau
4. L'utilisateur est redirigé vers la `callbackURL` qu'on indique

### 3F.1 — Créer une OAuth App chez GitHub

Aller sur **https://github.com/settings/developers** → **OAuth Apps** → **New OAuth App** :

| Champ | Valeur |
|---|---|
| Application name | `Hackathon Lab (local)` |
| Homepage URL | `http://localhost:3000` |
| Authorization callback URL | `http://localhost:3000/api/auth/callback/github` |

> ⚠️ Le callback URL **doit être exactement** `http://localhost:3000/api/auth/callback/github`.

Après création, récupérer :
- **Client ID** (visible immédiatement)
- **Client Secret** : générer via « Generate a new client secret » — GitHub ne le réaffichera plus jamais après cette unique vue.

### 3F.2 — Créer une OAuth App chez Google

C'est plus dense que GitHub. Plusieurs écrans à parcourir sur **https://console.cloud.google.com/**.

1. **Créer un projet** : `Hackathon Lab`
2. **OAuth consent screen** :
   - App Information : `Hackathon Lab` + ton email
   - Audience : `External`
   - Contact : ton email
   - Accepter les conditions
3. **Credentials** → **+ CREATE CREDENTIALS** → **OAuth client ID**
   - Application type : `Web application`
   - Name : `Hackathon Lab Web Client`
   - **Authorized JavaScript origins** : `http://localhost:3000`
   - **Authorized redirect URIs** : `http://localhost:3000/api/auth/callback/google`
4. **Cliquer CREATE** — copier le Client ID et le Client Secret tout de suite

### 3F.3 — Ajouter au `.env`

```
GITHUB_CLIENT_ID="<github client id>"
GITHUB_CLIENT_SECRET="<github client secret>"

GOOGLE_CLIENT_ID="<google client id>"
GOOGLE_CLIENT_SECRET="<google client secret>"
```

Better Auth lit ces quatre variables **automatiquement** depuis `process.env`.

### 3F.4 — Modifier `lib/auth.ts`

```typescript
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
});
```

Le `!` après `process.env.X` est le **non-null assertion operator** TypeScript. Sans lui, le type serait `string | undefined`. Si les variables manquent, Better Auth plante au démarrage — préférable à un bug silencieux au moment du OAuth.

### 3F.5 — Modifier les pages signin/signup

Ajouter dans chaque page (voir code complet dans 3C.2 et 3C.3 ci-dessus) :
- Une fonction `handleOAuth(provider: "github" | "google")` qui appelle `signIn.social({ provider, callbackURL: "/" })`
- Deux boutons « Continuer avec GitHub » et « Continuer avec Google » sous un séparateur « ou »

**Point clé** : on utilise `signIn.social` dans les **deux** pages, parce qu'avec OAuth on ne distingue pas inscription et connexion — le provider gère ça pour toi.

### 3F.6 — Tester

1. Redémarrer `pnpm dev`
2. Aller sur `/sign-in`, vérifier que les deux boutons OAuth apparaissent
3. Cliquer « Continuer avec GitHub » → autoriser sur GitHub → redirection vers `/` connecté
4. Déconnecter, cliquer « Continuer avec Google » → autoriser → connecté avec un autre compte

### 3F.7 — Vérification croisée en base

```bash
psql hackathon_lab -c 'SELECT id, name, email FROM "user";'
psql hackathon_lab -c 'SELECT "providerId", "accountId", "userId" FROM account;'
```

Tu dois voir plusieurs `providerId` : `credential` (email/mot de passe), `github`, `google`.

### 3F.8 — Commit

```bash
git add -A
git commit -m "Phase 3F: OAuth GitHub + Google via Better Auth"
```

---

## Bilan de la Phase 3

### Structure finale du projet (extraits pertinents)

```
hackathon-lab/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   └── [...all]/
│   │   │       └── route.ts          # Catch-all Better Auth (3B)
│   │   └── trpc/
│   │       └── [trpc]/
│   │           └── route.ts          # tRPC (Phase 2)
│   ├── sign-in/
│   │   └── page.tsx                  # Page de connexion (3C + 3F)
│   ├── sign-up/
│   │   └── page.tsx                  # Page d'inscription (3C + 3F)
│   ├── layout.tsx                    # Avec <AuthHeader />
│   └── providers.tsx                 # tRPC providers (Phase 2)
├── components/
│   ├── auth/
│   │   └── auth-header.tsx           # Barre supérieure (3C)
│   └── documents/                    # Phase 2
├── lib/
│   ├── auth.ts                       # Config Better Auth (3A + 3F)
│   ├── auth-client.ts                # Client navigateur (3C)
│   ├── prisma.ts                     # Singleton (Phase 2)
│   └── generated/prisma/             # Client généré (gitignored)
├── prisma/
│   ├── migrations/
│   │   ├── <init>/                   # Phase 2
│   │   ├── <add_auth_models>/        # 3A
│   │   └── <document_user_relation>/ # 3E
│   └── schema.prisma                 # Document + User + Session + Account + Verification
└── server/
    └── trpc/
        ├── init.ts                   # protectedProcedure (3D)
        └── routers/
            └── document.ts           # Filtrage par userId (3E)
```

### Variables d'environnement (`.env`)

```
DATABASE_URL="postgresql://alain@localhost:5432/hackathon_lab"
BETTER_AUTH_SECRET="<32 octets aléatoires>"
BETTER_AUTH_URL="http://localhost:3000"
GITHUB_CLIENT_ID="<github oauth>"
GITHUB_CLIENT_SECRET="<github oauth>"
GOOGLE_CLIENT_ID="<google oauth>"
GOOGLE_CLIENT_SECRET="<google oauth>"
```

### Tables PostgreSQL

```
Document  (avec userId, foreign key vers user)
user
session
account
verification
_prisma_migrations
```

### Capacités acquises

- Inscription/connexion email + mot de passe
- Authentification OAuth Google et GitHub
- Sessions de 7 jours avec cookies HttpOnly + SameSite=Lax + scrypt + sel
- Procédures tRPC protégées (401 si non authentifié)
- Isolation des données par propriétaire (chaque utilisateur ne voit que ses documents)
- Suppression en cascade (RGPD/Loi 25)
- Architecture entièrement typée bout-en-bout

### Pièges majeurs rencontrés et leçons à retenir

1. **`@better-auth/cli` obsolète** — utiliser `pnpm dlx auth@latest generate`, pas l'ancien paquet
2. **Import relatif dans `lib/auth.ts`** — la CLI Better Auth ne comprend pas les alias `@/...`
3. **`pnpm-workspace.yaml` à mettre à jour** — `@prisma/client@5` et `better-sqlite3` doivent être `false`
4. **Redémarrer `pnpm dev` après chaque migration Prisma** — sinon « Model X does not exist » ou erreurs TypeScript fantômes
5. **Restart TS Server dans VS Code** après régénération du client Prisma
6. **Toujours forcer le `userId` côté serveur** — ne jamais faire confiance au client
7. **OAuth callback URL doit être exact** — `/api/auth/callback/<provider>`, convention Better Auth
8. **`process.env.X!`** — non-null assertion acceptable pour les secrets OAuth, plante visiblement si manquant
9. **Vider la table avant migration avec colonne `NOT NULL`** — sinon Prisma refuse

### Commandes utiles à retenir

| Action | Commande |
|---|---|
| Régénérer la CLI Better Auth | `pnpm dlx auth@latest generate --output prisma/auth-schema.prisma --yes` |
| Nouveau secret cryptographique | `openssl rand -base64 32` |
| Vérifier les utilisateurs | `psql hackathon_lab -c 'SELECT id, name, email FROM "user";'` |
| Vérifier les méthodes d'auth | `psql hackathon_lab -c 'SELECT "providerId", "accountId", "userId" FROM account;'` |
| Liste documents par propriétaire | `psql hackathon_lab -c 'SELECT d.title, u.name AS owner FROM "Document" d JOIN "user" u ON d."userId" = u.id;'` |

### Indicateur de progression

À la fin de la Phase 3, l'application :
- Authentifie via email/mot de passe **ou** OAuth Google **ou** OAuth GitHub
- Protège toutes les procédures tRPC par défaut
- Isole les données par utilisateur (zéro fuite entre comptes)
- Compte 7 commits Git propres (12 commits total avec les Phases 1 + 2)
- Est prête pour la Phase 4 (API Claude)

Prochaine étape : **Phase 4 — Première verticale IA complète**.