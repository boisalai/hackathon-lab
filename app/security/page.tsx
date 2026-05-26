import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { LeakType } from "@/lib/leak-detector";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, AlertTriangle, CheckCircle2 } from "lucide-react";

const LEAK_LABELS: Record<LeakType, string> = {
  nas: "NAS",
  ramq: "RAMQ",
  courriel: "courriel",
  telephone: "téléphone",
  code_postal: "code postal",
  carte_credit: "carte",
};

const dateFmt = new Intl.DateTimeFormat("fr-CA", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatSummary(summary: Partial<Record<LeakType, number>>): string {
  const entries = Object.entries(summary)
    .filter(([, n]) => typeof n === "number" && n > 0)
    .sort((a, b) => (b[1] as number) - (a[1] as number));
  if (entries.length === 0) return "—";
  return entries
    .map(([type, n]) => `${n} ${LEAK_LABELS[type as LeakType] ?? type}`)
    .join(" · ");
}

export default async function SecurityPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/sign-in");
  }

  const events = await prisma.securityEvent.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const blockedCount = events.filter((e) => e.decision === "BLOCKED").length;
  const overriddenCount = events.filter((e) => e.decision === "OVERRIDDEN").length;

  return (
    <main className="min-h-svh p-6 bg-neutral-50">
      <div className="max-w-5xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Journal de sécurité
            </CardTitle>
            <CardDescription>
              50 derniers événements du garde-fou (détections + décisions).
              Les scans qui ne trouvent rien ne sont pas listés.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-6 text-sm">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <span className="font-medium">{blockedCount}</span>
                <span className="text-neutral-600">bloqué{blockedCount > 1 ? "s" : ""}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-amber-600" />
                <span className="font-medium">{overriddenCount}</span>
                <span className="text-neutral-600">overridé{overriddenCount > 1 ? "s" : ""}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {events.length === 0 ? (
              <div className="p-12 text-center text-sm text-neutral-500">
                Aucun événement pour l&apos;instant. Le garde-fou journalisera
                ici chaque blocage ou override depuis l&apos;Anonymiseur.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 text-xs text-neutral-600">
                    <tr>
                      <th className="text-left font-medium px-4 py-2">Date</th>
                      <th className="text-left font-medium px-4 py-2">Décision</th>
                      <th className="text-left font-medium px-4 py-2">Verticale</th>
                      <th className="text-left font-medium px-4 py-2">Modèle</th>
                      <th className="text-left font-medium px-4 py-2">Détections</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e) => {
                      const summary = e.summary as Partial<Record<LeakType, number>>;
                      const isBlocked = e.decision === "BLOCKED";
                      return (
                        <tr key={e.id} className="border-t border-neutral-100">
                          <td className="px-4 py-2 text-neutral-700 whitespace-nowrap">
                            {dateFmt.format(e.createdAt)}
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className={
                                "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium " +
                                (isBlocked
                                  ? "bg-red-50 text-red-700 border border-red-200"
                                  : "bg-amber-50 text-amber-800 border border-amber-200")
                              }
                            >
                              {isBlocked ? "Bloqué" : "Overridé"}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-neutral-700">{e.route}</td>
                          <td className="px-4 py-2 text-neutral-700 font-mono text-xs">
                            {e.modelId}
                          </td>
                          <td className="px-4 py-2 text-neutral-700">
                            {formatSummary(summary)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
