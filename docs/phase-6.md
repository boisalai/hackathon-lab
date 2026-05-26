# Phase 6 — Sécurité et garde-fous (version détaillée)

> Document de référence reconstituant l'intégralité de la Phase 6, dans l'ordre réel d'exécution, avec toutes les explications pédagogiques et les pièges rencontrés.

## Pré-requis (état en fin de Phase 5)

- Stack Next.js 16 + TS + Tailwind + shadcn/ui + tRPC + Prisma + PostgreSQL fonctionnelle
- Better Auth (email/password + OAuth GitHub + OAuth Google)
- Vercel AI SDK avec Claude (`@ai-sdk/anthropic`) + provider local (`@ai-sdk/openai-compatible`) opérationnels
- Sidebar shadcn avec 3 verticales actives (Accueil, Résumeur, Anonymiseur)
- Registre central de modèles avec capabilities et `fallbackTo`
- Fallback automatique local → cloud transparent dans l'Anonymiseur
- Mac Apple Silicon + venv MLX + Qwen3-8B-4bit-AWQ chargé

## Objectif de la Phase 6

Construire une couche de **sécurité applicative** qui :

1. Inspecte tout texte sur le point d'être envoyé à un modèle distant (potentiellement) pour détecter des données personnelles sensibles (PII).
2. Permet à l'utilisateur de **décider en connaissance de cause** si elle souhaite poursuivre malgré la détection.
3. Conserve une **trace auditée** des décisions prises (blocages et overrides), consultable par l'utilisateur connecté.

Le volet « chiffrement AES-256 pour communications inter-parties » prévu initialement dans le plan d'apprentissage a été **reporté** faute de cas d'usage concret dans l'app actuelle (cf. 6D).

## Choix de la Phase 6

| Décision | Justification |
|---|---|
| **Vérificateur de fuite avant tout appel modèle distant** | Réutilisable par toutes les verticales. Cas d'usage immédiat : le fallback automatique de l'Anonymiseur (Phase 5D) envoie déjà transparente des données au cloud — il faut un cran d'arrêt avant ce chemin. |
| **Règles regex uniquement** (pas de classification LLM) | Déterministe, testable, rapide, indépendant du serveur local. La détection de noms et organisations reste hors-scope — c'est le rôle de l'Anonymiseur lui-même. |
| **Avertissement + confirmation explicite** (pas blocage strict) | Plus pédagogique, conserve l'utilité du fallback, reflète la pratique réelle (l'utilisateur garde le contrôle). Le système journalise les deux décisions (blocage et override). |
| **Scan systématique** (pas de short-circuit selon le provider) | Politique uniforme et prévisible. Tous les modèles locaux ont un `fallbackTo` cloud — donc tout texte est *potentiellement* exfiltrable même quand le modèle choisi est local. |
| **Panneau inline** plutôt que modal `Dialog` | Pas de nouvelle dépendance shadcn, cohérent avec le pattern banner ambré du fallback (5D). |
| **HTTP 409 Conflict** pour signaler le blocage | C'est un *signal métier* (« j'ai trouvé des données sensibles, à toi de décider »), pas une erreur serveur. Le client le traite comme un état distinct, pas dans le bloc d'erreur. |
| **Persistance Prisma + Prisma direct dans la page** | Pas de routeur tRPC pour 6C : lecture pure, server component, pas de refresh interactif prévu. YAGNI. |
| **Pas d'événement CLEAN** | Un scan qui ne trouve rien ne porte aucune décision. Le journaliser ferait du bruit sans valeur. |
| **Volet AES-256 reporté** | Aucun cas d'usage de partage entre parties dans l'app actuelle. À reprendre éventuellement en Phase 7 avec le canal Telegram. |

## Plan complet de la Phase 6

