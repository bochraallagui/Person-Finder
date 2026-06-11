import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SearchInput = z.object({
  collection: z.string().min(1).max(64),
  filter: z.record(z.string(), z.any()).optional().default({}),
  limit: z.number().int().min(1).max(200).optional().default(50),
});

type Doc = Record<string, unknown>;

// Évalue un filtre MongoDB-like côté Node (sécurité si le proxy ignore
// les filtres complexes et renvoie tous les documents).
function matchValue(docVal: unknown, cond: unknown): boolean {
  if (cond !== null && typeof cond === "object" && !Array.isArray(cond)) {
    const ops = cond as Record<string, unknown>;
    return Object.entries(ops).every(([op, v]) => {
      switch (op) {
        case "$eq": return docVal === v;
        case "$ne": return docVal !== v;
        case "$gt": return typeof docVal === "number" && typeof v === "number" && docVal > v;
        case "$gte": return typeof docVal === "number" && typeof v === "number" && docVal >= v;
        case "$lt": return typeof docVal === "number" && typeof v === "number" && docVal < v;
        case "$lte": return typeof docVal === "number" && typeof v === "number" && docVal <= v;
        case "$in": return Array.isArray(v) && v.some((x) =>
          typeof x === "string" && typeof docVal === "string"
            ? x.toLowerCase() === docVal.toLowerCase()
            : x === docVal);
        case "$nin": return Array.isArray(v) && !v.includes(docVal);
        case "$regex": {
          if (typeof docVal !== "string" || typeof v !== "string") return false;
          const flags = typeof ops.$options === "string" ? ops.$options : "i";
          try { return new RegExp(v, flags).test(docVal); } catch { return false; }
        }
        case "$options": return true;
        default: return false;
      }
    });
  }
  if (typeof cond === "string" && typeof docVal === "string") {
    return cond.toLowerCase() === docVal.toLowerCase();
  }
  return docVal === cond;
}

function matchDoc(doc: Doc, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === "$and") return Array.isArray(cond) && cond.every((c) => matchDoc(doc, c as Record<string, unknown>));
    if (key === "$or") return Array.isArray(cond) && cond.some((c) => matchDoc(doc, c as Record<string, unknown>));
    if (key === "$nor") return Array.isArray(cond) && !cond.some((c) => matchDoc(doc, c as Record<string, unknown>));
    return matchValue(doc[key], cond);
  });
}

export const mongoSearch = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SearchInput.parse(input))
  .handler(async ({ data }) => {
    // ──────────────────────────────────────────────────────────────────────
    // ⚠️ Utilisation directe de MongoDB SANS proxy
    // ──────────────────────────────────────────────────────────────────────
    // Le code ci-dessous passe par un proxy HTTP (`MONGO_PROXY_URL`) car
    // ce projet est déployé sur un runtime Worker (Cloudflare workerd) qui
    // ne supporte PAS le driver officiel `mongodb` (TCP brut, modules natifs).
    //
    // Si tu exécutes le projet en LOCAL avec Node (ex: `bun run dev` hors
    // Lovable) et que tu veux te connecter directement à MongoDB, remplace
    // tout le corps de ce handler par :
    //
    //   import { MongoClient } from "mongodb"; // en haut du fichier
    //   const client = new MongoClient(process.env.MONGODB_URI!);
    //   await client.connect();
    //   const db = client.db(process.env.MONGODB_DATABASE!);
    //   const docs = await db
    //     .collection(data.collection)
    //     .find(data.filter ?? {})
    //     .limit(data.limit)
    //     .toArray();
    //   return { data: docs };
    //
    // ⚠️ Cette version NE fonctionnera PAS sur Lovable / Cloudflare Workers
    // (erreur: "net is not implemented" ou "Cannot find module 'mongodb'").
    // Garde le proxy tant que tu déploies sur Lovable.
    // ──────────────────────────────────────────────────────────────────────
    const url = process.env.MONGO_PROXY_URL;
    const key = process.env.MONGO_PROXY_API_KEY;
    if (!url || !key) throw new Error("MONGO_PROXY_URL / MONGO_PROXY_API_KEY missing");

    const res = await fetch(`${url.replace(/\/$/, "")}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(data),
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Proxy ${res.status}: ${text.slice(0, 300)}`);
    }
    const json = JSON.parse(text) as { data: unknown };
    const raw = (json.data ?? []) as Doc[];
    const filter = (data.filter ?? {}) as Record<string, unknown>;
    const hasFilter = Object.keys(filter).length > 0;
    const filtered = hasFilter ? raw.filter((d) => matchDoc(d, filter)) : raw;
    return { data: filtered.slice(0, data.limit) as Array<Record<string, string | number | boolean | null>> };
  }); 