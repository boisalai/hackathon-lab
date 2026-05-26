import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { JudgmentForm } from "@/components/judgment/judgment-form";
import { modelsWith, DEFAULT_MODEL_ID } from "@/lib/models-registry";

export default async function JudgmentPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/sign-in");
  }

  // Pour le résumeur : streaming + sortie structurée → uniquement modèles compatibles
  const streamingModels = modelsWith("streaming-structured");

  // Sérialisation client-safe
  const clientModels = streamingModels.map(
    ({ id, label, provider, description, available }) => ({
      id,
      label,
      provider,
      description,
      available,
    })
  );

  return (
    <main className="min-h-svh p-6 bg-neutral-50">
      <div className="max-w-3xl mx-auto">
        <JudgmentForm models={clientModels} defaultModelId={DEFAULT_MODEL_ID} />
      </div>
    </main>
  );
}