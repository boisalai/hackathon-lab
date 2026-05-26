/**
 * Détecteur de fuite de données sensibles (PII) — règles regex Québec/Canada.
 *
 * Module pur : pas d'I/O, pas de dépendance Next, exécutable côté serveur
 * comme côté script Node. Utilisé par Phase 6 comme garde-fou avant tout
 * envoi de texte à un modèle distant.
 *
 * Conception :
 * - Chaque règle décrit un type, une regex et, optionnellement, un validateur
 *   supplémentaire (ex. Luhn pour NAS et cartes). Les regex larges réduisent
 *   les faux négatifs ; les validateurs réduisent les faux positifs.
 * - Pas de dédoublonnage de spans chevauchants : on rapporte tout. Si deux
 *   règles attrapent la même séquence, l'UI les listera séparément, ce qui
 *   facilite le diagnostic.
 */

export type LeakType =
  | "nas"
  | "ramq"
  | "courriel"
  | "telephone"
  | "code_postal"
  | "carte_credit";

export type Severity = "high" | "medium" | "low";

export type Finding = {
  type: LeakType;
  span: [number, number]; // [start, end) sur le texte original
  snippet: string;
  severity: Severity;
};

type Rule = {
  type: LeakType;
  severity: Severity;
  regex: RegExp;
  validate?: (match: RegExpExecArray) => boolean;
};

/** Algorithme de Luhn (NAS canadien et cartes de crédit). */
function isValidLuhn(digits: string): boolean {
  if (digits.length === 0) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function digitsOnly(s: string): string {
  return s.replace(/\D+/g, "");
}

/**
 * Règles. Ordre = priorité d'affichage seulement. Les regex utilisent des
 * limites `\b` pour ne pas s'embêter dans du contenu structuré.
 */
const RULES: Rule[] = [
  {
    type: "courriel",
    severity: "medium",
    // RFC simplifiée — couvre la quasi-totalité des courriels en pratique.
    regex: /\b[\w.+-]+@[a-zA-Z\d-]+(?:\.[a-zA-Z\d-]+)+\b/g,
  },
  {
    type: "code_postal",
    severity: "low",
    // Format canadien A1A 1A1 ; lettres interdites en 1re/3e/5e position :
    // D, F, I, O, Q, U (Postes Canada).
    regex: /\b[A-CEGHJ-NPR-TVXY]\d[A-CEGHJ-NPR-TV-Z][\s-]?\d[A-CEGHJ-NPR-TV-Z]\d\b/gi,
  },
  {
    type: "telephone",
    severity: "medium",
    // NANP : indicatif optionnel +1 / 1, puis 3-3-4 avec séparateurs souples.
    // On exige au moins un séparateur (espace, tiret, point, ou parenthèses)
    // pour éviter qu'une chaîne brute de 10 chiffres soit captée.
    regex:
      /(?:\+?1[\s.-]?)?(?:\(\d{3}\)[\s.-]?|\d{3}[\s.-])\d{3}[\s.-]\d{4}\b/g,
  },
  {
    type: "carte_credit",
    severity: "high",
    // 13 à 19 chiffres avec séparateurs optionnels. Filtre Luhn obligatoire.
    regex: /\b(?:\d[\s-]?){12,18}\d\b/g,
    validate: (m) => {
      const d = digitsOnly(m[0]);
      return d.length >= 13 && d.length <= 19 && isValidLuhn(d);
    },
  },
  {
    type: "nas",
    severity: "high",
    // 9 chiffres avec séparateurs optionnels (espace, tiret).
    regex: /\b\d{3}[\s-]?\d{3}[\s-]?\d{3}\b/g,
    validate: (m) => isValidLuhn(digitsOnly(m[0])),
  },
  {
    type: "ramq",
    severity: "high",
    // Numéro d'assurance maladie du Québec : 4 lettres + 8 chiffres.
    // (3 premières lettres du nom + 1re du prénom, puis aaammjjxx)
    // Majuscules strictes (pas de flag /i) : sinon "avec 4111 1111" matcherait,
    // et la RAMQ apparaît toujours en majuscules dans tout document officiel.
    regex: /\b[A-Z]{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  },
];

/**
 * Scanne `text` et retourne la liste des fragments suspects.
 *
 * - Ne mute pas `text`.
 * - Le span est en indices d'unités de code UTF-16 (cohérent avec `string.length`).
 * - Les findings sont triés par position ascendante.
 */
export function detectLeaks(text: string): Finding[] {
  if (typeof text !== "string" || text.length === 0) return [];

  const findings: Finding[] = [];

  for (const rule of RULES) {
    // Reset à chaque règle : on partage l'état stateful avec /g.
    rule.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.regex.exec(text)) !== null) {
      // Garde-fou contre regex zéro-largeur qui boucleraient à l'infini.
      if (m[0].length === 0) {
        rule.regex.lastIndex++;
        continue;
      }
      if (rule.validate && !rule.validate(m)) continue;
      const start = m.index;
      const end = start + m[0].length;
      findings.push({
        type: rule.type,
        span: [start, end],
        snippet: m[0],
        severity: rule.severity,
      });
    }
  }

  findings.sort((a, b) => a.span[0] - b.span[0]);
  return findings;
}

/** Résumé par type pour affichage UI ("3 NAS, 1 courriel, 1 téléphone"). */
export function summarize(findings: Finding[]): Partial<Record<LeakType, number>> {
  const out: Partial<Record<LeakType, number>> = {};
  for (const f of findings) {
    out[f.type] = (out[f.type] ?? 0) + 1;
  }
  return out;
}
