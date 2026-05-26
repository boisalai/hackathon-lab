# Hackathon Lab — Brief pour Claude Code

## Contexte du projet

**hackathon-lab** est une application bac à sable de l'utilisateur, Alain Boisvert, étudiant au baccalauréat en droit à l'Université Laval. Objectif : développer un *starter* prêt à forker pour des hackathons IA × Droit, et apprendre le développement web moderne avec IA pas à pas.

Construit selon `plan-apprentissage.md` (à la racine). Méthodologie : une phase à la fois, avec exécution complète + journal détaillé (`phase-X.md`) avant de passer à la suivante.

### Profil utilisateur

- Étudiant en droit québécois, pas développeur professionnel
- Maîtrise informatique et IA, mais débutant en code de production
- Prend des notes en markdown
- Préférences strictes (cf. son `userPreferences`) :
  - Réponses brèves, précises, pédagogiques
  - Toujours markdown
  - **Ne jamais présumer** — vérifier les sources
  - **Aucune référence ajoutée de mémoire** — seulement ce qui est vérifiable
  - **Toujours chercher le texte officiel des articles de loi** quand pertinent
- Mac Apple Silicon M4 avec 48 Go RAM

## État actuel (fin Phase 6)

### Phases complétées

| Phase | Livrable | Doc |
|---|---|---|
| 1 | Setup Next.js + TS + Tailwind + shadcn | `phase-1.md` |
| 2 | tRPC + Prisma + PostgreSQL (Documents) | `phase-2.md` + `phase-2-concepts.md` |
| 3 | Better Auth (email/password + GitHub + Google) | `phase-3.md` + `phase-3-concepts.md` |
| 4 | Résumeur de jugement (Claude, streaming, structured output CanLII) | `phase-4.md` |
| 5 | Sidebar nav + serveur LLM local MLX + Anonymiseur + sélecteur multi-modèles + fallback | `phase-5.md` |
| 6 | Détecteur de fuite PII + garde-fou anonymiseur + journal de sécurité | `phase-6.md` |

### Verticales en service

| Verticale | URL | Modèles compatibles | Streaming | Garde-fou |
|---|---|---|---|---|
| Gestion de documents (simple CRUD) | `/` | N/A | N/A | N/A |
| Résumeur de jugement | `/judgment` | Claude Haiku 4.5, Sonnet 4.6, Opus 4.7 | ✓ via `streamText + Output.object` | ✗ (piste ouverte) |
| Anonymiseur de texte | `/anonymize` | Qwen3-8B local, Claude (tous) | ✗ via `generateText + tool calling` | ✓ (détecteur PII + override) |
| Journal de sécurité | `/security` | N/A (lecture Prisma directe) | N/A | N/A |

## Stack technique

```
Next.js 16.2.6 (webpack)
├─ React + TypeScript
├─ Tailwind CSS + shadcn/ui
├─ tRPC v11 + React Query
├─ Prisma + PostgreSQL 18
├─ Better Auth (email + GitHub + Google OAuth)
├─ Vercel AI SDK v6 (`ai`)
│  ├─ @ai-sdk/anthropic (Claude)
│  ├─ @ai-sdk/openai-compatible (modèles locaux via mlx_lm.server)
│  └─ @ai-sdk/react (hooks useObject)
└─ MLX-LM (Python venv ~/.venvs/mlx) pour modèles locaux
```

### Identifiants Anthropic en service (Mai 2026)

```typescript
"claude-haiku-4-5-20251001"  // Haiku 4.5, daté
"claude-sonnet-4-6"           // Sonnet 4.6
"claude-opus-4-7"             // Opus 4.7, phare actuel
```

### Modèle local en service

```bash
mlx-community/Qwen3-8B-4bit-AWQ
# Lancé via : mlx_lm.server --model mlx-community/Qwen3-8B-4bit-AWQ --port 8080
# Identifiant interne exposé : "default_model"
```

## Conventions du projet

### Structure des dossiers

