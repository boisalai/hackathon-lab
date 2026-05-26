"use client";

import type { AnonymizeResultPartial } from "@/lib/anonymize-schema";
import { User, Building2, MapPin, Calendar, Hash } from "lucide-react";

const categoryConfig = {
  personne: {
    label: "Personnes",
    icon: User,
    color: "text-blue-700 bg-blue-50 border-blue-200",
  },
  organisation: {
    label: "Organisations",
    icon: Building2,
    color: "text-purple-700 bg-purple-50 border-purple-200",
  },
  lieu: {
    label: "Lieux",
    icon: MapPin,
    color: "text-emerald-700 bg-emerald-50 border-emerald-200",
  },
  date: {
    label: "Dates",
    icon: Calendar,
    color: "text-amber-700 bg-amber-50 border-amber-200",
  },
  numero: {
    label: "Numéros",
    icon: Hash,
    color: "text-rose-700 bg-rose-50 border-rose-200",
  },
} as const;

type Category = keyof typeof categoryConfig;

export function AnonymizeResult({
  result,
  isStreaming = false,
}: {
  result: AnonymizeResultPartial;
  isStreaming?: boolean;
}) {
  const subs = result.substitutions ?? [];

  return (
    <div className="space-y-6">
      {/* Texte anonymisé */}
      {result.texteAnonymise && (
        <section>
          <h3 className="text-sm font-semibold text-neutral-900 mb-2">
            Texte anonymisé
          </h3>
          <div className="text-sm text-neutral-800 leading-relaxed bg-white border border-neutral-200 rounded-md p-4 whitespace-pre-wrap font-serif max-h-96 overflow-y-auto">
            {result.texteAnonymise}
          </div>
        </section>
      )}

      {/* Substitutions par catégorie */}
      {subs.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-neutral-900 mb-3">
            Substitutions effectuées
          </h3>
          <div className="space-y-3">
            {(Object.keys(categoryConfig) as Category[]).map((cat) => {
              const items = subs.filter((sub) => sub?.categorie === cat);
              if (items.length === 0) return null;
              const { label, icon: Icon, color } = categoryConfig[cat];
              return (
                <div key={cat}>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-600 mb-1.5">
                    <Icon className="h-3.5 w-3.5" />
                    <span>
                      {label} ({items.length})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((sub, i) =>
                      sub?.original && sub?.remplacement ? (
                        <span
                          key={i}
                          className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-md border ${color}`}
                        >
                          <span className="font-mono">{sub.original}</span>
                          <span className="text-neutral-400">→</span>
                          <span className="font-mono font-semibold">
                            {sub.remplacement}
                          </span>
                          {sub.occurrences && sub.occurrences > 1 && (
                            <span className="text-neutral-400">
                              ×{sub.occurrences}
                            </span>
                          )}
                        </span>
                      ) : null
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {isStreaming && (
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          <span className="inline-block w-2 h-2 bg-neutral-400 rounded-full animate-pulse" />
          Analyse en cours…
        </div>
      )}
    </div>
  );
}