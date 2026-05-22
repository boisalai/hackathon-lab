"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setIsPending(true);

    const result = await signIn.email({
      email,
      password,
    });

    setIsPending(false);

    if (result.error) {
      setError(result.error.message ?? "Email ou mot de passe incorrect");
      return;
    }

    router.push("/");
    router.refresh();
  }

  async function handleOAuth(provider: "github" | "google") {
    setError(null);
    await signIn.social({
      provider,
      callbackURL: "/",
    });
    // La redirection vers le provider OAuth se fait automatiquement.
    // Au retour, l'utilisateur sera redirigé vers callbackURL ("/").
  }

  return (
    <main className="min-h-svh flex items-center justify-center p-6 bg-neutral-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Connexion</CardTitle>
          <CardDescription>
            Connecte-toi avec ton email et ton mot de passe, ou via Google/GitHub.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isPending}
          />
          <Input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isPending}
          />
          <Button
            onClick={handleSubmit}
            disabled={isPending || !email.trim() || !password.trim()}
            className="w-full"
          >
            {isPending ? "Connexion…" : "Se connecter"}
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
            Pas encore de compte ?{" "}
            <Link href="/sign-up" className="underline">
              Créer un compte
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}