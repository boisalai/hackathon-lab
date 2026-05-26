# Phase 4 — Première verticale IA complète (version détaillée)

> Document de référence reconstituant l'intégralité de la Phase 4, dans l'ordre réel d'exécution, avec toutes les explications pédagogiques et les pièges rencontrés.
>
> **État du document** : squelette en cours d'enrichissement. Les blocs `{{À REMPLIR}}` seront complétés au fur et à mesure de l'exécution.

## Pré-requis (état en fin de Phase 3)

- Stack Next.js 16 + TypeScript + Tailwind + shadcn/ui + tRPC + Prisma 7 + PostgreSQL 18 fonctionnelle
- Better Auth opérationnel : email/password + OAuth GitHub + OAuth Google
- 12 commits Git propres (Phases 1 + 2 + 3)
- Procédures tRPC protégées par `protectedProcedure`
- Isolation des données par propriétaire (chaque utilisateur ne voit que ses documents)

## Choix de la Phase 4

| Décision | Justification |
|---|---|
| **API Claude directe** (plutôt que via Agno ou un autre orchestrateur) | Agno arrive en Phase 5. Ici on veut **un seul** appel modèle, le plus simple possible, pour comprendre la mécanique HTTP/SDK avant d'ajouter des couches. |
| **Cas d'usage : résumeur de jugement** | Tâche bien définie (entrée texte → sortie texte structuré), réaliste pour un étudiant en droit, sans dépendance externe (pas d'OCR, pas de base externe). |
| **Choix de modèle** | {{À REMPLIR — décision entre Haiku 4.5 / Sonnet 4.6 / Opus 4.7 selon test de qualité vs latence vs coût}} |
| **Streaming vs non-streaming** | Premier passage non-streaming pour la simplicité, puis bascule streaming en sous-phase 4E. |
| **SDK officiel `@anthropic-ai/sdk`** vs `fetch` brut | SDK officiel : typage, gestion d'erreurs, retry exponentiel, support du streaming intégré. Pas de raison d'écrire le client à la main. |

## Plan complet de la Phase 4 (six sous-phases)

| Sous-phase | Objectif | Couche |
|---|---|---|
| 4A | Compte Anthropic + clé API + SDK installé | Configuration |
| 4B | Première procédure tRPC qui appelle Claude (non-streaming) | API serveur |
| 4C | Structuration du prompt pour résumé de jugement | Prompt engineering |
| 4D | Page UI dédiée au résumeur | Interface |
| 4E | Streaming de la réponse | API serveur + client |
| 4F | Gestion d'erreurs, timeouts, observabilité | Robustesse |

---

## Sous-phase 4A — Compte Anthropic, clé API, SDK

### Concepts clés introduits

#### Pourquoi une clé API
L'API Claude est un service payant à la consommation. La clé API permet à Anthropic d'authentifier les requêtes et de facturer le bon compte. **Une clé API = un accès facturé à ton nom** — au même titre qu'un secret de session, elle ne doit jamais quitter le serveur.

#### Server-only par construction
La clé API Claude ne doit **jamais** apparaître dans le navigateur. Conséquence d'architecture : tous les appels à Claude passent **obligatoirement** par notre backend tRPC. Le navigateur ne fait que demander à tRPC qui, lui, parle à Claude.

```
[Navigateur] ──tRPC──→ [Notre serveur] ──HTTPS+clé──→ [API Claude]
                            ↑
                            └─ la clé vit ici seulement
```

Si la clé fuite : facture imprévue, possibilité de quota épuisé, voire actions effectuées avec ton identité de développeur.

#### Choix de modèle : trois familles
| Famille | Vitesse | Coût | Quand |
|---|---|---|---|
| Haiku | Le plus rapide | Le moins cher | Tâches simples, beaucoup d'appels |
| Sonnet | Intermédiaire | Intermédiaire | Production générale |
| Opus | Le plus lent | Le plus cher | Raisonnement complexe, qualité maximale |

{{À REMPLIR — choix final + version (ex. `claude-haiku-4-5-20251001`) après test sur 2-3 jugements}}

### 4A.1 — Créer un compte Anthropic

{{À REMPLIR — étapes console.anthropic.com, vérification, ajout de crédits}}

### 4A.2 — Générer une clé API

{{À REMPLIR — interface, nommage de la clé (ex. `hackathon-lab-dev`), copie unique}}

