"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Laptop, Cloud } from "lucide-react";

// Liste des modèles exposée au client — typage volontairement minimal
// pour éviter d'importer LanguageModel du SDK serveur.
export type ClientModelInfo = {
  id: string;
  label: string;
  provider: "local" | "anthropic";
  description: string;
  available: boolean;
};

type Props = {
  models: ClientModelInfo[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
};

export function ModelSelector({ models, value, onChange, disabled }: Props) {
  const localModels = models.filter((m) => m.provider === "local");
  const cloudModels = models.filter((m) => m.provider === "anthropic");

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Choisir un modèle" />
      </SelectTrigger>
      <SelectContent>
        {localModels.length > 0 && (
          <SelectGroup>
            <SelectLabel className="flex items-center gap-1.5 text-xs">
              <Laptop className="h-3 w-3" />
              <span>Local (sur votre Mac)</span>
            </SelectLabel>
            {localModels.map((m) => (
              <SelectItem key={m.id} value={m.id} disabled={!m.available}>
                <div className="flex flex-col items-start py-0.5">
                  <span className="text-sm">
                    {m.label}
                    {!m.available && (
                      <span className="ml-2 text-xs text-neutral-400">
                        (non chargé)
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {m.description}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectGroup>
        )}

        {cloudModels.length > 0 && (
          <SelectGroup>
            <SelectLabel className="flex items-center gap-1.5 text-xs">
              <Cloud className="h-3 w-3" />
              <span>Cloud (Anthropic API)</span>
            </SelectLabel>
            {cloudModels.map((m) => (
              <SelectItem key={m.id} value={m.id} disabled={!m.available}>
                <div className="flex flex-col items-start py-0.5">
                  <span className="text-sm">{m.label}</span>
                  <span className="text-xs text-neutral-500">
                    {m.description}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}