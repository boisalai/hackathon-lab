# Plan 12 mois — verticale notariale immobilière

> Plan macro de juin 2026 à mai 2027 pour le projet `hackathon-lab`. Document vivant, à réviser au moins à M6 et à M9.

---

## 1. But visé

Construire, en 12 mois, **un outil défendable en démo devant un notaire** dans le domaine du droit immobilier québécois, tout en apprenant en parallèle :

- les fondations techniques modernes (multi-agent, RAG, evals, MCP, document workflows, déploiement cloud)
- le droit immobilier québécois en profondeur (publicité des droits, immatriculation, hypothèques, certificats de localisation, examen de titres)

**Cible carrière** : être prêt à candidater pour un emploi d'été 2027 en cabinet de notaires immobilier, avec une démo concrète en main au moment des entrevues (probablement entre janvier et mars 2027).

**Cible portfolio** : un seul outil cohérent et fini, déployé publiquement, pas quatre prototypes orphelins.

---

## 2. Stratégie

### Principes directeurs

- **Une verticale à la fois**, toutes dans le même monorepo `hackathon-lab/`
- **Trois verticales d'apprentissage (T1-T3) + une verticale de portfolio (T4)** où l'on pousse la gagnante au niveau publiable
- **Complexité progressive** : 2 agents → multimodal → 4-6 agents en pipeline → orchestration complète. Pas de course au nombre d'agents — ce qui compte, c'est la qualité des patterns (grounding, gates, evals, MCP).
- **Patterns Lavern/Mike intégrés quand ils résolvent un problème réel**, pas en avance
- **9 mois utiles sur 12** comme hypothèse de calibration (école, vacances, ralentissements)

### Posture intellectuelle

Le système ne se positionne **jamais comme un oracle juridique**. Il est un assistant de praticien :

- Ne jamais inventer une jurisprudence ou un article
- Toujours pointer vers une source vérifiable, présente dans la base locale
- Laisser le juriste (étudiant, stagiaire, notaire) trancher

Cette posture est exactement ce qu'un cabinet de notaires recherche chez un stagiaire et colle aux préférences strictes du projet (aucune référence ajoutée de mémoire, toujours vérifier le texte officiel).

---

## 3. Inspirations : Lavern et Mike

Les deux projets de référence ont été audités (voir notes de discussion). Ce qu'on en garde :

### De Lavern (`~/code/lavern`)

| Pattern | Quand l'introduire | Pourquoi |
| --- | --- | --- |
| Protocole de débat à 2+ agents avec citation obligatoire | T1 | Le contradictoire est la forme naturelle de plusieurs analyses juridiques |
| Grounding verifier mécanique (zéro LLM, regex) | T1, transversal ensuite | Anti-hallucination déterministe, prolonge `leak-detector.ts` |
| FTS5 / BM25 sur SQLite plutôt qu'embeddings | T2, module knowledge base | Suffisant pour 50-200 documents, déploiement trivial |
| Pipeline d'évaluations (`evals/`) | T2 puis T4 | Discipline de mesure objective de qualité |
| MCP (Model Context Protocol) pour exposer outils aux agents | T4 | Pattern d'orchestration moderne, exposition propre |
| Gates humains comme événements *first-class* auditables | T3 | Adapté au domaine notarial (validations obligatoires) |
| Session state factory pattern | T4 si pertinent | Isolation multi-session pour audit |
| Precedent board (mémoire inter-documents) | T4 | Utile si on accumule des analyses récurrentes |

### De Mike (`~/code/mike`)

| Pattern | Quand l'introduire | Pourquoi |
| --- | --- | --- |
| Tiptap + export DOCX + tracked changes (`docxTrackedChanges.ts`) | T3 | Cœur de la rédaction d'actes notariés |
| Workflows templates précompilés | T3 | Modèles d'actes versionnés |
| Abstraction multi-LLM normalisée | Optionnel (Vercel AI SDK le fait déjà) | À consulter pour compréhension |
| Tabular review (grille structurée document × critères) | T1 et T2 | Format de sortie d'examen utile |
| Chiffrement AES-GCM des clés API par utilisateur | Reporté (Phase 6D) | Quand on aura un cas d'usage multi-utilisateur |

