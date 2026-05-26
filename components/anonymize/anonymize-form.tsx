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
import { Lock, Cloud, AlertTriangle } from "lucide-react";
import {
  anonymizeSchema,
  type AnonymizeResult as AnonymizeResultType,
} from "@/lib/anonymize-schema";
import type { Finding, LeakType } from "@/lib/leak-detector";
import { AnonymizeResult } from "@/components/anonymize/anonymize-result";
import {
  ModelSelector,
  type ClientModelInfo,
} from "@/components/anonymize/model-selector";

type FallbackMeta = {
  modelUsed: string;
  modelLabel: string;
  fellBack: boolean;
};

type LeakSummary = Partial<Record<LeakType, number>>;

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "confirm"; leaks: Finding[]; summary: LeakSummary }
  | { status: "success"; data: AnonymizeResultType; meta?: FallbackMeta }
  | { status: "error"; message: string };

const LEAK_LABELS: Record<LeakType, string> = {
  nas: "numéro d'assurance sociale",
  ramq: "numéro RAMQ",
  courriel: "courriel",
  telephone: "numéro de téléphone",
  code_postal: "code postal",
  carte_credit: "numéro de carte de crédit",
};

function pluralize(label: string, n: number): string {
  return n > 1 ? `${label}s` : label;
}

type Props = {
  models: ClientModelInfo[];
  defaultModelId: string;
};

