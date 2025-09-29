/**
 * Shared code between client and server
 */

export interface DemoResponse {
  message: string;
}

// Rubric scoring types
export interface ScoreCategory {
  id: string; // e.g. "relevance"
  label: string; // e.g. "Relevance"
  weight: number; // 0..1
  score: number; // 0..100
  details?: string;
}

export interface ScoreRequest {
  url: string;
}

export interface ScoreResponse {
  url: string;
  title?: string;
  categories: ScoreCategory[];
  total: number; // 0..100 weighted (70% rubric avg on 0..1 + 30% RF prob) scaled to 0..100
  // Optional extra fields when provided by Python service
  rfProb?: number; // 0..1
  classification?: boolean; // final True/False label as boolean
  classificationLabel?: "True" | "False";
  modelVersion?: string;
  notes?: string;
}
