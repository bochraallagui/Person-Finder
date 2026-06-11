import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { mongoSearch } from "@/lib/mongo.functions";
import { promptToFilter } from "@/lib/ai-search.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Search, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Recherche de personnes" },
      { name: "description", content: "Recherchez une personne en langage naturel." },
    ],
  }),
  component: Index,
});

type Personne = { _id?: string; nom?: string; prenom?: string; age?: number };

function Index() {
  const search = useServerFn(mongoSearch);
  const toFilter = useServerFn(promptToFilter);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Personne[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const examples = [
    { label: "Tous les Marc", query: "toutes les personnes qui s'appellent Marc" },
    { label: "Plus de 30 ans", query: "les gens de plus de 30 ans" },
    { label: "Entre 20 et 25 ans", query: "personnes entre 20 et 25 ans" },
    { label: "Jean Dupont", query: "Jean Dupont" },
    { label: "Tout afficher", query: "affiche tout le monde" },
  ];

  async function runSearch(filter: Record<string, unknown>) {
    setLoading(true);
    setError(null);
    try {
      const res = await search({ data: { collection: "personnes", filter, limit: 200 } });
      setResults((res.data as Personne[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  async function runPrompt(prompt: string) {
    const cleaned = prompt.trim();
    if (!cleaned) {
      await runSearch({});
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { filterJson } = await toFilter({ data: { prompt: cleaned } });
      const filter = JSON.parse(filterJson) as { filter?: Record<string, unknown> };
      await runSearch(filter.filter ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResults([]);
      setLoading(false);
    }
  }

  useEffect(() => {
    void runSearch({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    await runPrompt(query);
  }

  async function applyExample(q: string) {
    setQuery(q);
    await runPrompt(q);
  }

  return (
    <main className="min-h-screen bg-background flex items-start justify-center px-4 py-16">
      <div className="w-full max-w-xl space-y-8">
        <header className="text-center space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Recherche de personnes
          </h1>
          <p className="text-sm text-muted-foreground">
                        Écrivez une demande en langage naturel — la requête est construite localement.

          </p>
        </header>

        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ex : les personnes de plus de 30 ans qui s'appellent Marc"
            className="flex-1"
          />
          <Button type="submit" disabled={loading}>
            <Search className="h-4 w-4 mr-2" />
            {loading ? "..." : "Chercher"}
          </Button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            Exemples :
          </span>
          {examples.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => applyExample(ex.query)}
              className="text-xs px-2.5 py-1 rounded-full border border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              {ex.label}
            </button>
          ))}
        </div>

        {error && (
          <Card className="p-4 text-sm text-destructive border-destructive">{error}</Card>
        )}

        {results !== null && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground text-center">
              {results.length} document(s) dans <span className="font-medium">personnes</span>
            </p>
            {results.length === 0 ? (
              <Card className="p-6 text-center text-muted-foreground">
                Aucune personne trouvée
              </Card>
            ) : (
              results.map((p, i) => (
                <Card key={String(p._id ?? i)} className="p-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-lg font-medium text-foreground">
                        {p.prenom} {p.nom}
                      </p>
                      <p className="text-sm text-muted-foreground">Nom : {p.nom}</p>
                      <p className="text-sm text-muted-foreground">Prénom : {p.prenom}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-semibold text-foreground">{p.age}</p>
                      <p className="text-xs text-muted-foreground">ans</p>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        )}
      </div>
    </main>
  );
}
