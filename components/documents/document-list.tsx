"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function DocumentList() {
  const trpc = useTRPC();

  // Appel typé bout-en-bout. Essaie l'auto-complétion sur "trpc."
  // dans VS Code : tu verras "document" apparaître.
  const { data, isLoading, error } = useQuery(
    trpc.document.list.queryOptions()
  );

  if (isLoading) {
    return (
      <p className="text-sm text-neutral-500">Chargement des documents…</p>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-red-600">Erreur : {error.message}</p>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        Aucun document pour l'instant. Crée le premier ci-dessus.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((doc) => (
        <Card key={doc.id || doc.createdAt.toISOString()}>
          <CardHeader>
            <CardTitle className="text-base">{doc.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-neutral-700 whitespace-pre-wrap">
              {doc.content}
            </p>
            <p className="text-xs text-neutral-400">
              Créé le {doc.createdAt.toLocaleString("fr-CA")}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}