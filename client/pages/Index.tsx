import { useState } from "react";
import { Button } from "@/components/ui/button";
import RubricCard from "@/components/rubric/RubricCard";
import type { ScoreResponse } from "@shared/api";

export default function Index() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScoreResponse | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!/^https?:\/\//i.test(url)) {
      setError("Enter a valid http(s) URL");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as ScoreResponse;
      setResult(data);
    } catch (err: any) {
      setError(err?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero */}
      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(1200px_600px_at_20%_-10%,hsl(var(--primary)/0.12),transparent),radial-gradient(900px_500px_at_120%_10%,hsl(var(--accent)/0.12),transparent)]" />
        <div className="container py-14 md:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl">
              Article Scorer — ML‑powered rubric
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Paste a link to an article. We compute rubric scores across 11 criteria (Factual Accuracy, Author Credibility, Emotional Language, Extreme Statements, Objectivity, Language Style, Sentence Complexity, Topic Consistency, Readability, Balanced Coverage, Bias) and show a breakdown.
            </p>
            <form onSubmit={handleSubmit} className="mt-8 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <input
                className="h-12 w-full rounded-md border bg-background px-4 text-base outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="https://example.com/article"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                inputMode="url"
              />
              <Button type="submit" size="lg" disabled={loading} className="sm:ml-2">
                {loading ? "Scoring…" : "Score Article"}
              </Button>
            </form>
            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
            {result && (
              <p className="mt-3 text-sm text-muted-foreground">Model: {result.modelVersion || "unknown"}{result.title ? ` · ${result.title}` : ""}</p>
            )}
          </div>
        </div>
      </section>

      {/* Results */}
      {result && (
        <section className="container pb-24">
          <div className="mb-6 rounded-2xl border bg-card p-6 shadow-sm md:p-8">
            <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
              <div>
                <h2 className="text-2xl font-semibold">Scores</h2>
                <p className="text-sm text-muted-foreground">{result.url}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-xl border bg-background px-4 py-2 text-sm">
                  Overall
                  <span className="ml-2 text-2xl font-bold">{Math.round(result.total)}</span>
                  <span className="ml-1 text-muted-foreground">/100</span>
                </div>
                {(() => {
                  const t = Math.round(result.total);
                  let text = "";
                  if (t <= 20) text = "Don't trust this website";
                  else if (t <= 50) text = "Proceed with caution";
                  else if (t <= 70) text = "Trustworthy";
                  else text = "Almost certainly true";
                  return (
                    <div className="rounded-xl border bg-background px-4 py-2 text-sm">
                      Verdict
                      <span className="ml-2 text-2xl font-bold">{text}</span>
                    </div>
                  );
                })()}
              </div>
            </div>
            <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {result.categories.map((c) => (
                <RubricCard key={c.id} label={c.label} score={c.score} weight={c.weight} details={c.details} />
              ))}
              {typeof result.rfProb === "number" && (
                <RubricCard
                  key="rf-prob"
                  label="Random Forest"
                  score={Math.round(result.rfProb * 100)}
                  weight={0.3}
                  details="Binary prediction (threshold 0.5)"
                  displayBinary
                />
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