### Ce qu'on ne reprend pas

- **67 agents de Lavern** : excessif, l'auteur lui-même le reconnaît. On vise 4-6 agents bien orchestrés.
- **Approche RAG-moins de Mike** : on veut un vrai retrieval pour la jurisprudence transversale.
- **AGPL-3.0 de Mike** : on garde notre licence propre.

---

## 4. Contrainte d'accès aux sources

**Constat** : Registre foncier du Québec, CanLII, CAIJ et SOQUIJ n'offrent pas d'accès automatisé exploitable pour un projet personnel (sites protégés contre les robots, API payantes institutionnelles).

**Conséquence acceptée** : toute alimentation du corpus se fait **manuellement** par l'utilisateur (copier-coller, drag-drop PDF).

**Avantage caché** : chaque document ingéré est lu par l'étudiant. Un corpus curé de 50-100 décisions est plus précieux, pour apprendre, qu'un scrape de 5000. Cohérent avec la posture du système (assistant de praticien, pas oracle).

**À vérifier en début de projet** : l'API officielle CanLII (https://www.canlii.org/en/info/api.html), payante mais peu coûteuse, et les arrangements institutionnels possibles avec la bibliothèque de droit de l'Université Laval.

---

## 5. Plan par trimestre

### Vue d'ensemble

| Trimestre | Période | Verticale | Rôle |
| --- | --- | --- | --- |
| T1 | M1-M3 · juin-août 2026 | Analyseur d'extrait du Registre foncier | Apprendre le débat 2 agents + grounding |
| T2 | M4-M6 · sept-nov 2026 | Vérificateur de certificat de localisation | Apprendre le retrieval + vision + evals |
| T3 | M7-M9 · déc 2026-fév 2027 | Rédaction d'acte de prêt hypothécaire | Apprendre les workflows multi-étapes, livrable d'entrevue |
| T4 | M10-M12 · mars-mai 2027 | Pousser la gagnante au niveau publiable | Déploiement, evals élargis, validation par un notaire |

### T1 (M1-M3) — Analyseur d'extrait du Registre foncier · 2 agents

**Pourquoi** : l'examen d'un extrait du Registre foncier oppose naturellement deux thèses — *titre clair* vs *défaut détecté* — ce qui colle parfaitement à un premier protocole de débat à 2 agents.

**Tech**

- Premier protocole de débat (Lavern light) : agent « titre clair » vs agent « défaut détecté », citation obligatoire des inscriptions
- Grounding verifier mécanique étendu à partir de `leak-detector.ts`
- Tabular review (Mike) : grille *inscription × type × impact sur la mutabilité*
- Input : copier-coller manuel d'un extrait textuel

**Droit québécois appris**

- C.c.Q. art. 2934 et suivants (publicité des droits)
- Immatriculation, index aux immeubles, registre des droits personnels et réels mobiliers
- Types d'inscriptions : vente, hypothèque, servitude, radiation, préavis d'exercice, etc.
- Priorité et opposabilité
- Notions de saisine, prescription acquisitive

**Cible mesurable** : sur 5 extraits fictifs construits à la main, identification correcte du statut du titre dans 4 cas sur 5.

**Livrable** : route `/title` accessible depuis la sidebar.

### T2 (M4-M6) — Vérificateur de certificat de localisation · 1 agent + vision + retrieval

**Pourquoi** : le certificat de localisation est *la* pièce que tout stagiaire en notariat immobilier doit examiner. Il oblige à introduire la vision multimodale et le retrieval, au bon moment dans la progression.

**Tech**

- Claude vision (multimodal) pour analyser le PDF + annotations graphiques
- Premier vrai pipeline de retrieval : FTS5 sur le corpus knowledge base (voir section 6)
- Pipeline d'évaluations (Lavern `evals/`) : 20 paires question/réponse étalon construites à partir du corpus curé
- Citation verifier : chaque jurisprudence ou article cité doit pointer vers un document existant dans la base

**Droit québécois appris**