| Sous-phase | Objectif | État |
|---|---|---|
| 6A | Module pur `lib/leak-detector.ts` + harnais de test | Terminé |
| 6B | Garde-fou dans `app/api/anonymize/route.ts` + UI de confirmation | Terminé |
| 6C | Modèle Prisma `SecurityEvent` + page `/security` + sidebar | Terminé |
| 6D | Chiffrement AES-256 pour communications inter-parties | Reporté |

---

## Sous-phase 6A — Détecteur de fuite côté serveur

### Concepts clés introduits

#### Pourquoi des regex et non un LLM

Tentation : utiliser un petit modèle LLM (Qwen local) pour faire la détection « intelligente » de PII. Trois raisons d'écarter :

1. **Latence** : chaque scan coûterait 1-3 secondes. Le garde-fou doit être instantané pour ne pas dégrader l'UX.
2. **Indéterminisme** : un LLM peut louper un courriel selon le contexte, ou halluciner un faux positif. Une regex est binaire et reproductible.
3. **Dépendance** : le LLM local peut être arrêté. Un garde-fou qui dépend de lui s'effondre quand on en a le plus besoin.

Le détecteur de fuite a une **responsabilité étroite** : identifier des **patterns structurellement reconnaissables**. Tout le reste (noms, organisations, situations contextuelles) est le rôle de l'Anonymiseur lui-même.

#### Algorithme de Luhn

Le NAS canadien et les numéros de carte de crédit utilisent une **somme de contrôle Luhn**. Sans cette validation, n'importe quelle séquence de 9 ou 16 chiffres déclencherait l'alerte → faux positifs massifs (numéros de série, identifiants internes, etc.).

L'algo : partant du chiffre de droite, on alterne `×1` puis `×2`. Pour chaque produit > 9, on soustrait 9 (équivalent à sommer ses chiffres). La somme totale doit être divisible par 10.

```typescript
function isValidLuhn(digits: string): boolean {
  if (digits.length === 0) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}
```

#### Lettres interdites dans un code postal canadien

Postes Canada exclut **D, F, I, O, Q, U** des positions où apparaît une lettre (1re, 3e, 5e), et W/Z de la 1re. Une regex naïve `[A-Z]\d[A-Z]\s\d[A-Z]\d` capterait des chaînes invalides comme « D1F 2I3 ». La regex correcte exclut ces lettres :

```typescript
/\b[A-CEGHJ-NPR-TVXY]\d[A-CEGHJ-NPR-TV-Z][\s-]?\d[A-CEGHJ-NPR-TV-Z]\d\b/gi
```

#### Pattern « module pur + harnais ad hoc »

Pour des règles de détection, écrire un test framework complet est disproportionné. Pattern retenu :

- Module pur (`lib/leak-detector.ts`) — pas d'I/O, pas de dépendance Next, exportable tel quel.
- Harnais ad hoc (`scripts/test-leak-detector.ts`) — un tableau de cas (texte → types attendus) et un parcours simple qui affiche `✓`/`✗`. Lancé via `pnpm dlx tsx`.

Avantages : zéro nouvelle dépendance, lancé en quelques secondes, sortie lisible humaine. Si un jour on veut Vitest, on portera les cas tels quels.

### 6A.1 — Module `lib/leak-detector.ts`

Six types détectés, chacun avec une regex et optionnellement un validateur :

| Type | Regex (résumé) | Validateur | Sévérité |
|---|---|---|---|
| `courriel` | `[\w.+-]+@[a-zA-Z\d-]+(\.[a-zA-Z\d-]+)+` | — | medium |
| `code_postal` | format canadien avec lettres interdites | — | low |
| `telephone` | NANP avec séparateur **obligatoire** | — | medium |
| `carte_credit` | 13-19 chiffres avec séparateurs | Luhn | high |
| `nas` | 9 chiffres avec séparateurs | Luhn | high |
| `ramq` | 4 lettres MAJUSCULES + 8 chiffres | — | high |

Le module exporte :

- `detectLeaks(text: string): Finding[]` — fonction principale.
- `summarize(findings: Finding[]): Partial<Record<LeakType, number>>` — résumé compact pour l'UI.