### 4A.3 — Ajouter au `.env`

```
ANTHROPIC_API_KEY="sk-ant-..."
```

> ⚠️ Vérifier que `.env` est bien dans `.gitignore`. Un secret commité doit être considéré compromis et rotaté immédiatement.

### 4A.4 — Installer le SDK officiel

```bash
pnpm add @anthropic-ai/sdk
```

{{À REMPLIR — version installée, warnings éventuels de pnpm}}

### 4A.5 — Commit

```bash
git add -A
git commit -m "Phase 4A: SDK Anthropic installé + clé API configurée"
```

---

## Sous-phase 4B — Premier appel Claude via tRPC

### Concepts clés introduits

#### L'API Messages
L'API Claude expose un endpoint `POST /v1/messages` qui prend :
- Un `model` (identifiant de modèle)
- Un tableau `messages` avec rôles `user` / `assistant`
- Optionnellement un `system` (instructions générales)
- Un `max_tokens` (plafond de la réponse)

Le SDK officiel encapsule tout ça dans `client.messages.create({...})`.

#### Pourquoi une procédure dédiée (pas dans `document.create`)
Le résumé de jugement est une **opération métier distincte** de la création/lecture de documents. Séparer dans un router `judgment` :
- Évite de mêler la logique CRUD et la logique IA
- Permet d'appliquer des politiques différentes (rate limiting, quotas IA par utilisateur, etc.)
- Reste extensible quand on ajoutera l'anonymiseur, le détecteur, etc. en Phase 5

#### `mutation` plutôt que `query`
Même si appeler Claude « lit » une réponse, c'est une **mutation tRPC** :
- A des effets de bord facturables (consommation de tokens)
- Ne doit pas être mise en cache automatiquement par React Query
- Ne doit pas être ré-exécutée silencieusement sur focus de fenêtre

### 4B.1 — Créer le client Anthropic singleton

`lib/anthropic.ts` :

```typescript
import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});
```