- Cadastre du Québec, lots, désignations
- Servitudes (apparentes, occultes, conventionnelles, légales)
- Mitoyenneté, empiètement, droits de vue
- Dérogations mineures, certificats de localisation à jour, normes de l'Ordre des arpenteurs-géomètres
- Distinction entre certificat de localisation et opinion sur la localisation

**Cible mesurable** : sur 3 certificats fictifs, repérage correct des problèmes principaux (empiètement, servitude non mentionnée, dérogation).

**Livrable** : route `/certificate`.

### T3 (M7-M9) — Assistant de rédaction d'acte de prêt hypothécaire · 4-6 agents

**Pourquoi** : c'est l'objet roi du notariat immobilier, l'acte le plus volumineux et le plus standardisé. Un assistant qui aide à le rédiger est précieux en cabinet. **C'est le livrable qui doit être prêt avant les entrevues d'emploi d'été.**

**Tech**

- Tiptap + export DOCX + tracked changes (le gros morceau de Mike)
- Premier vrai pipeline multi-agent : *planner → drafter → citer C.c.Q. art. 2660+ → reviewer → finalizer*
- Gates humains entre étapes (Lavern) : validation explicite avant l'étape suivante
- Templates d'actes versionnés (workflows de Mike)
- Intégration du verifier de citation issu de T2

**Droit québécois appris**

- C.c.Q. Livre 6, titre 3 (hypothèques) — art. 2660 à 2802
- Hypothèque conventionnelle, immobilière, mobilière
- Rang, priorité, recours hypothécaires
- Formalités d'inscription
- Loi sur le notariat, force probante de l'acte authentique

**Cible mesurable** : génération d'un projet d'acte de prêt hypothécaire conforme, idéalement relu et validé par un notaire du réseau Laval.

**Livrable** : route `/hypothec`.

### T4 (M10-M12) — Pousser la gagnante au niveau publiable

**Le changement clé par rapport à un plan naïf** : à M9, choix de la verticale qui a le mieux marché (probablement T3 vu la cible carrière). Pas de quatrième projet neuf — on finit ce qui existe.

**Décision à M9** sur la base de :

- laquelle a la plus belle démo pour l'entrevue
- laquelle reflète le mieux ce que je veux pratiquer
- laquelle a le meilleur potentiel d'intégration avec les deux autres

**Tech à finir d'apprendre**

- Migration vers **MCP** pour exposer les outils aux agents (Lavern)
- **Precedent board** : mémoire inter-documents si pertinent
- **Evals élargis** : passer de 20 à 100+ cas étalon, suivi des régressions
- **Gates humains comme événements auditables** (déjà préparé en T3)
- **Déploiement réel** : Azure (Phase 8 originale), domaine public, disclaimer juridique conforme
- **Canal alternatif optionnel** : Telegram ou voix (Phase 7 originale), seulement si pertinent à la démo

**Critères de réussite à 12 mois**

- L'outil tient devant un notaire pendant une démo de 10 minutes sans dérapage
- Je peux expliquer chaque choix technique (pourquoi MCP, pourquoi FTS5, pourquoi grounding mécanique)
- Je peux expliquer chaque choix juridique (pourquoi cet article, pourquoi cette décision)
- Le code est public, documenté, accompagné d'un disclaimer juridique propre

---

## 6. Module transversal : Knowledge base locale

À introduire vers M4-M5, en parallèle de T2.

**Fonctionnement**

- Drag-drop d'un PDF de CanLII, d'une décision SOQUIJ téléchargée manuellement, ou d'un extrait de doctrine
- Extraction automatique : référence neutre, parties, date, articles cités, *ratio* présumé, sommaire
- Stockage SQLite + FTS5 (le pari Lavern)
- Les agents des verticales T1, T2, T3 cherchent **uniquement dans cette base** quand ils citent
- Le grounding verifier vérifie que les citations existent dans cette base — pas d'invention possible

**Objectif à 12 mois** : 80-150 décisions et extraits, chacun lu et balisé personnellement. C'est un objet portfolio en soi.

---

## 7. Posture du système (résumé)

