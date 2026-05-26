/**
 * Harnais de test ad hoc pour `lib/leak-detector.ts`.
 *
 * Lancer : pnpm dlx tsx scripts/test-leak-detector.ts
 *
 * Ce n'est pas Jest/Vitest — juste un parcours de cas et un rapport ✓/✗.
 * Suffisant pour Phase 6A. Code de sortie 1 si un cas échoue.
 */

import { detectLeaks, summarize, type LeakType } from "../lib/leak-detector";

type Case = {
  name: string;
  text: string;
  expected: LeakType[]; // multi-set, ordre indifférent
};

const cases: Case[] = [
  // === Cas positifs simples ===
  {
    name: "NAS de test classique (Luhn valide)",
    text: "Mon NAS est 046-454-286 merci.",
    expected: ["nas"],
  },
  {
    name: "Téléphone québécois entre parenthèses",
    text: "Joignable au (514) 555-1234 le matin.",
    expected: ["telephone"],
  },
  {
    name: "Téléphone avec tirets et indicatif",
    text: "Appelez le +1 418-555-9876.",
    expected: ["telephone"],
  },
  {
    name: "Code postal canadien standard",
    text: "Adresse : 1234 rue Saint-Denis, Québec G1V 0A6.",
    expected: ["code_postal"],
  },
  {
    name: "Carte de crédit Visa de test (Luhn valide)",
    text: "Facture payée avec 4111 1111 1111 1111.",
    expected: ["carte_credit"],
  },
  {
    name: "Courriel standard",
    text: "Écrivez à jean.tremblay@example.com.",
    expected: ["courriel"],
  },
  {
    name: "RAMQ format québécois",
    text: "Numéro d'assurance maladie : TREJ 1234 5678.",
    expected: ["ramq"],
  },
  {
    name: "RAMQ en minuscules — ignorée (décision : majuscules strictes)",
    text: "numéro trej 1234 5678 dans le formulaire.",
    expected: [],
  },

  // === Cas négatifs ===
  {
    name: "Texte propre — aucune PII",
    text: "Bonjour Jean, comment allez-vous aujourd'hui ?",
    expected: [],
  },
  {
    name: "9 chiffres mais Luhn invalide → pas un NAS",
    text: "Référence interne 123 456 789 dans le dossier.",
    expected: [],
  },
  {
    name: "16 chiffres mais Luhn invalide → pas une carte",
    text: "Numéro de série 1234 5678 9012 3456 sur l'appareil.",
    expected: [],
  },
  {
    name: "Code postal interdit (lettre Q en 1re position)",
    text: "Le code Q1A 1A1 n'existe pas à Postes Canada.",
    expected: [],
  },
  {
    name: "10 chiffres collés (sans séparateur) → pas un téléphone",
    text: "Identifiant interne 5145551234 dans la base.",
    expected: [],
  },

  // === Cas combinés (jugement type) ===
  {
    name: "Paragraphe avec plusieurs PII",
    text:
      "Jean Tremblay, demeurant au 1234 rue Saint-Denis à Montréal G1V 0A6, " +
      "NAS 046-454-286, téléphone (514) 555-1234, courriel jean@email.com.",
    expected: ["code_postal", "nas", "telephone", "courriel"],
  },
];

function multisetEqual(a: LeakType[], b: LeakType[]): boolean {
  if (a.length !== b.length) return false;
  const counts = new Map<LeakType, number>();
  for (const t of a) counts.set(t, (counts.get(t) ?? 0) + 1);
  for (const t of b) {
    const n = counts.get(t);
    if (!n) return false;
    if (n === 1) counts.delete(t);
    else counts.set(t, n - 1);
  }
  return counts.size === 0;
}

let passed = 0;
let failed = 0;

for (const c of cases) {
  const findings = detectLeaks(c.text);
  const got = findings.map((f) => f.type);
  const ok = multisetEqual(got, c.expected);
  if (ok) {
    passed++;
    console.log(`✓ ${c.name}`);
  } else {
    failed++;
    console.log(`✗ ${c.name}`);
    console.log(`  texte    : ${JSON.stringify(c.text)}`);
    console.log(`  attendu  : [${c.expected.join(", ")}]`);
    console.log(`  obtenu   : [${got.join(", ")}]`);
    console.log(`  détails  : ${JSON.stringify(findings, null, 2)}`);
  }
}

console.log("");
console.log(`${passed} passé(s), ${failed} échec(s) sur ${cases.length} cas.`);

// Démo summarize() sur le dernier cas combiné.
const demo = detectLeaks(cases[cases.length - 1].text);
console.log("");
console.log("Démo summarize() sur le paragraphe combiné :");
console.log(summarize(demo));

if (failed > 0) process.exit(1);