{{À REMPLIR — vérifier si le SDK actuel utilise bien ce nom d'import et cette API}}

### 4B.2 — Créer le router `judgment`

`server/trpc/routers/judgment.ts` :

```typescript
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc/init";
import { anthropic } from "@/lib/anthropic";

export const judgmentRouter = createTRPCRouter({
  summarize: protectedProcedure
    .input(z.object({
      text: z.string().min(50).max({{À REMPLIR — limite ex. 50_000}}),
    }))
    .mutation(async ({ input }) => {
      const response = await anthropic.messages.create({
        model: "{{À REMPLIR — claude-haiku-4-5-20251001 ou autre}}",
        max_tokens: 1024,
        messages: [
          { role: "user", content: input.text },
        ],
      });

      // Extraction du texte de la réponse
      const textBlock = response.content.find((b) => b.type === "text");
      return { summary: textBlock?.text ?? "" };
    }),
});
```

### 4B.3 — Brancher dans le router racine

`server/trpc/root.ts` :

```typescript
import { judgmentRouter } from "@/server/trpc/routers/judgment";

export const appRouter = createTRPCRouter({
  document: documentRouter,
  judgment: judgmentRouter,
});
```

### 4B.4 — Test avec curl ou Postman

{{À REMPLIR — exemple de payload, exemple de réponse, temps de réponse mesuré}}

### 4B.5 — Pièges anticipés

- **Cookie de session requis** : la procédure est `protectedProcedure`, donc curl doit envoyer le cookie d'auth. Plus simple : se connecter dans le navigateur puis copier le cookie.
- **`max_tokens` trop bas** → réponse tronquée. Trop haut → facture potentielle plus salée.
- **Type narrowing sur `content`** : la réponse contient un tableau de blocs (text, tool_use, etc.). Toujours vérifier le `type` avant d'accéder.

{{À REMPLIR — pièges réels rencontrés}}

### 4B.6 — Commit

```bash
git add -A
git commit -m "Phase 4B: première procédure tRPC qui appelle Claude (non-streaming)"
```

---

## Sous-phase 4C — Structuration du prompt

### Concepts clés introduits

#### Le `system` prompt
Le paramètre `system` de l'API Messages donne à Claude des **instructions persistantes** indépendantes du message utilisateur. C'est là qu'on définit :
- Le rôle (« tu es un assistant qui résume des jugements québécois »)
- Le format de sortie attendu
- Les contraintes (langue, ton, longueur)

Avantage sur le fait de tout mettre dans le `user` message : séparation propre **instructions vs contenu**, plus facile à itérer.

#### Anatomie d'un jugement québécois
Pour un résumé pertinent, le prompt doit guider Claude vers les **éléments structurels** d'un jugement :
- Identification (tribunal, parties, date, juge)
- Faits pertinents
- Question(s) en litige
- Droit applicable (articles cités, jurisprudence)
- Analyse
- Dispositif

{{À REMPLIR — adaptations spécifiques selon le type de jugement utilisé pour les tests}}

#### Format de sortie : prose vs structuré
| Option | Avantage | Inconvénient |
|---|---|---|
| Markdown libre | Lisible humainement, flexible | Difficile à parser programmatiquement |
| JSON structuré | Parsable, typable côté tRPC | Plus rigide, Claude peut hallucider le schéma |
| Markdown avec sections fixes | Compromis | Demande une discipline dans le prompt |

{{À REMPLIR — choix retenu après itération}}

### 4C.1 — Premier prompt système

{{À REMPLIR — v1 du system prompt}}

### 4C.2 — Tester sur 2-3 jugements de référence

{{À REMPLIR — jugements utilisés (citations CanLII), résultats observés, qualité ressentie}}

### 4C.3 — Itérations du prompt

{{À REMPLIR — modifications faites, raisons, version finale}}

### 4C.4 — Commit

```bash
git add -A
git commit -m "Phase 4C: prompt système pour résumé de jugement (vX)"
```

---

## Sous-phase 4D — Page UI dédiée

### Concepts clés introduits

#### Une route Next.js par fonctionnalité IA
Phase 4 introduit une nouvelle route `/judgment` (ou `/resume`) dédiée. Pourquoi pas l'accueil :
- L'accueil reste centré sur la gestion de documents (Phase 2)
- Chaque verticale IA aura sa propre page (Phase 5 ajoutera `/anonymize`, etc.)
- Permet de protéger ou non chaque route indépendamment

#### États UI à gérer
| État | Affichage |
|---|---|
| `idle` | Textarea + bouton « Résumer » |
| `loading` | Bouton désactivé + indicateur |
| `success` | Résumé affiché (markdown rendu) |
| `error` | Message d'erreur compréhensible |

#### Rendu Markdown côté client
Le résumé revient probablement en markdown. Pour l'afficher proprement :
- `react-markdown` : bibliothèque la plus utilisée
- Configuration plugins (`remark-gfm` pour tables, listes, etc.)

{{À REMPLIR — choix final et version}}

### 4D.1 — Créer la page

{{À REMPLIR — `app/judgment/page.tsx` + code}}

### 4D.2 — Mutation tRPC côté client

{{À REMPLIR — pattern useMutation, gestion d'état}}

### 4D.3 — Rendu du résultat

{{À REMPLIR — react-markdown ou alternative}}

### 4D.4 — Ajouter un lien dans `AuthHeader`

{{À REMPLIR — modification de la barre supérieure}}

### 4D.5 — Tester de bout en bout

{{À REMPLIR — observations}}

### 4D.6 — Commit

```bash
git add -A
git commit -m "Phase 4D: page UI de résumé de jugement"
```

---

## Sous-phase 4E — Streaming

### Concepts clés introduits

#### Pourquoi le streaming change tout perceptuellement
Un résumé de jugement peut prendre 5 à 30 secondes selon la longueur. **Sans streaming** : utilisateur regarde un spinner pendant tout ce temps. **Avec streaming** : le texte commence à apparaître après ~500 ms, l'utilisateur lit pendant que ça se génère. Même latence totale, **expérience radicalement différente**.

#### Server-Sent Events (SSE) vs WebSockets
| Technologie | Direction | Quand |
|---|---|---|
| SSE | Serveur → client (unidirectionnel) | Streaming de texte généré |
| WebSocket | Bidirectionnel | Chat interactif, jeu, collaboration temps réel |

Pour du streaming de réponse IA : SSE est le standard.

#### Le défi tRPC + streaming
tRPC est conçu pour des requêtes/réponses atomiques. Trois approches possibles :
1. **`httpSubscriptionLink` de tRPC** : tRPC supporte les subscriptions via SSE depuis v11
2. **Route Next.js custom** (bypass tRPC) qui renvoie un `ReadableStream`
3. **`@trpc/server/observable`** pour exposer un flux via tRPC

{{À REMPLIR — approche retenue + justification}}

### 4E.1 — Adapter la procédure côté serveur

{{À REMPLIR — code de la version streaming}}

### 4E.2 — Adapter le client

{{À REMPLIR — consommation du flux}}

### 4E.3 — Affichage progressif

{{À REMPLIR — UI qui se met à jour token par token}}

### 4E.4 — Pièges du streaming

{{À REMPLIR — typiquement : déconnexions, gestion d'erreurs en cours de flux, reconnaissance de fin de stream}}

### 4E.5 — Commit

```bash
git add -A
git commit -m "Phase 4E: streaming de la réponse Claude"
```

---

## Sous-phase 4F — Robustesse

### Concepts clés introduits

#### Types d'erreurs API Claude à gérer
| Erreur | Code | Action |
|---|---|---|
| Rate limit | 429 | Retry exponentiel (le SDK le fait, à vérifier) |
| Overloaded | 529 | Retry avec backoff |
| Authentication | 401 | Erreur de config — ne pas retry |
| Bad request | 400 | Bug côté code — surfacer à l'utilisateur dev, message générique à l'utilisateur final |
| Timeout | — | Fixer un timeout maximal côté serveur |

{{À REMPLIR — vérifier la liste exhaustive dans la doc}}

#### Compteur de tokens et coût
Chaque réponse contient `usage.input_tokens` et `usage.output_tokens`. Logger ces valeurs permet :
- D'estimer le coût (mémoriser le tarif par MTok)
- De détecter les régressions (un prompt qui double soudain en taille)
- De facturer correctement si on rebrand un jour

#### Cap sur la taille d'input
Un utilisateur peut coller un PDF entier (50 000+ caractères). Tarif × volume = surprise. Cap à appliquer :
- **Limite Zod** côté serveur : `z.string().max(N)` rejette avant l'appel
- **Compteur de caractères** côté client : feedback visuel
- **Optionnel** : utiliser `count_tokens` endpoint de Claude pour précision (mais ajoute un appel)

### 4F.1 — Try/catch typé

{{À REMPLIR — `Anthropic.APIError` et ses sous-classes}}

### 4F.2 — Logger l'usage

{{À REMPLIR — où on log (console serveur ? table Postgres ?)}}

### 4F.3 — Limite côté input

{{À REMPLIR — valeur retenue + raison}}

### 4F.4 — Commit

```bash
git add -A
git commit -m "Phase 4F: gestion d'erreurs, timeouts, compteur de tokens"
```

---

## Bilan de la Phase 4

### Structure finale du projet (extraits pertinents)

```
hackathon-lab/
├── app/
│   ├── judgment/
│   │   └── page.tsx                  # Page résumé (4D)
│   └── ...
├── lib/
│   ├── anthropic.ts                  # Singleton SDK (4B)
│   └── ...
└── server/
    └── trpc/
        └── routers/
            ├── document.ts           # Phase 2 + 3
            └── judgment.ts           # 4B → 4F
```

### Variables d'environnement (`.env`)

```
DATABASE_URL="..."
BETTER_AUTH_SECRET="..."
BETTER_AUTH_URL="http://localhost:3000"
GITHUB_CLIENT_ID="..."
GITHUB_CLIENT_SECRET="..."
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
ANTHROPIC_API_KEY="sk-ant-..."        # ← nouveau Phase 4
```

### Capacités acquises

- Premier appel à un modèle distant depuis tRPC ✓
- Prompt système structuré pour un domaine spécifique (droit québécois) ✓
- Streaming de la réponse vers le navigateur ✓
- Gestion d'erreurs typées et observabilité minimale ✓
- Page UI dédiée à une verticale IA ✓

### Pièges majeurs rencontrés et leçons à retenir

{{À REMPLIR au fur et à mesure}}

### Commandes utiles à retenir

{{À REMPLIR}}

### Indicateur de progression

À la fin de la Phase 4, l'application :
- Permet à un utilisateur connecté de coller un jugement et d'obtenir un résumé structuré
- Streame la réponse pour une expérience fluide
- Compte {{N}} commits Git propres
- Est prête pour la Phase 5 (orchestration multi-modèles)

Prochaine étape : **Phase 5 — Orchestration multi-modèles**.
