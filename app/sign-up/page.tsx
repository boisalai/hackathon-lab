"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signUp } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setIsPending(true);

    const result = await signUp.email({
      name,
      email,
      password,
    });

    setIsPending(false);

    if (result.error) {
      setError(result.error.message ?? "Erreur lors de l'inscription");
      return;
    }

    // Inscription réussie — Better Auth a déjà créé la session.
    // On redirige vers l'accueil.
    router.push("/");
    router.refresh();
  }

  return (
    <main className="min-h-svh flex items-center justify-center p-6 bg-neutral-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Créer un compte</CardTitle>
          <CardDescription>
            Inscris-toi avec ton email et un mot de passe.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Nom"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isPending}
          />
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isPending}
          />
          <Input
            type="password"
            placeholder="Mot de passe (8 caractères minimum)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isPending}
          />
          <Button
            onClick={handleSubmit}
            disabled={
              isPending ||
              !name.trim() ||
              !email.trim() ||
              password.length < 8
            }
            className="w-full"
          >
            {isPending ? "Création…" : "Créer mon compte"}
          </Button>
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          <p className="text-sm text-neutral-500 text-center pt-2">
            Déjà un compte ?{" "}
            <Link href="/sign-in" className="underline">
              Se connecter
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}