"use client";

import { useState } from "react";
import { experimental_useObject as useObject } from "@ai-sdk/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { judgmentSummarySchema } from "@/lib/judgment-schema";
import { JudgmentSummary } from "@/components/judgment/judgment-summary";
import {
  ModelSelector,
  type ClientModelInfo,
} from "@/components/anonymize/model-selector";

type Props = {
  models: ClientModelInfo[];
  defaultModelId: string;
};

// Wrapper : permet de "réinitialiser" en remontant le composant interne
export function JudgmentForm({ models, defaultModelId }: Props) {
  const [iteration, setIteration] = useState(0);
  return (
    <JudgmentFormStreaming
      key={iteration}
      models={models}
      defaultModelId={defaultModelId}
      onReset={() => setIteration((i) => i + 1)}
    />
  );
}

function JudgmentFormStreaming({
  models,
  defaultModelId,
  onReset,
}: Props & { onReset: () => void }) {
  const [text, setText] = useState("");
  const [modelId, setModelId] = useState(defaultModelId);

  const { object, submit, isLoading, error, stop } = useObject({
    api: "/api/judgment/summarize",
    schema: judgmentSummarySchema,
  });

  const selectedModel = models.find((m) => m.id === modelId);
  const charCount = text.length;
  const isValid = charCount >= 50 && charCount <= 50_000;

  // Mode streaming OU résultat
  if (isLoading || object) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>
              {isLoading ? "Résumé en cours…" : "Résumé du jugement"}
            </CardTitle>
            <CardDescription>
              {text.length.toLocaleString("fr-CA")} caractères analysés ·{" "}
              {selectedModel?.label}
            </CardDescription>
          </div>
          {isLoading ? (
            <Button variant="outline" size="sm" onClick={stop}>
              Arrêter
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={onReset}>
              Nouveau résumé
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {object ? (
            <JudgmentSummary summary={object} isStreaming={isLoading} />
          ) : (
            <p className="text-sm text-neutral-500">
              Réception des premières sections…
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  // Mode saisie
  return (
    <Card>
      <CardHeader>
        <CardTitle>Résumeur de jugement</CardTitle>
        <CardDescription>
          Colle le texte d'un jugement québécois ou canadien. Le résumé suit la
          méthodologie CanLII.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-neutral-700">Modèle</label>
          <ModelSelector models={models} value={modelId} onChange={setModelId} />
        </div>

        <Textarea
          placeholder="Colle le texte du jugement ici…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          className="resize-none max-h-96"
        />

        <div className="flex items-center justify-between text-xs text-neutral-500">
          <span>
            {charCount.toLocaleString("fr-CA")} / 50 000 caractères
          </span>
          {charCount > 0 && charCount < 50 && (
            <span className="text-amber-600">Minimum 50 caractères</span>
          )}
        </div>

        <Button
          onClick={() => submit({ text, modelId })}
          disabled={!isValid}
          className="w-full"
        >
          Résumer
        </Button>

        {error && (
          <p className="text-sm text-red-600">
            Erreur : {error.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}