"use client";

import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/trpc/root";

type RouterOutput = inferRouterOutputs<AppRouter>;
type Summary = RouterOutput["judgment"]["summarize"]["summary"];

export function JudgmentSummary({ summary }: { summary: Summary }) {
  return (
    <article className="space-y-6">
      {/* En-tête : titre + intitulé */}
      <header className="space-y-1 pb-4 border-b border-neutral-200">
        <h2 className="text-xl font-semibold text-neutral-900">
          {summary.titre}
        </h2>
        <p className="text-sm text-neutral-500">
          <span className="italic">{summary.intitule.nom}</span>,{" "}
          {summary.intitule.citation}
        </p>
      </header>

      <Section title="Faits">
        <p className="text-sm text-neutral-700 leading-relaxed">
          {summary.faits}
        </p>
      </Section>

      <Section title="Historique procédural">
        <p className="text-sm text-neutral-700">
          {summary.historiqueProcedural}
        </p>
      </Section>

      <Section title="Prétentions des parties">
        <div className="space-y-4">
          {summary.pretentionsDesParties.map((p, i) => (
            <div key={i}>
              <h4 className="text-sm font-semibold text-neutral-800 mb-1">
                {p.partie}
              </h4>
              <p className="text-sm text-neutral-700 leading-relaxed">
                {p.position}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Questions de droit">
        <ol className="list-decimal list-outside ml-5 space-y-2 text-sm text-neutral-700">
          {summary.questionsDeDroit.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ol>
      </Section>

      <Section title="Dispositif">
        <ul className="list-disc list-outside ml-5 space-y-1 text-sm text-neutral-700">
          {summary.dispositif.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      </Section>

      <Section title="Motifs">
        <div className="space-y-5">
          {summary.motifs.map((m, i) => (
            <div key={i}>
              <h4 className="text-sm font-semibold text-neutral-800 mb-2">
                {m.juge}
              </h4>
              <div className="space-y-3 text-sm text-neutral-700 leading-relaxed">
                {m.raisonnement
                  .split("\n\n")
                  .map((para, j) => para.trim() && <p key={j}>{para}</p>)}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </article>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-base font-semibold text-neutral-900 mb-2">
        {title}
      </h3>
      {children}
    </section>
  );
}