```
app/                    # Pages Next.js (App Router)
  ├─ api/               # Route handlers
  │  ├─ auth/[...all]/route.ts        # Better Auth catch-all
  │  ├─ trpc/[trpc]/route.ts          # tRPC adapter
  │  ├─ judgment/summarize/route.ts   # Streaming Claude (bypass tRPC)
  │  └─ anonymize/route.ts            # Tool calling Qwen/Claude + garde-fou PII (bypass tRPC)
  ├─ <verticale>/page.tsx             # Server components avec redirect si non connecté
  ├─ security/page.tsx                # Journal de sécurité (lecture Prisma directe, Phase 6C)
  └─ layout.tsx                       # SidebarProvider + AppSidebar

components/
  ├─ ui/                              # shadcn (généré, NE PAS modifier sauf nécessaire)
  ├─ nav/app-sidebar.tsx              # Sidebar avec liste des verticales
  ├─ auth/                            # AuthHeader, SignInForm, SignUpForm
  ├─ documents/                       # CRUD documents (Phase 2)
  ├─ judgment/                        # Résumeur (Phase 4)
  └─ anonymize/                       # Anonymiseur + ModelSelector réutilisable + panneau de confirmation (Phase 6B)

lib/
  ├─ prisma.ts                        # Singleton Prisma
  ├─ auth.ts                          # Config Better Auth (serveur)
  ├─ auth-client.ts                   # Client Better Auth (navigateur)
  ├─ trpc/                            # Setup tRPC client + server
  ├─ local-llm.ts                     # Provider openai-compatible vers mlx_lm.server
  ├─ models-registry.ts               # Catalogue central de modèles avec capabilities
  ├─ with-fallback.ts                 # Helper de fallback local → cloud
  ├─ judgment-schema.ts               # Schéma Zod + system prompt + DeepPartial
  ├─ anonymize-schema.ts              # Idem pour anonymiseur
  └─ leak-detector.ts                 # Détecteur PII par regex (NAS, RAMQ, etc.) — module pur, Phase 6A

scripts/
  └─ test-leak-detector.ts            # Harnais ad hoc pour leak-detector (lancé via pnpm dlx tsx)

server/trpc/
  ├─ init.ts                          # createTRPCRouter, publicProcedure, protectedProcedure
  ├─ root.ts                          # appRouter (documentRouter + judgmentRouter)
  └─ routers/                         # Procédures par domaine métier
```

### Convention de nommage

- **Composants** : `components/<feature>/<name>.tsx` (ex: `components/judgment/judgment-form.tsx`)
- **Schémas + prompts partagés** : `lib/<feature>-schema.ts`
- **Pages auth-gated** : server component avec `redirect("/sign-in")` si pas de session
- **Identifiants de modèles** : datés et explicites (`claude-haiku-4-5-20251001`), pas d'alias glissants

### Patterns architecturaux établis

#### 1. Streaming + structured output → bypass tRPC, route handler natif

tRPC + streaming + sortie structurée ne se combinent pas. Pour ces cas (Résumeur), on utilise un route handler Next.js + `useObject` côté client. Le reste de l'app reste sur tRPC.

Conséquence : **auth dupliquée** (`protectedProcedure` ET vérification manuelle dans route handlers). Acceptable à notre échelle.

#### 2. Sortie structurée selon le serveur

| Serveur | Méthode |
|---|---|
| Anthropic (Claude) | `streamText` + `Output.object({ schema })` puis `result.toTextStreamResponse()` |
| mlx_lm.server (Qwen) | `generateText` + `tools` + `toolChoice: "required"` (le tool calling EST la sortie structurée) |

**Ne PAS utiliser `Output.object` avec mlx_lm.server** — il n'implémente pas `response_format: json_schema`.

#### 3. Schéma + system prompt partagés

Toujours dans `lib/<feature>-schema.ts`. Importé à la fois par le route handler (serveur) et le composant client (`useObject` ou parsing manuel).

#### 4. DeepPartial avec `| undefined` sur arrays

