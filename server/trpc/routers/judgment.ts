import { z } from "zod";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc/init";

const SYSTEM_PROMPT = `Tu es un assistant juridique spécialisé dans la rédaction de résumés de jugements québécois et canadiens. Tu suis la méthodologie standard d'analyse jurisprudentielle (modèle ROEJ — Réseau ontarien d'éducation juridique).

Contraintes strictes :
- Rédiger en français du Québec, avec terminologie juridique précise.
- N'inclure QUE des éléments présents dans le jugement fourni. Ne jamais inventer de faits, de citations, ou de jurisprudence.
- Si une information requise n'apparaît pas dans le texte fourni, l'indiquer explicitement (ex: "non précisé dans le jugement") plutôt que d'inventer.
- Style factuel, neutre, concis.
- Pour les faits et les motifs : raconter l'histoire / le raisonnement en omettant les éléments qui n'ont pas d'incidence sur l'issue.`;

const judgmentSummarySchema = z.object({
  intitule: z.object({
    nom: z.string().describe(
      "Nom de l'affaire avec parties (ex: 'R c Patrick' ou 'SL c Commission scolaire des Chênes')"
    ),
    citation: z.string().describe(
      "Citation officielle complète (ex: '2009 CSC 17, [2009] 1 RCS 579')"
    ),
  }),
  faits: z.string().describe(
    "Survol des faits importants avec titres des personnes. Omettre les éléments sans incidence sur l'issue."
  ),
  historiqueProcedures: z.string().describe(
    "Évolution de l'affaire dans le système judiciaire jusqu'au tribunal qui a rendu le jugement résumé."
  ),
  questionsEnLitige: z.array(z.string()).describe(
    "Principales questions juridiques. Formuler si possible en oui/non."
  ),
  decision: z.string().describe(
    "Décision rendue + réparations ordonnées."
  ),
  ratioDecidendi: z.string().describe(
    "Règle de droit centrale, sous forme d'énoncé concis."
  ),
  motifs: z.string().describe(
    "Raisonnement du tribunal. Inclure motifs concourants/dissidents s'il y en a."
  ),
});

export const judgmentRouter = createTRPCRouter({
  summarize: protectedProcedure
    .input(
      z.object({
        text: z.string().min(50).max(50_000),
      })
    )
    .mutation(async ({ input }) => {
      const result = await generateObject({
        model: anthropic("claude-haiku-4-5-20251001"),
        system: SYSTEM_PROMPT,
        prompt: input.text,
        schema: judgmentSummarySchema,
      });

      return { summary: result.object };
    }),
});