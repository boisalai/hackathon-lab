import { z } from "zod";

export const SYSTEM_PROMPT = `Tu es un assistant juridique spécialisé dans l'anonymisation de textes juridiques québécois.

INSTRUCTION CENTRALE
Tu DOIS appeler l'outil "soumettre_anonymisation" avec le résultat de ton analyse. Ne réponds JAMAIS en texte direct.

CATÉGORIES À IDENTIFIER
- "personne" : noms de personnes physiques (parties, témoins, experts, avocats, médecins…)
- "organisation" : entreprises, OBNL, organismes
- "lieu" : adresses, numéros civiques (PAS les villes/provinces génériques)
- "date" : dates personnelles identifiantes (PAS les dates de jugement ou d'articles de loi)
- "numero" : NAS, numéro de dossier, plaque, téléphone, courriel

CONVENTION DE REMPLACEMENT (style juridique québécois)
- Personnes masculines : M. A, M. B, M. C…
- Personnes féminines : Mme A, Mme B, Mme C…
- Personnes au genre inconnu : X, Y, Z…
- Organisations : Société A, Société B…
- Lieux identifiants : Lieu A, Lieu B…
- Dates identifiantes : [date]
- Numéros : [numéro]

COHÉRENCE OBLIGATOIRE
Toutes les occurrences d'un même terme reçoivent le MÊME remplacement.
Numérotation par ordre d'apparition dans le texte, par catégorie.

PRÉSERVER
- Sens et grammaire
- Termes juridiques (articles de loi, jurisprudence)
- Noms de tribunaux, juges, villes
- Chiffres monétaires

INTERDICTIONS
- Ne JAMAIS inventer de personnes ou lieux absents du texte
- Si tu n'es pas sûr qu'un terme est identifiant, NE PAS le remplacer

/no_think`;

export const anonymizeSchema = z.object({
  texteAnonymise: z.string().describe(
    "Le texte d'origine avec tous les remplacements appliqués. Doit préserver la grammaire, la ponctuation et le sens."
  ),
  substitutions: z.array(
    z.object({
      original: z.string().describe(
        "Le terme original tel qu'il apparaît dans le texte (premier exemple si plusieurs occurrences)"
      ),
      remplacement: z.string().describe(
        "Le remplacement utilisé selon la convention (ex: 'M. A', 'Mme B', 'Société A', 'Lieu A', '[date]', '[numéro]')"
      ),
      categorie: z.enum([
        "personne",
        "organisation",
        "lieu",
        "date",
        "numero",
      ]).describe("Catégorie du terme remplacé"),
      occurrences: z.number().int().min(1).describe(
        "Nombre de fois où ce terme apparaît dans le texte original"
      ),
    })
  ).describe(
    "Tableau de correspondance entre originaux et remplacements. Une entrée par terme unique remplacé."
  ),
});

export type AnonymizeResult = z.infer<typeof anonymizeSchema>;

// Type utilitaire pour le rendu progressif pendant le streaming
export type DeepPartial<T> = T extends Array<infer U>
  ? Array<DeepPartial<U> | undefined>
  : T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T;

export type AnonymizeResultPartial = DeepPartial<AnonymizeResult>;