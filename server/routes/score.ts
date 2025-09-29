import type { RequestHandler } from "express";
import { ScoreRequest, ScoreResponse, ScoreCategory } from "@shared/api";

const fetchAny: any = (globalThis as any).fetch;

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function computeHeuristicScores(text: string): { categories: ScoreCategory[]; total: number; rfProb: number; classification: boolean; classificationLabel: "True" | "False" } {
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/);
  const lengthScore = Math.max(0, Math.min(100, Math.log10(text.length + 1) * 20));

  const evidenceKeywords = ["figure", "table", "experiment", "evaluate", "metric", "benchmark", "ablation", "confidence", "p-value", "significant", "dataset", "results", "study", "data", "method"];
  const biasWords = ["always", "never", "completely", "totally", "only", "worst", "best", "amazing", "horrible", "must", "everyone", "no one"];
  const contractions = ["can't", "won't", "n't", "it's", "i'm", "he's", "she's", "they're", "we're"];

  const sentences = text.split(/[.!?]+\s/).filter((s) => s.trim().length > 0);
  const avgSentenceLength = sentences.length ? text.split(/\s+/).length / sentences.length : 0;
  const readability = Math.max(0, Math.min(100, 100 - Math.abs(22 - avgSentenceLength) * 5));


  const evidenceScore = Math.min(100, evidenceKeywords.reduce((acc, k) => acc + (lower.includes(k) ? 8 : 0), 0));
  const biasHits = biasWords.reduce((acc, k) => acc + (lower.match(new RegExp(`\\b${k.replace(/[-/\\^$*+?.()|[\\]{}]/g, "\\$&")}\\b`, "g"))?.length || 0), 0);
  const contractionsHits = contractions.reduce((acc, k) => acc + (lower.match(new RegExp(k.replace(/[-/\\^$*+?.()|[\\]{}]/g, "\\$&"), "g"))?.length || 0), 0);

  const emotionalWords = ["shocking", "unbelievable", "incredible", "disaster", "scandal", "outrage", "amazing", "horrible"];
  const emotionalCount = emotionalWords.reduce((acc, k) => acc + (lower.includes(k) ? 1 : 0), 0);

  const topics = (lower.match(/\b(computer|technology|politics|economics|science|culture|health|business)\b/g) || []);
  const topicConsistency = topics.length ? new Set(topics).size / topics.length : 0;

  // Map to 12 rubric criteria, 0..100
  const metrics: Record<string, number> = {
    "Factual Accuracy": Math.round(Math.min(100, evidenceScore)),
    "Author Credibility": Math.round(Math.min(100, (lower.includes("by ") ? 70 : 40))),
    "Emotional Language": Math.max(0, 100 - emotionalCount * 15),
    "Extreme Statements": Math.max(0, 100 - biasHits * 10),
    "Objectivity": Math.max(0, Math.min(100, 100 - (words.filter((w) => w.endsWith("ly") || w.endsWith("ive")).length / Math.max(1, words.length)) * 4000)),
    "Language Style": Math.max(0, 100 - Math.min(100, contractionsHits * 20)),
    "Sentence Complexity": Math.max(0, Math.min(100, 100 - Math.abs(22 - avgSentenceLength) * 4)),
    "Topic Consistency": Math.round(topicConsistency * 100),
    "Readability": Math.round(readability),
    "Balanced Coverage": Math.min(100, 50 + ["however", "but ", "on the other hand", "both"].reduce((a, k) => a + (lower.includes(k) ? 12 : 0), 0)),
    "Bias": Math.max(0, 100 - Math.min(100, biasHits * 12)),
  };

  const n = Object.keys(metrics).length; // now 11 metrics (Source Reliability removed)
  const catWeight = 0.7 / n; // each category contributes equally within 70%
  const categories: ScoreCategory[] = Object.entries(metrics).map(([label, score]) => ({
    id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$|/g, ""),
    label,
    weight: catWeight,
    score: Math.round(score),
    details: undefined,
  }));

  const avg0to1 = Object.values(metrics).reduce((a, v) => a + v, 0) / (n * 100);
  const rfProb = Math.min(1, Math.max(0, (metrics["Factual Accuracy"] + metrics["Balanced Coverage"]) / 200));
  const combined = 0.7 * avg0to1 + 0.3 * rfProb;
  const total = Math.round(combined * 100);
  const classification = combined >= 0.6;

  return { categories, total, rfProb, classification, classificationLabel: classification ? "True" : "False" };
}

export const handleScore: RequestHandler = async (req, res) => {
  try {
    const body = req.body as ScoreRequest;
    if (!body?.url || typeof body.url !== "string") {
      return res.status(400).json({ error: "Missing 'url'" });
    }

    const PY_API = process.env.PYTHON_API_URL; // e.g. https://your-python-service/score

    if (PY_API) {
      const pyRes = await fetchAny(PY_API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: body.url }),
      }).catch((err: any) => ({ ok: false, status: 502, text: () => Promise.resolve(String(err)) }));

      if ((pyRes as any).ok) {
        const data: ScoreResponse = await (pyRes as any).json();
        return res.json(data);
      } else {
        const txt = await (pyRes as any).text();
        console.error("Python API error:", txt);
        // Continue with heuristic fallback below
      }
    }

    const pageRes = await fetchAny(body.url, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
      },
    }).catch(() => null);
    if (!pageRes || !(pageRes as any).ok) {
      return res.status(502).json({ error: "Failed to fetch article URL" });
    }
    const html = await (pageRes as any).text();
    const text = stripHtml(html);
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1] : undefined;

    const { categories, total, rfProb, classification, classificationLabel } = computeHeuristicScores(text);

    const response: ScoreResponse = {
      url: body.url,
      title,
      categories,
      total,
      modelVersion: PY_API ? "python-external" : "heuristic-fallback",
      rfProb,
      classification,
      classificationLabel,
      notes: PY_API ? undefined : "No PYTHON_API_URL configured; used server heuristic.",
    };

    res.json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unexpected error" });
  }
};
