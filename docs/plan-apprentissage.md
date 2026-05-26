# Plan d'apprentissage — Préparation au hackathon AI × Law

## Objectif

Devenir **fluide** dans un stack complet de développement d'applications juridiques assistées par IA, afin de pouvoir contribuer efficacement à un hackathon de quelques heures (type *Montreal AI x Law Hackathon*).

**Ce n'est pas un projet de produit.** C'est un parcours d'apprentissage structuré. Le code produit est un sous-produit ; le vrai livrable, c'est ma maîtrise du stack.

## Principe directeur

Une **seule application bac à sable** dans laquelle j'ajoute une fonctionnalité juridique par technologie apprise. Cette approche minimise la plomberie réapprise (auth, base de données, déploiement) et maximise le temps passé sur la nouveauté.

## Stack cible

| Couche | Technologie |
|---|---|
| Hébergement | Azure (App Service + PostgreSQL Flexible Server) |
| Langage | TypeScript |
| Frontend | Next.js, Tailwind CSS, shadcn/ui |
| Backend typé | tRPC, Prisma |
| Base de données | PostgreSQL |
| Auth | Better Auth (validé en Phase 3) |
| SDK IA | Vercel AI SDK (`ai`) — fonctions unifiées `generateText` / `streamText` / `Output.object` |
| Orchestration IA | Orchestration TypeScript native via Vercel AI SDK (initialement prévu : Agno — abandonné en Phase 4 au profit d'un orchestrateur en TS) |
| Provider Anthropic | `@ai-sdk/anthropic` — appels à Claude depuis Node.js |
| Modèle « lourd » (cloud) | API Claude (Anthropic) — prompts complexes |
| Provider local | `@ai-sdk/openai-compatible` — consomme un serveur OpenAI-compatible local |
| Modèle « moyen » (local) | Qwen3.6-27B-4bit servi via Ollama, LM Studio, ou serveur MLX |
| Modèle « léger » (local) | Qwen3-8B servi de la même façon |
| OCR | Modèle OCR pour PDF (à choisir) |
| Sécurité | AES-256 pour communications inter-parties |
| Garde-fou | Vérificateur automatisé de fuite (inspection avant envoi) |
| Canal alternatif | Bot Telegram |
| Voix | STT + TTS multi-accents (anglais, français, dont français canadien) |

## Philosophie d'apprentissage

1. **Distinguer les couches structurelles des couches additives.** Auth, tRPC, Prisma façonnent l'architecture — ils viennent tôt. Telegram, voix, OCR s'ajoutent sans refactorer — ils viennent tard.
2. **Traverser le stack au moins une fois tôt.** Mieux vaut une fonctionnalité complète (UI → tRPC → Prisma → Claude → réponse) qu'un apprentissage isolé de chaque techno.
3. **Concevoir l'orchestration IA d'un bloc.** Le routage multi-modèles, le chiffrement et le vérificateur de fuite forment une couche cohérente, pas une accumulation. Implémentation en TypeScript natif via Vercel AI SDK (décision arrêtée en Phase 4).
4. **Tenir un journal des apprentissages.** Les pièges rencontrés valent plus que le code produit.

## Phases du parcours

### Phase 1 — Fondations frontend
**Technos** : Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui
**Livrable** : page d'accueil + formulaire texte rendant une réponse statique
**Apprentissage visé** : structure d'un projet Next.js moderne, composants shadcn, conventions Tailwind

### Phase 2 — Backend typé bout-en-bout
**Technos** : tRPC, Prisma, PostgreSQL (local d'abord)
**Livrable** : créer / lister / supprimer des « documents » (titre + texte brut)
**Apprentissage visé** : typage partagé client/serveur, migrations Prisma, requêtes typées

### Phase 3 — Authentification
**Technos** : Better Auth (premier essai), Clerk et Auth.js en comparaison rapide
**Livrable** : espace privé par utilisateur, documents rattachés à un compte
**Apprentissage visé** : sessions côté serveur, middleware tRPC protégé, modèle utilisateur dans Prisma

### Phase 4 — Première verticale IA complète
**Technos** : API Claude via Vercel AI SDK (`ai` + `@ai-sdk/anthropic`), sortie structurée typée (`Output.object` + Zod), streaming via route handler natif Next.js + hook `useObject` (`@ai-sdk/react`)
**Livrable** : **résumeur de jugement** — coller un texte de jugement, obtenir un résumé structuré au format CanLII (8 sections, références aux paragraphes)
**Apprentissage visé** : appel modèle distant, sortie structurée Zod, streaming SSE, prompt engineering juridique, observabilité (tokens / `finishReason`), timeout via `AbortController`

> **Pattern architectural identifié** : tRPC + streaming + sortie structurée se combinent mal. Décision : `summarize` bypass tRPC avec un route handler natif. Pattern à réutiliser pour les autres verticales IA streaming.

> **Jalon important** : à la fin de cette phase, l'application fait déjà quelque chose d'utile de bout en bout. Tout ce qui suit est enrichissement.

### Phase 5 — Orchestration multi-modèles
**Technos** :
- Orchestration en TypeScript natif via Vercel AI SDK
- `@ai-sdk/openai-compatible` pour consommer un serveur local exposant l'API OpenAI (Ollama, LM Studio, MLX server)
- Modèles : Qwen3.6-27B-4bit (moyen) et Qwen3-8B (léger) servis localement, Claude (lourd) via `@ai-sdk/anthropic`

**Livrable** :
- **anonymiseur de texte** (Qwen léger en local — rapide, faible coût)
- **détecteur de jurisprudences contradictoires** (Claude, prompt complexe)
- routage automatique simple → moyen → complexe (logique TS, pas de framework)

**Apprentissage visé** : architecture multi-providers via une seule API unifiée, choix de modèle selon la tâche, fallback, coût vs latence vs qualité, démarrage et gestion d'un serveur LLM local

> **Note** : initialement prévu avec Agno (framework Python). Abandonné en Phase 4 au profit du Vercel AI SDK qui couvre tous les besoins en TypeScript natif sans service Python séparé.

### Phase 6 — Sécurité et garde-fous
**Technos** : AES-256, vérificateur de fuite programmatique
**Livrable** : middleware tRPC qui (a) chiffre les communications sensibles entre parties, (b) inspecte tout message sortant vers un modèle distant pour détecter des informations confidentielles ayant pu migrer entre contextes
**Apprentissage visé** : cryptographie appliquée côté serveur, classification de contenu sensible, conception de garde-fous

### Phase 7 — Entrées alternatives
**Technos** : OCR PDF, bot Telegram, STT/TTS multi-accents
**Livrable** : envoyer un PDF de jugement par Telegram → recevoir un résumé vocal avec accent français canadien
**Apprentissage visé** : intégration de canaux multiples, traitement multimédia, gestion de fichiers binaires

### Phase 8 — Déploiement Azure
**Technos** : Azure App Service, Azure Database for PostgreSQL Flexible Server, déploiement continu depuis GitHub
**Livrable** : application accessible publiquement, mise à jour automatique sur push
**Apprentissage visé** : configuration cloud, variables d'environnement, secrets, surveillance

## Idées de fonctionnalités juridiques (réservoir)

À piger selon la phase, sans ordre particulier :

- Résumeur de jugement
- Anonymiseur de texte (parties, témoins, lieux)
- Détecteur de jurisprudences contradictoires
- Extracteur de citations légales (articles du *Code civil du Québec*, *Loi sur la protection du consommateur*, etc.)
- Comparateur de versions d'un contrat
- Reformulateur en langage clair pour client non-juriste
- Générateur de questions d'examen à partir de notes de cours
- Vérificateur de cohérence entre la table des matières et les *headings* d'un mémoire
- Convertisseur PDF scanné → markdown structuré
- Bot Telegram « consultation rapide » sur un corpus de notes de cours

## Pratiques transverses

### Journal des apprentissages
Fichier `apprentissages.md` à la racine du dépôt. Une entrée par technologie : pièges rencontrés, ressources utiles, raccourcis découverts. C'est **ce document** qui me servira le jour du hackathon, davantage que le code lui-même.

### Branche `hackathon-starter`
Branche Git stable contenant uniquement :
- Next.js + TS + Tailwind + shadcn/ui
- tRPC + Prisma + PostgreSQL
- Better Auth configuré (email/password + OAuth GitHub + OAuth Google)
- Vercel AI SDK avec un appel Claude fonctionnel — **une procédure tRPC** non-streaming pour les cas simples, **un route handler natif** pour les cas streaming (pattern bypass tRPC identifié en Phase 4)
- Schéma Zod partagé serveur/client avec utilitaire `DeepPartial` pour rendus partial-aware
- Déploiement Azure prêt

C'est cette branche que je **forkerai** le jour J, pas l'application bac à sable complète.

### Discipline d'engagement
Ne pas passer à la phase suivante tant que :
- la fonctionnalité de la phase fonctionne de bout en bout ;
- l'entrée correspondante dans `apprentissages.md` est rédigée ;
- le code est commité avec un message descriptif.

## Hors périmètre

- Qualité juridique des réponses produites (le but est technique, pas substantif)
- Conformité à la *Loi 25* ou autres exigences réelles de protection des renseignements personnels — à ne pas confondre avec un produit destiné à des justiciables réels
- Tests automatisés exhaustifs (un *smoke test* par phase suffit)
- Optimisation des coûts API en phase d'apprentissage

## Indicateur de réussite

Pouvoir, en moins de **deux heures** au début d'un hackathon, déployer un *starter* fonctionnel sur Azure avec authentification, base de données, appel Claude et orchestration multi-modèles (locale + cloud via Vercel AI SDK) — puis consacrer le reste du temps à la spécificité du défi posé.
