import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({ prompt: z.string().min(1).max(500) });

// Parseur local basé sur des règles — aucune clé API requise.
// Reconnaît : "plus de N", "moins de N", "entre A et B", âge exact "N ans",
// "tout / tous / tout le monde", et les noms/prénoms (mots capitalisés ou
// après "appelle/appelles/nommé/prénom/nom").

const STOPWORDS = new Set([
  "le","la","les","un","une","des","de","du","d","l","et","ou","qui","que",
  "se","s","appelle","appelles","appellent","nomme","nommé","nommée","nommés",
  "prénom","prenom","nom","personne","personnes","gens","tout","tous","toutes",
  "monde","afficher","affiche","montre","cherche","chercher","trouve","trouver",
  "plus","moins","entre","ans","an","age","âge","a","est","sont","ayant",
  "avec","ceux","celles","ceux-ci",
]);

function buildNameClause(value: string) {
  const lower = value.toLowerCase();
  const upper = value.toUpperCase();
  const cap = lower.charAt(0).toUpperCase() + lower.slice(1);
  const variants = Array.from(new Set([value, lower, upper, cap]));
  return {
    $or: [
      { nom: { $in: variants } },
      { prenom: { $in: variants } },
    ],
  };
}


function parsePrompt(raw: string): Record<string, unknown> {
  const text = raw.trim();
  if (!text) return {};
  const lower = text.toLowerCase();

  if (/\b(tout( le monde)?|tous|toutes)\b/.test(lower)) return {};

  const clauses: Record<string, unknown>[] = [];

  // Âge
  const between = lower.match(/entre\s+(\d{1,3})\s+et\s+(\d{1,3})/);
  const moreThan = lower.match(/plus\s+de\s+(\d{1,3})/);
  const lessThan = lower.match(/moins\s+de\s+(\d{1,3})/);
  const exact = lower.match(/(\d{1,3})\s*ans?\b/);

  if (between) {
    clauses.push({ age: { $gte: Number(between[1]), $lte: Number(between[2]) } });
  } else if (moreThan) {
    clauses.push({ age: { $gt: Number(moreThan[1]) } });
  } else if (lessThan) {
    clauses.push({ age: { $lt: Number(lessThan[1]) } });
  } else if (exact) {
    clauses.push({ age: Number(exact[1]) });
  }

  // Noms / prénoms : mots qui ne sont pas des stopwords et pas des nombres
  const words = text.split(/[\s,;!?'’.()]+/).filter(Boolean);
  const names: string[] = [];
  for (const w of words) {
    if (/^\d+$/.test(w)) continue;
    const low = w.toLowerCase();
    if (STOPWORDS.has(low)) continue;
    if (w.length < 2) continue;
    names.push(w);
  }
  for (const n of names) clauses.push(buildNameClause(n));

  if (clauses.length === 0) return {};
  if (clauses.length === 1) return clauses[0];
  return { $and: clauses };
}

export const promptToFilter = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const filter = parsePrompt(data.prompt);
    return { filterJson: JSON.stringify({ filter }) };
  });