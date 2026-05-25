import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { DocumentForm } from "@/components/documents/document-form";
import { DocumentList } from "@/components/documents/document-list";

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return (
    <main className="min-h-svh p-6 bg-neutral-50">
      <div className="max-w-2xl mx-auto space-y-6">
        {session ? (
          <>
            <DocumentForm />
            <DocumentList />
          </>
        ) : (
          <p className="text-sm text-neutral-600 text-center pt-12">
            Connecte-toi pour voir et créer des documents.
          </p>
        )}
      </div>
    </main>
  );
}