Types publics :

```typescript
export type LeakType =
  | "nas" | "ramq" | "courriel"
  | "telephone" | "code_postal" | "carte_credit";

export type Finding = {
  type: LeakType;
  span: [number, number]; // [start, end) sur le texte original
  snippet: string;
  severity: "high" | "medium" | "low";
};
```

### 6A.2 — Harnais de test `scripts/test-leak-detector.ts`

14 cas couvrant :

- Cas positifs simples (un type à la fois).
- Cas négatifs (chaînes ressemblantes mais invalides : Luhn invalide, code postal avec lettre Q, téléphone sans séparateur).
- Cas combinés (paragraphe juridique typique avec plusieurs PII).

Lancé via :

```bash
pnpm dlx tsx scripts/test-leak-detector.ts
```

Le harnais sort 14/14 ✓ après les ajustements ci-dessous.

### 6A.3 — Pièges rencontrés

| Piège | Symptôme | Solution |
|---|---|---|
| Regex RAMQ avec flag `/i` | Faux positif sur « avec 4111 1111 » — n'importe quel mot de 4 lettres latines + chiffres matche | Retirer `/i`. La RAMQ apparaît toujours en majuscules dans tout document officiel |
| Regex zéro-largeur potentielle | Risque théorique de boucle infinie quand `lastIndex` ne progresse pas | Garde `if (m[0].length === 0) rule.regex.lastIndex++` |
| `lastIndex` partagé entre invocations | Si on appelle `detectLeaks` deux fois sur deux textes différents, la 2e peut sauter du contenu | `rule.regex.lastIndex = 0` au début de chaque règle |
| Téléphone sans séparateur | `5145551234` (chaîne de 10 chiffres) serait capté | Regex exige **au moins un séparateur** (espace/tiret/point/parenthèses). Décision volontaire — un ID brut ≠ téléphone aux yeux du système |
| Code postal avec lettre interdite | `Q1A 1A1` matche une regex naïve `[A-Z]\d[A-Z]` | Classe `[A-CEGHJ-NPR-TVXY]` qui exclut D/F/I/O/Q/U/W/Z en 1re position |

### 6A.4 — Limites assumées

