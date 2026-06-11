import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";

const {
  MONGODB_URI,
  MONGODB_DATABASE = "taskapp",
  PROXY_API_KEY,
  PORT = 3000,
} = process.env;

if (!MONGODB_URI) throw new Error("MONGODB_URI required");
if (!PROXY_API_KEY) throw new Error("PROXY_API_KEY required");

const client = new MongoClient(MONGODB_URI);
await client.connect();
const db = client.db(MONGODB_DATABASE);
console.log(`[proxy] connected to ${MONGODB_DATABASE}`);

const app = express();
app.use(cors());
app.use(express.json());

// Simple bearer auth
app.use((req, res, next) => {
  const auth = req.header("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (token !== PROXY_API_KEY) return res.status(401).json({ error: "unauthorized" });
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true }));

// POST /search { collection, filter, limit? }
app.post("/search", async (req, res) => {
  try {
    const { collection, filter = {}, limit = 50 } = req.body ?? {};
    if (!collection) return res.status(400).json({ error: "collection required" });
    const docs = await db.collection(collection).find(filter).limit(Math.min(limit, 200)).toArray();
    res.json({ data: docs });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e?.message ?? e) });
  }
});

app.listen(PORT, () => console.log(`[proxy] listening on ${PORT}`));