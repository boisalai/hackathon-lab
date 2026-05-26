# Phase 1 — Installation et initialisation

Vérifions d'abord les versions actuelles des outils avant de te donner les commandes — tes préférences demandent de ne rien présumer de mémoire.Voici le plan de la **Phase 1**, vérifié sur les sources officielles.

## Informations vérifiées

- **Next.js 16.2.6** (version courante) requiert **Node.js 20.9+**. Le _setup_ par défaut active TypeScript, Tailwind CSS, ESLint, App Router et Turbopack, avec l'alias `@/*` et inclut un fichier AGENTS.md.
- **shadcn/ui** : il faut lancer la commande `shadcn init` dans le projet pour configurer la bibliothèque. La version courante cible Tailwind v4 (incluse dans le _setup_ par défaut de Next.js 16).

## Étape 1 — Installer la chaîne d'outils

> ⚠️ Avant tout : ouvre **Terminal.app**. Toutes les commandes ci-dessous se lancent là.

### 1.1 — Vérifier si Homebrew est déjà installé

```bash
brew --version
```

Si tu vois une version → saute à 1.2. Sinon, installe Homebrew :

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Suis les instructions à la fin du script (il te dira d'ajouter Homebrew au `PATH` — copie-colle les lignes qu'il affiche).

### 1.2 — Installer `fnm` (gestionnaire de versions Node)

Pourquoi `fnm` plutôt que `node` direct ? Tu vas avoir plusieurs projets avec des exigences Node différentes au fil du temps. `fnm` est rapide, écrit en Rust, optimisé pour Apple Silicon.

```bash
brew install fnm
```

Ajoute fnm à ton shell. Vérifie d'abord quel shell tu utilises :

```bash
echo $SHELL
```

Si `/bin/zsh` (défaut sur macOS récents) :

```bash
echo 'eval "$(fnm env --use-on-cd --shell zsh)"' >> ~/.zshrc
source ~/.zshrc
```

### 1.3 — Installer Node.js LTS

```bash
fnm install --lts
fnm use lts-latest
node --version
```

Tu dois voir `v22.x.x` ou plus récent. ✅

### 1.4 — Activer pnpm via Corepack

Corepack est intégré à Node.js, c'est la méthode officielle :

```bash
corepack enable
corepack prepare pnpm@latest --activate
pnpm --version
```

## Étape 2 — Créer le projet

Choisis d'abord un dossier parent (par exemple `~/Code`) :

```bash
mkdir -p ~/Code
cd ~/Code
```

Initialise le projet :

```bash
pnpm create next-app@latest hackathon-lab
```

Réponds aux questions :

|Question|Réponse|
|---|---|
|`What is your project named?`|`hackathon-lab` _(déjà rempli)_|
|`Would you like to use the recommended Next.js defaults?`|**Yes** (TypeScript, ESLint, Tailwind, App Router, AGENTS.md)|

Puis :

```bash
cd hackathon-lab
pnpm dev
```

Ouvre **http://localhost:3000** dans ton navigateur → tu dois voir la page d'accueil par défaut de Next.js.

**Arrête le serveur avec `Ctrl+C` avant de passer à l'étape suivante.**

Étape 2-B Correction

C'est un comportement attendu de **pnpm v10+** : par sécurité, les scripts de _build_ des dépendances natives ne s'exécutent plus automatiquement. Il faut les approuver explicitement. Vérifions la marche officielle :## Cause

pnpm v10+ a une protection : il refuse d'exécuter les _scripts post-install_ des dépendances natives sans approbation explicite. Les deux paquets concernés sont :

- **`sharp`** : optimisation d'images intégrée à Next.js (binaires natifs compilés)
- **`unrs-resolver`** : résolveur de modules écrit en Rust, utilisé par Turbopack/Next.js

Les deux sont **sûrs et requis** pour que Next.js fonctionne correctement.

## Correction

Le dossier `hackathon-lab` a été créé mais l'installation a été interrompue. On va y aller, approuver les builds, et terminer l'installation.

```bash
cd ~/Code/hackathon-lab
pnpm approve-builds
```

Tu vas voir un _prompt_ interactif. Réponds ainsi :

1. **Quels paquets approuver ?** → utilise les flèches ↑↓ et **espace** pour cocher `sharp` et `unrs-resolver`, puis **Entrée**
2. **Confirmer ?** → **Y** (yes)

Cela écrit un fichier `pnpm-workspace.yaml` à la racine du projet avec la liste autorisée.

Ensuite, relance l'installation pour exécuter les scripts de _build_ :

```bash
pnpm install
```

Tu devrais voir cette fois la compilation de `sharp` réussir (quelques secondes) sans avertissement final.

## Vérification

```bash
pnpm dev
```

Ouvre **http://localhost:3000** → tu dois voir la page d'accueil par défaut de Next.js. ✅