Pour les composants partial-aware (rendu progressif pendant streaming) :

```typescript
export type DeepPartial<T> = T extends Array<infer U>
  ? Array<DeepPartial<U> | undefined>  // ← le | undefined est ESSENTIEL
  : T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T;
```

Sans le `| undefined`, TypeScript refuse l'affectation du `object` retourné par `useObject` (qui utilise `PartialObject` du SDK).

#### 5. Reset par remount pour les hooks AI SDK

`useObject` n'expose pas de `reset()`. Pattern : wrapper qui passe une `key` au composant interne :

```typescript
export function MyForm() {
  const [iteration, setIteration] = useState(0);
  return <Inner key={iteration} onReset={() => setIteration(i => i + 1)} />;
}
```

#### 6. Registre de modèles avec capabilities

`lib/models-registry.ts` est la source unique. Chaque verticale **filtre** le catalogue selon ses besoins :

```typescript
const streamingModels = modelsWith("streaming-structured");  // Pour le Résumeur
// L'Anonymiseur prend tous les modèles via MODEL_LIST
```

Capabilities actuelles : `streaming-structured`, `tool-calling`.

#### 7. Séparation client/serveur sur les types lourds

`LanguageModel` (Vercel AI SDK) ne doit **pas** traverser la frontière serveur/client. Le composant `ModelSelector` reçoit un `ClientModelInfo` minimal (id, label, provider, description, available).

#### 8. Fallback automatique transparent

`lib/with-fallback.ts` enveloppe les appels modèle. Si le serveur local est injoignable (détection récursive sur `ECONNREFUSED` à travers `cause`, `errors[]`, `lastError`), bascule sur le modèle pointé par `fallbackTo` dans le registre.

L'UI **doit** signaler le fallback à l'utilisateur (banner ambré avec mention que les données ont été envoyées au cloud).

#### 9. État UI = state machine TypeScript discriminée

```typescript
type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T; meta?: Meta }
  | { status: "error"; message: string };
```

Évite les bugs du genre « j'affiche les données pendant le loading ». L'Anonymiseur étend ce pattern avec un status `"confirm"` pour le garde-fou (Phase 6B).

#### 10. Garde-fou en amont d'un appel LLM (Phase 6B)

