import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AnonymizeForm } from "@/components/anonymize/anonymize-form";
import { MODEL_LIST, DEFAULT_MODEL_ID } from "@/lib/models-registry";

export default async function AnonymizePage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/sign-in");
  }

  // Extraire uniquement les champs utiles côté client (pas l'instance LanguageModel)
  const clientModels = MODEL_LIST.map(({ id, label, provider, description, available }) => ({
    id,
    label,
    provider,
    description,
    available,
  }));

  return (
    <main className="min-h-svh p-6 bg-neutral-50">
      <div className="max-w-3xl mx-auto">
        <AnonymizeForm models={clientModels} defaultModelId={DEFAULT_MODEL_ID} />
      </div>
    </main>
  );
}