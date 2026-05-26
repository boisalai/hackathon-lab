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