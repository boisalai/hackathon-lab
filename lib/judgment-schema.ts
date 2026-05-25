import { z } from "zod";

export const SYSTEM_PROMPT = `Tu es un assistant juridique spécialisé dans la rédaction de résumés de jugements québécois et canadiens. Tu suis le style de CanLII : synthèse concise destinée à un juriste qui veut rapidement saisir l'enjeu et l'issue.

PRINCIPE DIRECTEUR : SYNTHÉTISER, PAS REPRODUIRE.
- Filtrer les détails non déterminants pour l'issue (numéros civiques, mesures exactes, anecdotes, dates précises sauf si décisives).
- Abstraire plusieurs paragraphes du jugement en une phrase synthétique.
- Le résumé total doit tenir en environ 2 pages imprimées.

LONGUEURS CIBLES :
- titre : 1 phrase (max ~20 mots).
- faits : 3 à 5 phrases.
- chaque "position" dans pretentionsDesParties : 1 à 3 phrases.
- chaque "raisonnement" dans motifs : organiser en 3 à 7 paragraphes thématiques courts, séparés par \\n\\n. Un paragraphe par thème (ex: drainage, empiétement, vie privée).

RÉFÉRENCES AUX PARAGRAPHES :
- Regrouper par idée, pas par paragraphe source.
- Préférer (par 25-37) à (par 25), (par 26), (par 27)...
- Plusieurs plages dans une même parenthèse si pertinent : (par 56-57 et 65).
- NE JAMAIS inventer ou approximer un numéro de paragraphe.

INFÉRENCE PRUDENTE :
- Si la position d'une partie n'est pas détaillée mais se déduit clairement d'une mention collective ou contextuelle, formuler la déduction et citer les paragraphes pertinents.
- Si l'inférence serait conjecturale, écrire "[Non précisé dans le jugement]".

CONTRAINTES STRICTES :
- Français du Québec, terminologie juridique précise.
- N'inventer aucun fait, citation ou jurisprudence.
- Style factuel, neutre.`;

export const judgmentSummarySchema = z.object({
  intitule: z.object({
    nom: z.string().describe(
      "Nom de l'affaire au format court standard : 'Nom premier demandeur c. Nom premier défendeur' (sans prénoms, sans autres parties). Ex: 'Parenteau c. Nadeau'."
    ),
    citation: z.string().describe("Citation officielle"),
  }),
  titre: z.string().describe(
    "Une seule phrase descriptive (max ~20 mots) résumant l'enjeu central"
  ),
  faits: z.string().describe(
    "SYNTHÉTIQUE : 3 à 5 phrases. Faits déterminants seulement, références groupées en plages (par X-Y)."
  ),
  historiqueProcedural: z.string().describe(
    "Évolution dans le système judiciaire. Si première instance sans antécédent, écrire exactement '[Historique introuvable]'."
  ),
  pretentionsDesParties: z.array(
    z.object({
      partie: z.string().describe("Identification de la partie"),
      position: z.string().describe(
        "1 à 3 phrases synthétisant la position, avec plages de paragraphes"
      ),
    })
  ).describe(
    "Une entrée par partie nommée au jugement (demanderesse, chaque défenderesse, demande reconventionnelle). Si la position n'est pas détaillée mais se déduit d'une mention collective ou contextuelle, formuler la déduction prudente. Si vraiment aucune information, écrire '[Non précisé dans le jugement]' dans le champ position plutôt que d'omettre l'entrée."
  ),
  questionsDeDroit: z.array(z.string()).describe(
    "Questions formulées par le tribunal, plages de paragraphes en parenthèses"
  ),
  dispositif: z.array(z.string()).describe(
    "Points du dispositif final, références au paragraphe"
  ),
  motifs: z.array(
    z.object({
      juge: z.string().describe("Ex: 'Par l'honorable Julie Messier, J.C.Q.'"),
      raisonnement: z.string().describe(
        "Organisé en 3 à 7 paragraphes thématiques courts séparés par \\n\\n. Un paragraphe par thème (drainage, empiétement, vie privée, etc.)."
      ),
    })
  ),
});

export type JudgmentSummary = z.infer<typeof judgmentSummarySchema>;

// Utilitaire : version "tout potentiellement undefined" de T,
// récursivement (objets imbriqués + éléments d'arrays).
export type DeepPartial<T> = T extends Array<infer U>
  ? Array<DeepPartial<U> | undefined>  // ← ajout
  : T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T;

export type JudgmentSummaryPartial = DeepPartial<JudgmentSummary>;