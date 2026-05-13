import { DocumentForm } from "@/components/documents/document-form";
import { DocumentList } from "@/components/documents/document-list";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home() {
  return (
    <main className="min-h-svh p-6 bg-neutral-50">
      <div className="mx-auto max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Hackathon Lab — Bac à sable</CardTitle>
            <CardDescription>
              Phase 2 — Créer et lister des documents via tRPC + Prisma.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DocumentForm />
          </CardContent>
        </Card>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-neutral-700">
            Documents existants
          </h2>
          <DocumentList />
        </section>
      </div>
    </main>
  );
}