Pour tous les agents, dans tous les prompts :

- **Tu n'es pas un oracle juridique**
- **Tu ne cites que ce qui se trouve dans la base locale**
- **Si tu n'as pas de source, tu le dis explicitement**
- **Tu signales toujours au juriste que la décision finale lui appartient**
- **Tu ne génères pas de clauses substantielles sans avertissement clair de validation requise**

---

## 8. Critères de succès à 12 mois

**Tech maîtrisée**

- Multi-agent orchestration (de 2 à 6+)
- RAG avec FTS5 et vérification de citation
- Evals comme discipline (20 → 100 paires étalon)
- MCP en production
- Document workflows (Tiptap + DOCX + tracked changes)
- Gates humains audités
- Déploiement cloud (Azure App Service + PostgreSQL Flexible Server)
- Sécurité PII (déjà en place depuis Phase 6)

**Droit québécois maîtrisé**

- Publicité des droits (C.c.Q. Livre 9) — T1
- Cadastre, servitudes, arpentage notarial — T2
- Hypothèques (C.c.Q. Livre 6, titre 3) — T3
- Recherche jurisprudentielle rigoureuse, hiérarchie des tribunaux, citation neutre — transversal
- Posture notariale (authenticité, force probante, devoir de conseil) — implicite à toutes les verticales

**Livrable concret**

- Un outil unifié déployé publiquement, démo prête en 10 minutes, validé par un notaire.

---

## 9. Garde-fous et révisions

- **Glissement de calendrier accepté** : si T1 prend 4 mois, on décale le reste. On ne comprime pas T4.
- **Revue formelle à M6** : à ce stade, on sait déjà quelle verticale est la plus prometteuse — ajustement possible de T3.
- **T4 reste flexible jusqu'à M9** : pas de pression à choisir tôt.
- **Ce plan peut être révisé entièrement** si la cible carrière change ou si un blocage technique majeur apparaît (typiquement : accès aux sources).

---

## 10. Risques identifiés

| Risque | Probabilité | Mitigation |
| --- | --- | --- |
| Accès au Registre foncier insuffisant même manuellement | Faible | Travailler sur extraits fictifs construits à la main, ou via stagiaire d'été |
| Vision multimodale insuffisante pour les certificats de localisation | Moyenne | Plan B : extraction OCR + analyse textuelle en T2 |
| L'emploi d'été 2027 ne se concrétise pas | Moyenne | Le portfolio garde sa valeur en notariat général, glisse vers droit civil patrimonial |
| Charge scolaire trop élevée à certains trimestres | Élevée | Hypothèse 9 mois utiles sur 12 déjà intégrée |
| Pivot vers une autre verticale juridique en cours de route | Faible-moyenne | Le module knowledge base et la posture restent réutilisables dans tout pivot |

---

## 11. Articulation avec les phases déjà complétées

Le plan 12 mois **prolonge** les Phases 1-6 sans les renier :

- Phase 1-2 (Next.js + tRPC + Prisma + PostgreSQL) : base technique réutilisée
- Phase 3 (Better Auth) : gestion utilisateur déjà en place
- Phase 4 (Résumeur, streaming Claude) : pattern de streaming réutilisable pour les agents
- Phase 5 (anonymiseur, LLM local, registre de modèles, fallback) : infrastructure modèle réutilisable
- Phase 6 (détecteur PII, garde-fou, journal de sécurité) : socle de sécurité réutilisé tel quel

Les Phases 7 (canaux alternatifs, voix) et 8 (déploiement Azure) **sont absorbées dans T4** plutôt que traitées séparément.

---

## 12. Prochaines actions

1. Vérifier l'accès institutionnel à l'API CanLII via la bibliothèque de droit de l'Université Laval (1 après-midi)
2. Préparer 3-5 extraits fictifs du Registre foncier pour servir d'entrées de test à T1
3. Lancer T1 en sous-phases concrètes (à détailler comme les Phases 1-6 précédentes)

---

*Document créé le 27 mai 2026. À réviser au plus tard le 30 novembre 2026 (M6) et le 28 février 2027 (M9).*
