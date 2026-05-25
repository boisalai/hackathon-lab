import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { JudgmentForm } from "@/components/judgment/judgment-form";

export default async function JudgmentPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/sign-in");
  }

  return (
    <main className="min-h-svh p-6 bg-neutral-50">
      <div className="max-w-3xl mx-auto">
        <JudgmentForm />
      </div>
    </main>
  );
}