Quand c'est bon, arrête le serveur (`Ctrl+C`) et **dis-le moi** — on enchaîne sur l'**Étape 3 (shadcn/ui)**.

> 💡 **À noter pour `apprentissages.md`** : ce piège est typique de pnpm v10+ et tu le reverras dans presque tous les projets Next.js. Bon réflexe à ajouter au journal : _« Après `pnpm create next-app`, faire `pnpm approve-builds` puis `pnpm install` »_.


## Étape 3 — Installer shadcn/ui

```bash
pnpm dlx shadcn@latest init
```

Réponses suggérées :

- Base color : **Neutral**
- Le reste : laisse les valeurs par défaut

Ajoute deux composants dont on aura besoin :

```bash
pnpm dlx shadcn@latest add button textarea card
```

## Étape 4 — Construire la page d'accueil

On va remplacer le contenu par défaut par un formulaire texte qui rend une réponse statique. Ouvre `app/page.tsx` dans ton éditeur et **remplace tout son contenu** par :

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home() {
  const [texte, setTexte] = useState("");
  const [resultat, setResultat] = useState<string | null>(null);

  function handleAnalyse() {
    // Phase 1 : réponse statique. On branchera Claude à la phase 4.
    const nombreMots = texte.trim().split(/\s+/).filter(Boolean).length;
    setResultat(
      texte.trim()
        ? `Texte reçu (${nombreMots} mots). L'analyse IA sera branchée à la phase 4.`
        : "Veuillez saisir un texte."
    );
  }

  return (
    <main className="min-h-svh flex items-center justify-center p-6 bg-neutral-50">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Hackathon Lab — Bac à sable</CardTitle>
          <CardDescription>
            Phase 1 — Fondations frontend. Colle un extrait de jugement ci-dessous.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Colle ton texte ici…"
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            rows={8}
          />
          <Button onClick={handleAnalyse} className="w-full">
            Analyser
          </Button>
          {resultat && (
            <div className="rounded-md border border-neutral-200 bg-white p-4 text-sm text-neutral-700">
              {resultat}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
```

Relance le serveur :

```bash
pnpm dev
```

Tu dois voir une carte centrée avec un titre, une zone de texte, un bouton, et une zone de résultat qui apparaît après clic. ✅

## Étape 5 — Git et journal d'apprentissages

Crée le journal :

```bash
cat > apprentissages.md << 'EOF'
# Journal d'apprentissages

## Phase 1 — Fondations frontend

**Date** : *(à remplir)*
**Technos** : Next.js 16, TypeScript, Tailwind CSS, shadcn/ui

### Ce que j'ai appris
- Structure d'un projet Next.js avec App Router (`app/page.tsx` = route `/`)
- Convention de composants client (`"use client"`) vs serveur
- shadcn/ui copie les composants dans `components/ui/` plutôt que de les installer comme dépendances → contrôle total du code
- Tailwind v4 utilise les utilitaires directement dans le JSX via `className`

### Pièges rencontrés
- *(à remplir au fur et à mesure)*

### Ressources utiles
- Doc Next.js : https://nextjs.org/docs
- Doc shadcn/ui : https://ui.shadcn.com/docs
EOF
```

Premier commit :

```bash
git add -A
git commit -m "Phase 1: fondations frontend (Next.js + Tailwind + shadcn/ui)"
```

> Note : `create-next-app` initialise déjà le dépôt Git automatiquement avec un premier commit.

## Critère de validation de la Phase 1

- [ ] `pnpm dev` démarre sans erreur
- [ ] La page affiche la carte avec titre, _textarea_, bouton
- [ ] Cliquer « Analyser » affiche le message statique avec le compte de mots
- [ ] `apprentissages.md` contient ta première entrée
- [ ] Le commit est fait

---

**Lance les étapes 1 à 5 et reviens me dire :**

1. À quelle étape tu es rendu
2. Tout message d'erreur que tu rencontres (copie-colle exact)
3. Une fois la Phase 1 validée, on passe à la Phase 2 (tRPC + Prisma)




# Comprendre shadcn/ui

## Le point de départ : pourquoi c'est différent

La plupart des bibliothèques de composants React (Material UI, Chakra UI, Ant Design, Mantine) fonctionnent ainsi :

1. Tu fais `pnpm add @mui/material`
2. Tu importes `import { Button } from "@mui/material"`
3. Le code du bouton vit dans `node_modules`, hors de ton dépôt
4. Si tu veux modifier ce bouton, tu dois soit *surcharger* via une API de thème, soit *forker*

**shadcn/ui inverse complètement ce modèle.** Ce n'est pas une bibliothèque que tu installes — c'est un *générateur de code* qui **copie les fichiers source des composants directement dans ton projet**.

Après `pnpm dlx shadcn@latest add button`, le fichier `components/ui/button.tsx` est **à toi**. Tu peux le lire, le modifier, le supprimer. Il n'y a pas de version « officielle » à mettre à jour : c'est ton code.

## Anatomie de ce qui s'est passé à l'Étape 3

### 3.1 — `pnpm dlx shadcn@latest init`

`pnpm dlx` = exécute un paquet sans l'installer durablement (équivalent de `npx`). Cette commande a fait quatre choses :

| Action | Effet |
|---|---|
| Détecté Next.js et Tailwind v4 dans ton projet | Adapté la config à ton environnement |
| Créé `components.json` à la racine | Fichier de configuration qui dit à la CLI où mettre les composants, quel style utiliser, etc. |
| Modifié `app/globals.css` | A ajouté les variables CSS (`--background`, `--foreground`, `--primary`, etc.) qui définissent la palette « Neutral » |
| Créé `lib/utils.ts` | Contient la fonction utilitaire `cn()` qui fusionne intelligemment les classes Tailwind |

Le fichier `components.json` typique ressemble à ceci :

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "css": "app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

### 3.2 — `pnpm dlx shadcn@latest add button textarea card`

Pour chaque composant demandé, la CLI a :

1. Téléchargé le code source TSX depuis le *registry* shadcn
2. Installé les dépendances Radix UI nécessaires dans `node_modules` (ex. `@radix-ui/react-slot` pour le bouton)
3. Écrit le fichier dans `components/ui/<nom>.tsx`

Le bouton, par exemple, n'est pas un composant magique. C'est un fichier que tu peux ouvrir : `components/ui/button.tsx`. Il utilise `class-variance-authority` (cva) pour définir des variantes (default, destructive, outline, ghost...) et Radix UI Slot pour la composition avancée.

## Les trois ingrédients sous-jacents

### 1. Radix UI (la mécanique invisible)

Tous les composants interactifs de shadcn/ui s'appuient sur **Radix UI Primitives** — des composants React *non stylés* qui gèrent toute la complexité d'accessibilité (gestion du clavier, ARIA, focus *trap*, etc.).

- shadcn/ui = *« voici à quoi ça ressemble »* (style)
- Radix = *« voici comment ça se comporte »* (logique)

C'est pourquoi un `<Dialog>` shadcn gère automatiquement la touche `Échap`, le focus, le verrouillage du scroll — tu n'as rien à coder.

### 2. Tailwind CSS (le style)

Tous les styles des composants shadcn sont écrits en classes Tailwind. Aucun CSS-in-JS, aucun runtime de style. Le bouton ressemble à :

```tsx
<button className="inline-flex items-center justify-center rounded-md text-sm font-medium ...">
```

Avantages :
- Pas de coût d'exécution
- Tu peux **modifier directement** les classes pour personnaliser
- Tailwind v4 utilise un moteur natif rapide

### 3. CSS Variables (le thème)

Les couleurs ne sont pas codées en dur. Elles passent par des variables CSS définies dans `app/globals.css` :

```css
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  ...
}
```

Conséquence pratique : pour changer toute la palette (passer en *dark mode*, changer la couleur d'accent), tu modifies **un seul fichier**. Tous les composants suivent automatiquement.

## La fonction `cn()` — petite mais centrale

Dans `lib/utils.ts` :

```ts
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

Elle fait deux choses :

1. **`clsx`** — fusionne des classes conditionnelles : `cn("px-4", isActive && "bg-blue-500")`
2. **`twMerge`** — résout les conflits Tailwind intelligemment : `cn("px-4", "px-8")` → `"px-8"` (la dernière gagne, comme on s'y attend)

Sans `twMerge`, tu te retrouverais avec `"px-4 px-8"` dans le HTML et un comportement imprévisible.

## Pourquoi ce modèle est puissant pour un hackathon

- **Pas de dépendance de version** sur une bibliothèque tierce qui pourrait casser
- **Personnalisation immédiate** — un bouton ne te plaît pas ? Tu le modifies, point final
- **Bundle minimal** — seuls les composants ajoutés sont dans le code
- **Lisibilité** — pas de magie cachée, tout est dans ton dépôt

## Les pièges à connaître

1. **Pas de mise à jour automatique** — si shadcn publie un correctif sur le bouton, tu ne le reçois pas automatiquement. Il faut relancer `add button` et accepter d'écraser ton fichier (ou *diff* manuellement).
2. **Risque de divergence** — si tu modifies un composant et que ton équipe en ajoute une variante par-dessus, ça peut devenir incohérent. Bonne pratique : décider tôt qui *possède* la couche `components/ui/`.
3. **C'est du code en clair** — donc commité dans Git, donc revu par l'équipe, donc à maintenir. Pas une bibliothèque qu'on oublie.

## Pour aller plus loin

- Documentation officielle : https://ui.shadcn.com
- Liste des composants : https://ui.shadcn.com/docs/components
- Pour ajouter un nouveau composant plus tard : `pnpm dlx shadcn@latest add <nom>`



