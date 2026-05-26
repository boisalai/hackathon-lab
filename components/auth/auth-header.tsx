"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function AuthHeader() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  async function handleSignOut() {
    await signOut();
    router.push("/");
    router.refresh();
  }

  if (isPending) {
    // Évite un flash entre "non connecté" et "connecté" au chargement.
    return (
      <div className="h-10 flex items-center justify-end px-6">
        <span className="text-xs text-neutral-400">Chargement…</span>
      </div>
    );
  }

  return (
    <header className="h-12 flex items-center justify-between px-6 bg-white">
      <Link href="/" className="text-sm font-semibold text-neutral-900">
        Hackathon Lab
      </Link>

      <div className="flex items-center gap-3">
        {session ? (
          <>
            <span className="text-sm text-neutral-700">
              Bonjour, {session.user.name}
            </span>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              Se déconnecter
            </Button>
          </>
        ) : (
          <>
            <Link href="/sign-in">
              <Button variant="ghost" size="sm">
                Se connecter
              </Button>
            </Link>
            <Link href="/sign-up">
              <Button size="sm">Créer un compte</Button>
            </Link>
          </>
        )}
      </div>
    </header>
  );
}