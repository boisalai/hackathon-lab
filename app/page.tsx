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

export default function Home() {
  const [texte, setTexte] = useState("");
  const [resultat, setResultat] = useState<string | null>(null);

  function handleAnalyse() {
    // Phase 1 : réponse statique. Claude sera branché à la Phase 4.
    const nombreMots = texte.trim().split(/\s+/).filter(Boolean).length;
    setResultat(
      texte.trim()
        ? `Texte reçu (${nombreMots} mots). L'analyse IA sera branchée à la Phase 4.`
        : "Veuillez saisir un texte."
    );
  }

  return (
    <main className="min-h-svh flex items-center justify-center p-6 bg-neutral-50">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Hackathon Lab — Bac à sable</CardTitle>
          <CardDescription>
            Phase 1 — Fondations frontend. Colle un extrait de jugement ci-dessous.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Colle ton texte ici…"
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            rows={8}
          />
          <Button onClick={handleAnalyse} className="w-full">
            Analyser
          </Button>
          {resultat && (
            <div className="rounded-md border border-neutral-200 bg-white p-4 text-sm text-neutral-700">
              {resultat}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}