Pattern : un module **pur** de détection (regex pures, pas d'I/O) est appelé **avant** tout `generateText` / `streamText` côté route handler. Si détection :

- HTTP **409 Conflict** (pas 400, pas 500) — c'est un *signal métier*, pas une erreur.
- Côté client : tester `response.status === 409` **avant** `response.ok`.
- Override déclaratif via `override: true` dans le body (pas un header) — visible, testable au curl, validable par Zod.
- Rescan systématique côté serveur quand override = true, pour journaliser ce qui a été accepté.

Politique uniforme (on scanne pour tout modèle, même local) plutôt que conditionnelle au provider : les modèles locaux ont tous un `fallbackTo` cloud, donc tout texte est potentiellement exfiltrable.

#### 11. Server component → Prisma direct (sans tRPC) (Phase 6C)

Pour des **lectures pures** sans refresh interactif (page d'audit, journal, dashboard statique), un server component qui appelle directement Prisma est préférable à un routeur tRPC. Pas d'hydration, pas de plomberie additionnelle.

tRPC reste le défaut pour les mutations, les lectures côté client component, et tout ce qui bénéficie du cache React Query. Règle : commencer par Prisma direct, extraire en tRPC seulement quand on a besoin du cache / refresh / typage côté client.

## Conventions Qwen3 spécifiques

- **Toujours ajouter `/no_think`** dans le system prompt pour désactiver le mode thinking (sinon les tokens partent en raisonnement interne au lieu du contenu)
- L'identifiant interne du modèle servi par mlx_lm.server est `"default_model"` (un seul modèle à la fois sur un serveur)
- Latence approximative sur M4 + 48 Go : 1-3 s par 100 tokens d'output, prétraitement ~2 s par 1000 tokens d'input

## Pièges à éviter (capturés dans les phases 1-5)

### TypeScript / TSX

- **`.reduce<T>(...)` inline dans `.tsx`** → confusion avec JSX, utiliser un type alias + cast `as Grouped`
- **`toolCall.input` non typé** → cast `as MaSorteRésultat` après validation Zod automatique
- **Type `LanguageModel` côté client** → bundle gonflé, ne pas l'importer dans des composants

### Vercel AI SDK

- **`streamText` n'est PAS async** (contrairement à `generateText`) — pas de `await`
- **`generateObject` est déprécié en v6** — utiliser `generateText` + `Output.object`
- **`result.object` → `result.output`** quand on migre vers la nouvelle API (erreur silencieuse classique)
- **`@ai-sdk/react` est un paquet séparé** du core `ai`
- **3 retry automatiques** par défaut — pour fail-fast sur le fallback : `maxRetries: 0`

### Next.js 16

- **`flex flex-col` sur `<body>`** entre en conflit avec `SidebarProvider`
- **`usePathname()` nécessite `"use client"`**
- **HMR rate parfois les nouveaux fichiers** — redémarrer `pnpm dev` après création de nouveaux modules

### Better Auth

- Toujours utiliser `auth.api.getSession({ headers: await headers() })` dans les server components
- Le cookie HttpOnly empêche l'accès JS direct, c'est voulu

### Prisma 7.8

- `pnpm prisma migrate dev` **ne régénère pas toujours le client** automatiquement (bug constaté). Symptôme : `Property 'X' does not exist on type 'PrismaClient'` malgré une migration réussie. Lancer `pnpm prisma generate` explicitement après chaque migration et vérifier `pnpm exec tsc --noEmit`.
- HMR ne prend pas le nouveau client à chaud — redémarrer `pnpm dev` après `prisma generate`.
- Les colonnes `Json` reviennent typées `unknown` côté Prisma → cast `as Partial<Record<...>>` ou parse Zod selon la confiance qu'on a dans la source d'écriture.

### Détecteur de fuite / regex PII

- **Algorithme de Luhn obligatoire** pour NAS et cartes de crédit — sans, faux positifs massifs sur tout identifiant numérique (numéros de série, IDs internes).
- **RAMQ en majuscules strictes** (pas de flag `/i`) — sinon n'importe quel mot de 4 lettres latines + 8 chiffres matche (« avec 4111 1111 » serait capté).
- **Téléphone exige un séparateur** — une chaîne de 10 chiffres bruts n'est pas un téléphone aux yeux du système.
- **Code postal canadien** : lettres D, F, I, O, Q, U interdites en positions 1, 3, 5 (et W, Z en 1re). Regex `[A-CEGHJ-NPR-TVXY]` etc.
- `regex.lastIndex = 0` au début de chaque règle (état stateful avec `/g`).

### React / JSX

- **Apostrophes ASCII (`'`) dans le JSX** déclenchent `react/no-unescaped-entities` en ESLint. Utiliser `&apos;` dans les nouveaux textes. Le projet a quelques préexistants dans phase-4/5 — ne pas se laisser tenter d'en ajouter.

### Bash / shell

- Le venv MLX doit être **réactivé à chaque session** : `source ~/.venvs/mlx/bin/activate`
- `mlx_lm.server` doit tourner dans un terminal **séparé** de `pnpm dev`
- Harnais de test ad hoc : `pnpm dlx tsx scripts/<nom>.ts` (pas besoin d'ajouter `tsx` aux deps).

## Commandes utiles

```bash
# Démarrer le développement (3 terminaux idéalement)
source ~/.venvs/mlx/bin/activate                                                  # terminal 1
mlx_lm.server --model mlx-community/Qwen3-8B-4bit-AWQ --port 8080                  # terminal 1
pnpm dev                                                                          # terminal 2
# terminal 3 : libre pour git, tests, etc.

# Installer un composant shadcn
pnpm dlx shadcn@latest add <name>
# Si invite pnpm sur msw : Enter pour ignorer

# Tester le serveur local directement
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"test /no_think"}],"max_tokens":50}'

# Prisma
pnpm prisma migrate dev --name <description>
pnpm prisma studio

# Git workflow typique
git status
git add <files-spécifiques>  # éviter git add -A sans réfléchir
git commit -m "Phase <X>: <description courte>"
```

## Variables d'environnement (.env)

```
DATABASE_URL="postgresql://..."
BETTER_AUTH_SECRET="..."
BETTER_AUTH_URL="http://localhost:3000"
GITHUB_CLIENT_ID="..."
GITHUB_CLIENT_SECRET="..."
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
ANTHROPIC_API_KEY="sk-ant-..."
LOCAL_LLM_BASE_URL="http://localhost:8080/v1"   # optionnel, défaut codé en dur
```

## Méthodologie de travail recommandée

L'utilisateur préfère :

1. **Avancer par sous-phases nommées** (5B.1, 5B.2…) plutôt que par gros blocs
2. **Décisions architecturales explicites** avant le code (option A vs option B avec trade-offs)
3. **Pièges expliqués au moment de leur découverte**, pas anticipés
4. **Code complet à copier-coller**, pas de fragments à fusionner manuellement
5. **Validation à chaque étape** ("signale-moi quand c'est compilé sans erreur") avant la suivante
6. **Tests réels** sur le jugement Parenteau (`2026 QCCQ 2235`, fourni en PDF) ou textes générés ad hoc
7. **Commits descriptifs** avec préfixe Phase (ex: `Phase 5B+: sélecteur multi-modèles`)

### Documentation

Après chaque phase complétée :
1. Mise à jour de `phase-X.md` avec tout ce qui a été fait (code réel, pièges rencontrés, leçons)
2. Mise à jour éventuelle de `plan-apprentissage.md` si décisions architecturales nouvelles
3. Commits propres
4. Bilan en fin de phase

### Ce qu'il faut éviter

- ❌ Présumer du contenu de fichiers sans les lire d'abord
- ❌ Ajouter des références (jurisprudence, articles de loi) sans vérification
- ❌ Sauter la validation à la fin d'une sous-phase
- ❌ Faire `git add -A` aveuglément
- ❌ Mélanger plusieurs sous-phases dans un seul message

## Prochaines étapes envisagées

| Phase | Description | État |
|---|---|---|
| 6 | Sécurité et garde-fous (vérificateur de fuite, AES-256) | Vérificateur de fuite : fait. AES-256 (6D) **reporté** faute de cas d'usage de partage |
| 7 | Canaux alternatifs (Telegram), entrée voix (STT/TTS) | À venir |
| 8 | Déploiement Azure (App Service + PostgreSQL Flexible Server) | À venir |

L'utilisateur réfléchit aussi à un éventuel **pivot vers une verticale profonde** (pousser anonymiseur ou résumeur à un niveau publiable) au lieu de continuer linéairement vers les Phases 7-8. Décision à prendre en discussion.

### Pistes ouvertes héritées de Phase 6

- **Étendre le garde-fou PII au Résumeur** (`/judgment`) — le helper `detectLeaks` est réutilisable tel quel. Le Résumeur envoie systématiquement au cloud sans garde-fou aujourd'hui.
- **Volet AES-256** : conditionné à un vrai cas d'usage de partage entre parties (typiquement à reprendre en Phase 7 avec le canal Telegram, ou si on ajoute une fonction « lien de partage chiffré » d'un résumé/document anonymisé).

## Ressources de référence

- `plan-apprentissage.md` — vision globale et phases planifiées
- `phase-1.md` à `phase-6.md` — exécution détaillée de chaque phase avec code réel et pièges
- `phase-2-concepts.md`, `phase-3-concepts.md` — concepts approfondis (style guide pédagogique)
- `comprendre-shadcn-ui.md` — référence sur shadcn/ui

Bon code.