- **Pas de détection de noms de personnes** : c'est précisément la mission de l'Anonymiseur (qui appelle un LLM).
- **Pas d'adresses civiques génériques** (`1234 rue Saint-Denis`) : seul le code postal est détecté.
- **Pas de NEQ** (numéro d'entreprise du Québec, 10 chiffres) : ajoutable plus tard si besoin.
- **IBAN/SWIFT volontairement exclus** : non-pertinents au Québec, source de faux positifs.

### 6A.5 — Commit

```bash
git commit -m "Phase 6A: détecteur de fuite (PII Québec) + harnais ad hoc"
```

---

## Sous-phase 6B — Garde-fou avant fallback cloud (Anonymiseur)

### Concepts clés introduits

#### HTTP 409 comme signal métier

Choix du code de retour quand le détecteur trouve des PII :

| Code | Sémantique | Adapté ? |
|---|---|---|
| `400 Bad Request` | Entrée mal formée | Non — l'entrée est syntaxiquement valide |
| `403 Forbidden` | Permission insuffisante | Non — c'est l'utilisateur lui-même qui peut autoriser |
| `409 Conflict` | État incompatible avec l'action demandée | **Oui** |
| Custom `2xx` | Succès partiel | Non — on n'a rien fait, pas de succès |

Le `409` traduit : « ta demande est valide en soi, mais elle entre en conflit avec une règle (les PII détectées) — résous le conflit (override) et reviens ». Le client le traite comme un **état distinct**, pas comme une erreur.

```typescript
if (response.status === 409) {
  const json = await response.json();
  setState({ status: "confirm", leaks: json.leaks, summary: json.summary });
  return;
}
// puis seulement après :
if (!response.ok) { /* vraie erreur */ }
```

#### Override déclaratif dans le body

Plutôt qu'un header HTTP custom (genre `X-Override-Pii: true`), on passe `override: true` dans le body JSON. Avantages :

- Visible dans le payload pour debug (`fetch` DevTools le montre clairement).
- Testable au `curl` sans manipulation de headers.
- Validable par Zod comme tout autre champ.

#### Politique uniforme : on scanne toujours

Tentation initiale : ne scanner que si le modèle sélectionné est cloud, pour éviter le bruit UX quand l'utilisateur a choisi le local.

Problème : **tous les modèles locaux du registre ont un `fallbackTo` cloud**. Si le serveur local plante au moment du traitement, les données partent en cloud automatiquement (cf. Phase 5D). Donc même un choix « local » peut finir en exfiltration.

Décision : **on scanne systématiquement**. Coût UX (le dialogue apparaît pour tout texte sensible) compensé par valeur pédagogique (l'utilisateur voit le détecteur agir). Si un jour un modèle local sans `fallbackTo` est ajouté, on pourra introduire un short-circuit.

### 6B.1 — Modification du route handler

`app/api/anonymize/route.ts` : on ajoute le champ `override` au schéma Zod et le scan avant l'appel modèle.

```typescript
const inputSchema = z.object({
  text: z.string().min(50).max(50_000),
  modelId: z.string(),
  override: z.boolean().optional(),
});

// ... après auth et validation ...

if (!parsed.data.override) {
  const leaks = detectLeaks(parsed.data.text);
  if (leaks.length > 0) {
    return new Response(
      JSON.stringify({ blocked: true, leaks, summary: summarize(leaks) }),
      { status: 409, headers: { "Content-Type": "application/json" } }
    );
  }
}
```

L'`abortSignal` du timeout, le `tryWithFallback`, et le reste de la logique restent intacts — le garde-fou est une couche **en amont**.

### 6B.2 — Modification du formulaire client

`components/anonymize/anonymize-form.tsx` :

1. Nouveau status dans la state machine :

```typescript
type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "confirm"; leaks: Finding[]; summary: LeakSummary }
  | { status: "success"; data: AnonymizeResultType; meta?: FallbackMeta }
  | { status: "error"; message: string };
```

2. Refactor de `handleSubmit` en `submit(override: boolean)` pour réutiliser le même appel `fetch` avec ou sans override.

3. Branche de rendu `"confirm"` : carte ambrée avec :
   - Liste des types détectés (`X numéros d'assurance sociale, Y courriels…`)
   - Échantillons (1 snippet par type, tronqué à 30 caractères).
   - Message contextuel selon le provider (« en cas de panne du serveur local, ça basculera vers Anthropic »).
   - Boutons « Retour au formulaire » et « Envoyer quand même ».

Le texte de l'utilisateur est **préservé** entre confirm → cancel → re-submit (le state `text` n'est pas réinitialisé).

### 6B.3 — Pièges rencontrés

| Piège | Symptôme | Solution |
|---|---|---|
| `response.ok === false` traité comme erreur générique | Le 409 tomberait dans le bloc d'erreur, message peu clair | Tester `response.status === 409` **avant** `response.ok` |
| `import type` pour `Finding` | Risque d'importer le module entier côté client | Importer **uniquement le type** via `import type { Finding } from "@/lib/leak-detector"`. Tree-shake garanti |
| Apostrophes ASCII dans le JSX | Erreurs ESLint `react/no-unescaped-entities` | Échapper avec `&apos;` dans les nouveaux textes — les préexistants restent hors périmètre |

### 6B.4 — Commit

```bash
git commit -m "Phase 6B: garde-fou + dialogue de confirmation pour l'Anonymiseur"
```

---

## Sous-phase 6C — Journal des incidents

### Concepts clés introduits

#### Quoi journaliser ?

Trois types d'événements théoriques :

| Type | Décision portée | Journaliser ? |
|---|---|---|
| `CLEAN` (texte propre, aucune PII) | Aucune | Non — bruit sans valeur |
| `BLOCKED` (PII détectées, utilisateur n'a pas confirmé) | Décision implicite de ne pas envoyer | Oui |
| `OVERRIDDEN` (PII détectées, utilisateur a confirmé) | Décision explicite d'envoyer | Oui |

Le journal de sécurité ne sert pas à dénombrer les requêtes — il sert à conserver les **décisions humaines** prises face à un risque.

#### Pourquoi rescanner sur override

Quand l'utilisateur confirme avec `override: true`, on **rescanne** côté serveur pour journaliser ce qu'il a accepté d'envoyer. Coût négligeable (regex pures, < 1 ms), trace plus fidèle.

Trade-off : si le client envoie un texte différent entre la 1re soumission (qui a déclenché le 409) et la 2e (avec override), on journalise l'état final. C'est correct sémantiquement — c'est ce texte-là qui part au modèle.

#### Lecture Prisma directe dans un server component

Pattern jusqu'ici : tRPC pour toute donnée dynamique. Mais un server component peut **aussi** appeler Prisma directement, sans passer par la chaîne tRPC. Trade-offs :

| Approche | Avantage | Inconvénient |
|---|---|---|
| Prisma direct dans le server component | Pas d'hydration, pas de tRPC, moins de plomberie | Pas de cache React Query, pas de refresh interactif facile |
| tRPC `query` côté client | Live refresh, retry, cache | Plomberie additionnelle |

Pour `/security` (lecture pure, pas de refresh prévu), **Prisma direct** est le bon choix. Si une Phase ultérieure veut du refresh live ou des filtres, on extraira en routeur tRPC à ce moment-là (YAGNI).

#### `Json` non typé en DB, validé à la lecture

`summary` et `findings` sont stockés en `Json` côté Prisma (JSONB côté Postgres). Le type côté DB est `unknown`. Deux options à la lecture :

1. Cast `as Partial<Record<LeakType, number>>` — confiance dans la cohérence côté serveur.
2. Parse Zod — robuste contre les anciennes versions du schéma.

Choix retenu : **cast simple** pour 6C. Le serveur est la seule source d'écriture, il écrit selon le format actuel. Si un jour on évolue le format, on ajoutera un Zod parse à la lecture.

### 6C.1 — Schéma Prisma

```prisma
enum SecurityDecision {
  BLOCKED       // garde-fou a bloqué, utilisateur n'a pas confirmé
  OVERRIDDEN    // utilisateur a vu l'avertissement et a confirmé l'envoi
}

model SecurityEvent {
  id        String           @id @default(cuid())
  createdAt DateTime         @default(now())

  userId    String
  user      User             @relation(fields: [userId], references: [id], onDelete: Cascade)

  route     String           // "anonymize", futur "judgment", etc.
  decision  SecurityDecision
  modelId   String

  summary   Json             // Record<LeakType, number>
  findings  Json             // Finding[]

  @@index([userId, createdAt(sort: Desc)])
}
```

Plus relation inverse `securityEvents SecurityEvent[]` dans `model User`.

Migration :

```bash
pnpm prisma migrate dev --name security_events
```

### 6C.2 — Persistance dans le route handler

```typescript
const leaks = detectLeaks(parsed.data.text);
const leakSummary = summarize(leaks);

if (leaks.length > 0 && !parsed.data.override) {
  await prisma.securityEvent.create({
    data: {
      userId: session.user.id,
      route: "anonymize",
      decision: "BLOCKED",
      modelId: parsed.data.modelId,
      summary: leakSummary,
      findings: leaks,
    },
  });
  return new Response(/* 409 ... */);
}

if (leaks.length > 0 && parsed.data.override) {
  await prisma.securityEvent.create({
    data: { /* ... */, decision: "OVERRIDDEN" },
  });
  // pas de return — on poursuit vers l'appel modèle
}
```

### 6C.3 — Page `/security`

Server component avec auth gate, lecture Prisma directe, table HTML/Tailwind.

Affichage :

- Carte d'en-tête avec compteurs `Bloqué` et `Overridé`.
- Tableau des 50 derniers événements, colonnes : Date · Décision · Verticale · Modèle · Détections.
- Badge coloré pour la décision (rouge BLOCKED, ambré OVERRIDDEN).
- Résumé compact des détections (`1 NAS · 1 courriel · 1 code postal`).
- État vide si aucun événement.

Sécurité multi-utilisateur : `where: { userId: session.user.id }` côté serveur — un utilisateur ne voit jamais les événements d'un autre.

### 6C.4 — Item sidebar

`components/nav/app-sidebar.tsx` : ajout d'une entrée « Journal de sécurité » avec l'icône `ShieldCheck` (déjà importée pour l'item Audit qui reste désactivé).

### 6C.5 — Pièges rencontrés

| Piège | Symptôme | Solution |
|---|---|---|
| Client Prisma non régénéré après `migrate dev` | `Property 'securityEvent' does not exist on type 'PrismaClient'` malgré une migration réussie | `pnpm prisma generate` explicite. Bug constaté avec Prisma 7.8 — la régénération auto échoue silencieusement |
| HMR ne prend pas le nouveau client Prisma | TypeScript voit le bon type, mais le serveur dev sert l'ancien | Redémarrer `pnpm dev` après `prisma generate` |
| Pas de composant `table` shadcn installé | — | Table HTML/Tailwind à la main. Suffisant pour 50 lignes |
| Apostrophes ASCII dans le JSX (page security) | Erreur ESLint | `&apos;` dans les chaînes inline |

### 6C.6 — Commit

```bash
git commit -m "Phase 6C: journal d'événements de sécurité (modèle + page + sidebar)"
```

---

## Sous-phase 6D — Chiffrement AES-256 — REPORTÉ

### Justification du report

Le plan d'apprentissage prévoyait initialement : *« middleware tRPC qui (a) chiffre les communications sensibles entre parties »*.

**Bloquant identifié** : l'application n'a aujourd'hui aucun **scénario de partage entre parties**. Chaque utilisateur a ses propres documents et ses propres événements, sans flux inter-utilisateurs. Implémenter AES-256 dans ce contexte produirait de la cryptographie en vitrine, sans cas d'usage à protéger.

### Conditions pour reprendre 6D

Le volet AES-256 redevient pertinent si l'app évolue vers l'un de ces cas :

| Cas d'usage envisageable | Quand |
|---|---|
| Lien de partage chiffré d'un résumé ou document anonymisé entre un avocat et son client | Si on ajoute une fonction « envoyer ce résultat à une autre personne » |
| Canal Telegram chiffré bout-en-bout (Phase 7) | Si on veut que le bot Telegram serve de canal d'échange entre parties |
| Stockage chiffré de notes ou documents particulièrement sensibles (clé dérivée du mot de passe utilisateur) | Si on ajoute une notion de « coffre-fort » |

Pour l'instant, **report assumé** — Phase 6 se ferme avec uniquement le volet vérificateur de fuite.

---

## Bilan de la Phase 6

### Structure finale du projet (extraits pertinents)

```
hackathon-lab/
├── app/
│   ├── api/
│   │   └── anonymize/route.ts          # Garde-fou + persistance (6B + 6C)
│   ├── security/page.tsx               # Journal (6C)
│   └── anonymize/page.tsx              # Inchangé
├── components/
│   ├── anonymize/anonymize-form.tsx    # Panneau de confirmation (6B)
│   └── nav/app-sidebar.tsx             # Item « Journal de sécurité » (6C)
├── lib/
│   └── leak-detector.ts                # Module pur (6A)
├── prisma/
│   ├── schema.prisma                   # Modèle SecurityEvent + enum (6C)
│   └── migrations/
│       └── 20260526151646_security_events/migration.sql
└── scripts/
    └── test-leak-detector.ts           # Harnais ad hoc (6A)
```

### Capacités acquises

- Détection PII par regex avec validations (Luhn, lettres interdites).
- Pattern « module pur + harnais `pnpm dlx tsx` » sans framework de test.
- Garde-fou en amont d'un appel LLM, avec confirmation utilisateur via 409.
- HTTP 409 comme signal métier (distinct des erreurs).
- Override déclaratif dans le body plutôt qu'en header.
- Lecture Prisma directe dans un server component (sans tRPC).
- Persistance JSONB pour findings et résumé.
- Page d'audit privée par utilisateur, sécurité multi-tenant côté serveur.

### Pièges majeurs rencontrés et leçons à retenir

1. **`/i` sur une regex avec ancrage `\b` + lettres latines** — fragilise complètement la spécificité. Toujours réfléchir à ce que le flag rend « équivalent » dans la regex.
2. **Algorithme de Luhn indispensable pour NAS/cartes** — sans validation, faux positifs massifs sur tout identifiant numérique.
3. **`response.ok === false` peut masquer un 409 métier** — toujours tester les codes attendus *avant* de tomber dans le générique.
4. **`prisma migrate dev` ne régénère pas toujours le client en Prisma 7.8** — lancer `prisma generate` explicitement après chaque migration et vérifier `tsc --noEmit`.
5. **HMR ne prend pas le client Prisma régénéré à chaud** — redémarrer `pnpm dev`.
6. **Politique de sécurité uniforme ≠ politique optimale** — scanner systématiquement coûte un peu d'UX mais évite les trous logiques (ex. fallback cloud transparent invisible à une politique conditionnelle).
7. **Pas tout journaliser** — un journal n'a de valeur que s'il porte des **décisions**. Les non-événements diluent le signal.
8. **Préserver le texte utilisateur entre les états** — un panneau de confirmation qui efface la saisie est insupportable. State machine séparée du `text` state.

### Verticales en service à la fin de Phase 6

| Verticale | URL | Garde-fou actif ? |
|---|---|---|
| Gestion de documents | `/` | N/A (pas d'appel LLM) |
| Résumeur de jugement | `/judgment` | Non (cloud direct, sans garde-fou — voir « pistes ouvertes ») |
| Anonymiseur | `/anonymize` | **Oui** (Phase 6B) |
| Journal de sécurité | `/security` | N/A (lecture seule) |

### Pistes ouvertes

- **Étendre le garde-fou au Résumeur** (`/judgment`). Le Résumeur envoie systématiquement au cloud — un garde-fou y serait pertinent. Pas implémenté en Phase 6 pour rester focalisé, mais le helper `detectLeaks` est réutilisable tel quel.
- **Journaliser aussi les requêtes du Résumeur** dans `SecurityEvent` une fois 6B étendu (changer `route: "judgment"`).
- **Ajouter le NEQ** (10 chiffres) au détecteur si on traite des textes corporatifs.
- **Filtrage/pagination dans `/security`** si le journal grossit beaucoup (passer en tRPC à ce moment-là).
- **AES-256** : conditionné à un vrai cas d'usage de partage (cf. 6D).

### Indicateur de progression

À la fin de la Phase 6, l'application :

- Possède une **couche de sécurité applicative** indépendante des verticales LLM.
- Donne à l'utilisateur **la visibilité** et **le contrôle** sur les données sensibles qu'elle envoie aux modèles.
- Conserve un **journal d'audit** privé par utilisateur, consultable à `/security`.
- Compte 3 commits Phase 6 (6A + 6B + 6C).

Prochaine étape envisagée : **Phase 7 — Entrées alternatives** (OCR PDF, bot Telegram, STT/TTS multi-accents) ou **pivot vers verticale profonde** selon la décision de l'apprenant.