export function AnonymizeForm({ models, defaultModelId }: Props) {
  const [text, setText] = useState("");
  const [modelId, setModelId] = useState(defaultModelId);
  const [state, setState] = useState<State>({ status: "idle" });

  const selectedModel = models.find((m) => m.id === modelId);
  const isLocalModel = selectedModel?.provider === "local";

  async function submit(override: boolean) {
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/anonymize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, modelId, override }),
      });

      // 409 = garde-fou Phase 6B : le détecteur a trouvé des données sensibles.
      // Ce n'est pas une erreur — c'est un signal à présenter à l'utilisateur.
      if (response.status === 409) {
        const json = await response.json();
        setState({
          status: "confirm",
          leaks: json.leaks as Finding[],
          summary: json.summary as LeakSummary,
        });
        return;
      }

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Erreur inconnue" }));
        setState({ status: "error", message: err.error ?? "Erreur inconnue" });
        return;
      }

      const json = await response.json();
      const validated = anonymizeSchema.safeParse(json);
      if (!validated.success) {
        setState({ status: "error", message: "Réponse mal formée" });
        return;
      }

      // Extraire la méta-info (présente si le route handler la fournit)
      const meta: FallbackMeta | undefined = json._meta;

      setState({ status: "success", data: validated.data, meta });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function handleSubmit() {
    void submit(false);
  }

  function handleConfirmOverride() {
    void submit(true);
  }

  function handleCancelConfirm() {
    setState({ status: "idle" });
  }

  function handleReset() {
    setState({ status: "idle" });
    setText("");
  }

  const charCount = text.length;
  const isValid = charCount >= 50 && charCount <= 50_000;

  // Mode confirmation : le garde-fou a détecté des données sensibles.
  if (state.status === "confirm") {
    const entries = (Object.entries(state.summary) as Array<[LeakType, number]>)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1]);

    // Échantillon : un snippet par type, tronqué à 30 caractères.
    const examples = entries
      .map(([type]) => state.leaks.find((l) => l.type === type)?.snippet ?? "")
      .filter(Boolean)
      .map((s) => (s.length > 30 ? s.slice(0, 27) + "…" : s));

    return (
      <Card className="border-amber-300">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-900">
            <AlertTriangle className="h-5 w-5" />
            Données sensibles détectées
          </CardTitle>
          <CardDescription>
            Avant tout envoi à un modèle, le système a inspecté votre texte.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-md space-y-3">
            <div>
              <p className="text-sm text-amber-900 font-medium">
                Le détecteur a trouvé :
              </p>
              <ul className="mt-1.5 ml-4 list-disc text-sm text-amber-900 space-y-0.5">
                {entries.map(([type, n]) => (
                  <li key={type}>
                    {n} {pluralize(LEAK_LABELS[type], n)}
                  </li>
                ))}
              </ul>
            </div>
            {examples.length > 0 && (
              <div>
                <p className="text-xs text-amber-800 font-medium">Exemples</p>
                <p className="mt-0.5 text-xs text-amber-900 font-mono break-all">
                  {examples.join(" · ")}
                </p>
              </div>
            )}
          </div>

          <div className="text-sm text-neutral-700 space-y-1.5">
            {isLocalModel ? (
              <>
                <p>
                  Si vous poursuivez, le texte sera traité par{" "}
                  <span className="font-medium">{selectedModel?.label}</span> sur
                  votre Mac.
                </p>
                <p className="text-amber-700">
                  En cas de panne du serveur local, le système basculera
                  automatiquement vers un modèle Anthropic et vos données
                  partiront alors vers le cloud.
                </p>
              </>
            ) : (
              <p>
                Si vous poursuivez, le texte sera envoyé à{" "}
                <span className="font-medium">{selectedModel?.label}</span>{" "}
                (Anthropic).
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleCancelConfirm}
              className="flex-1"
            >
              Retour au formulaire
            </Button>
            <Button
              onClick={handleConfirmOverride}
              className="flex-1 bg-amber-600 hover:bg-amber-700"
            >
              Envoyer quand même
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Mode résultat
  if (state.status === "success") {
    return (
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Texte anonymisé</CardTitle>
            <CardDescription className="flex items-center gap-1.5">
              {isLocalModel ? (
                <>
                  <Lock className="h-3 w-3" />
                  <span>
                    Traité localement par {selectedModel?.label} — aucune donnée n'a
                    quitté votre machine
                  </span>
                </>
              ) : (
                <>
                  <Cloud className="h-3 w-3" />
                  <span>Traité par {selectedModel?.label} (Anthropic)</span>
                </>
              )}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleReset}>
            Nouvelle anonymisation
          </Button>
        </CardHeader>
          <CardContent className="space-y-4">
            {state.meta?.fellBack && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md">
                <Cloud className="h-4 w-4 text-amber-700 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-amber-800">
                  <p className="font-medium">Bascule automatique vers un modèle cloud</p>
                  <p className="mt-0.5">
                    Le modèle local n'a pas répondu (serveur arrêté ?). La requête a été
                    traitée par <span className="font-semibold">{state.meta.modelLabel}</span>{" "}
                    pour ne pas vous faire attendre. Vos données ont été envoyées à
                    Anthropic pour cette requête.
                  </p>
                </div>
              </div>
            )}
            <AnonymizeResult result={state.data} />
          </CardContent>
      </Card>
    );
  }

  // Mode saisie OU loading
  return (
    <Card>
      <CardHeader>
        <CardTitle>Anonymiseur de texte</CardTitle>
        <CardDescription className="flex items-center gap-1.5">
          {isLocalModel ? (
            <>
              <Lock className="h-3 w-3" />
              <span>
                Modèle local — aucune donnée n'est envoyée à un serveur distant
              </span>
            </>
          ) : (
            <>
              <Cloud className="h-3 w-3" />
              <span>Modèle cloud — les données sont envoyées à Anthropic</span>
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-neutral-700">
            Modèle
          </label>
          <ModelSelector
            models={models}
            value={modelId}
            onChange={setModelId}
            disabled={state.status === "loading"}
          />
        </div>

        <Textarea
          placeholder="Colle le texte à anonymiser (jugement, contrat, témoignage…)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          className="resize-none max-h-96"
          disabled={state.status === "loading"}
        />

        <div className="flex items-center justify-between text-xs text-neutral-500">
          <span>{charCount.toLocaleString("fr-CA")} / 50 000 caractères</span>
          {charCount > 0 && charCount < 50 && (
            <span className="text-amber-600">Minimum 50 caractères</span>
          )}
        </div>

        <Button
          onClick={handleSubmit}
          disabled={!isValid || state.status === "loading"}
          className="w-full"
        >
          {state.status === "loading"
            ? `Anonymisation avec ${selectedModel?.label}…`
            : "Anonymiser"}
        </Button>

        {state.status === "loading" && (
          <p className="text-xs text-neutral-500 text-center">
            {isLocalModel
              ? "Le modèle local traite votre texte. Patience — c'est entièrement local."
              : "Requête envoyée à Anthropic. Réponse imminente."}
          </p>
        )}

        {state.status === "error" && (
          <p className="text-sm text-red-600">Erreur : {state.message}</p>
        )}
      </CardContent>
    </Card>
  );
}
