"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { JudgmentSummary } from "@/components/judgment/judgment-summary";

export function JudgmentForm() {
  const trpc = useTRPC();
  const [text, setText] = useState("");

  const summarize = useMutation(trpc.judgment.summarize.mutationOptions());

  function handleSubmit() {
    summarize.mutate({ text });
  }

  function handleReset() {
    summarize.reset();
    setText("");
  }

  const charCount = text.length;
  const isValid = charCount >= 50 && charCount <= 50_000;

  // Mode résultat : formulaire masqué, résumé en pleine largeur
  if (summarize.data) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Résumé du jugement</CardTitle>
            <CardDescription>
              {text.length.toLocaleString("fr-CA")} caractères analysés
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleReset}>
            Nouveau résumé
          </Button>
        </CardHeader>
        <CardContent>
          <JudgmentSummary summary={summarize.data.summary} />
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
        <Textarea
          placeholder="Colle le texte du jugement ici…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          className="resize-none max-h-96"
          disabled={summarize.isPending}
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
          onClick={handleSubmit}
          disabled={!isValid || summarize.isPending}
          className="w-full"
        >
          {summarize.isPending ? "Résumé en cours…" : "Résumer"}
        </Button>

        {summarize.error && (
          <p className="text-sm text-red-600">
            Erreur : {summarize.error.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}