"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function DocumentForm() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  // Mutation typée bout-en-bout pour créer un document.
  const createDocument = useMutation(
    trpc.document.create.mutationOptions({
      onSuccess: async () => {
        // Une fois la création réussie, on invalide la requête `list`
        // pour que React Query la refasse automatiquement.
        await queryClient.invalidateQueries({
          queryKey: trpc.document.list.queryKey(),
        });
        // On vide le formulaire.
        setTitle("");
        setContent("");
      },
    })
  );

  function handleSubmit() {
    if (!title.trim() || !content.trim()) return;
    createDocument.mutate({ title, content });
  }

  return (
    <div className="space-y-4">
      <Input
        placeholder="Titre du document"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={createDocument.isPending}
      />
      <Textarea
        placeholder="Contenu du document…"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={6}
        disabled={createDocument.isPending}
      />
      <Button
        onClick={handleSubmit}
        disabled={
          createDocument.isPending || !title.trim() || !content.trim()
        }
        className="w-full"
      >
        {createDocument.isPending ? "Création…" : "Créer le document"}
      </Button>
      {createDocument.error && (
        <p className="text-sm text-red-600">
          Erreur : {createDocument.error.message}
        </p>
      )}
    </div>
  );
}