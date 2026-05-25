"use client";

import type { JudgmentSummaryPartial } from "@/lib/judgment-schema";

export function JudgmentSummary({
  summary,
  isStreaming = false,
}: {
  summary: JudgmentSummaryPartial;
  isStreaming?: boolean;
}) {
  return (
    <article className="space-y-6">
      {/* En-tête : titre + intitulé (peuvent être partiels) */}
      {(summary.titre || summary.intitule) && (
        <header className="space-y-1 pb-4 border-b border-neutral-200">
          {summary.titre && (
            <h2 className="text-xl font-semibold text-neutral-900">
              {summary.titre}
            </h2>
          )}
          {(summary.intitule?.nom || summary.intitule?.citation) && (
            <p className="text-sm text-neutral-500">
              {summary.intitule?.nom && (
                <span className="italic">{summary.intitule.nom}</span>
              )}
              {summary.intitule?.nom && summary.intitule?.citation && ", "}
              {summary.intitule?.citation}
            </p>
          )}
        </header>
      )}

      {summary.faits && (
        <Section title="Faits">
          <p className="text-sm text-neutral-700 leading-relaxed">
            {summary.faits}
          </p>
        </Section>
      )}

      {summary.historiqueProcedural && (
        <Section title="Historique procédural">
          <p className="text-sm text-neutral-700">
            {summary.historiqueProcedural}
          </p>
        </Section>
      )}

      {summary.pretentionsDesParties &&
        summary.pretentionsDesParties.length > 0 && (
          <Section title="Prétentions des parties">
            <div className="space-y-4">
              {summary.pretentionsDesParties.map((p, i) =>
                p?.partie || p?.position ? (
                  <div key={i}>
                    {p?.partie && (
                      <h4 className="text-sm font-semibold text-neutral-800 mb-1">
                        {p.partie}
                      </h4>
                    )}
                    {p?.position && (
                      <p className="text-sm text-neutral-700 leading-relaxed">
                        {p.position}
                      </p>
                    )}
                  </div>
                ) : null
              )}
            </div>
          </Section>
        )}

      {summary.questionsDeDroit && summary.questionsDeDroit.length > 0 && (
        <Section title="Questions de droit">
          <ol className="list-decimal list-outside ml-5 space-y-2 text-sm text-neutral-700">
            {summary.questionsDeDroit.map(
              (q, i) => q && <li key={i}>{q}</li>
            )}
          </ol>
        </Section>
      )}

      {summary.dispositif && summary.dispositif.length > 0 && (
        <Section title="Dispositif">
          <ul className="list-disc list-outside ml-5 space-y-1 text-sm text-neutral-700">
            {summary.dispositif.map((d, i) => d && <li key={i}>{d}</li>)}
          </ul>
        </Section>
      )}

      {summary.motifs && summary.motifs.length > 0 && (
        <Section title="Motifs">
          <div className="space-y-5">
            {summary.motifs.map((m, i) =>
              m?.juge || m?.raisonnement ? (
                <div key={i}>
                  {m?.juge && (
                    <h4 className="text-sm font-semibold text-neutral-800 mb-2">
                      {m.juge}
                    </h4>
                  )}
                  {m?.raisonnement && (
                    <div className="space-y-3 text-sm text-neutral-700 leading-relaxed">
                      {m.raisonnement
                        .split("\n\n")
                        .map(
                          (para, j) =>
                            para.trim() && <p key={j}>{para}</p>
                        )}
                    </div>
                  )}
                </div>
              ) : null
            )}
          </div>
        </Section>
      )}

      {isStreaming && (
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          <span className="inline-block w-2 h-2 bg-neutral-400 rounded-full animate-pulse" />
          Génération en cours…
        </div>
      )}
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
