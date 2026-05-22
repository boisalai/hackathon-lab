"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn, signUp } from "@/lib/auth-client";
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

    router.push("/");
    router.refresh();
  }

  async function handleOAuth(provider: "github" | "google") {
    setError(null);
    // Note : signIn.social gère AUSSI la création de compte si l'utilisateur
    // n'en a pas encore. Pas besoin d'une signUp.social distincte.
    await signIn.social({
      provider,
      callbackURL: "/",
    });
  }

  return (
    <main className="min-h-svh flex items-center justify-center p-6 bg-neutral-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Créer un compte</CardTitle>
          <CardDescription>
            Inscris-toi avec ton email, ou via Google/GitHub.
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
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-neutral-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-2 text-neutral-500">ou</span>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => handleOAuth("github")}
          >
            Continuer avec GitHub
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => handleOAuth("google")}
          >
            Continuer avec Google
          </Button>

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