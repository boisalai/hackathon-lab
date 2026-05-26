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
import { Lock, Cloud } from "lucide-react";
import {
  anonymizeSchema,
  type AnonymizeResult as AnonymizeResultType,
} from "@/lib/anonymize-schema";
import { AnonymizeResult } from "@/components/anonymize/anonymize-result";
import {
  ModelSelector,
  type ClientModelInfo,
} from "@/components/anonymize/model-selector";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: AnonymizeResultType }
  | { status: "error"; message: string };

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

  async function handleSubmit() {
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/anonymize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, modelId }),
      });

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

      setState({ status: "success", data: validated.data });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function handleReset() {
    setState({ status: "idle" });
    setText("");
  }

  const charCount = text.length;
  const isValid = charCount >= 50 && charCount <= 50_000;

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
        <CardContent>
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
