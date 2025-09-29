from __future__ import annotations

import os
import re
import tempfile
from typing import List, Dict, Any

import requests
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from bs4 import BeautifulSoup

# NLP/ML
import nltk
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize
from nltk.stem import WordNetLemmatizer
from nltk.sentiment.vader import SentimentIntensityAnalyzer
import joblib
from sklearn.feature_extraction.text import CountVectorizer

# Optional heavy libs
from transformers import pipeline  # zero-shot + NER
import textstat

# --- Config (env or defaults) ---
BOW_URL = os.getenv("BOW_URL", "https://drive.google.com/uc?export=download&id=1PdXhuiyPwSg6gwzpyruUC77HFP09lyZ6")
RF_URL = os.getenv("RF_URL", "https://drive.google.com/uc?export=download&id=1-0ZeAZJBdzbOCkVSxZQcVbneKNfE5mPO")

# --- Ensure NLTK data ---
for pkg in ["punkt", "stopwords", "wordnet", "omw-1.4", "vader_lexicon"]:
    try:
        nltk.data.find(pkg)
    except LookupError:
        nltk.download(pkg)

stop_words = set(stopwords.words("english"))
lemmatizer = WordNetLemmatizer()
sia = SentimentIntensityAnalyzer()

# Lazy pipelines (heavy)
_zero_shot = None
_ner = None

def zero_shot_model():
    global _zero_shot
    if _zero_shot is None:
        _zero_shot = pipeline("zero-shot-classification")
    return _zero_shot

def ner_model():
    global _ner
    if _ner is None:
        _ner = pipeline("ner", grouped_entities=True)
    return _ner

# --- Model loading ---
_cache_dir = os.getenv("MODEL_CACHE", tempfile.gettempdir())


def _download(url: str, out_path: str):
    if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
        return
    with requests.get(url, stream=True, timeout=60) as r:
        if r.status_code != 200:
            raise RuntimeError(f"Failed to download {url}: {r.status_code}")
        with open(out_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)


BOW_PATH = os.path.join(_cache_dir, "bow_vectorizer.pkl")
RF_PATH = os.path.join(_cache_dir, "random_forest_model.pkl")

_download(BOW_URL, BOW_PATH)
_download(RF_URL, RF_PATH)

# Load models
bow: CountVectorizer = joblib.load(BOW_PATH)
rf = joblib.load(RF_PATH)


# --- Helpers ---
class ScoreCategory(BaseModel):
    id: str
    label: str
    weight: float
    score: float
    details: str | None = None


class ScoreRequest(BaseModel):
    url: str


class ScoreResponse(BaseModel):
    url: str
    title: str | None = None
    categories: List[ScoreCategory]
    total: float
    rfProb: float | None = None  # 0..1
    classification: bool | None = None
    classificationLabel: str | None = None
    modelVersion: str | None = None
    notes: str | None = None


def fetch_article_from_url(url: str) -> (str, str | None):
    resp = requests.get(url, timeout=30)
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to fetch article URL")
    html = resp.text
    soup = BeautifulSoup(html, "html.parser")
    article_text = " ".join([p.get_text(" ", strip=True) for p in soup.find_all("p")])
    title_tag = soup.find("title")
    return article_text, title_tag.get_text(strip=True) if title_tag else None


def preprocess_text(text: str) -> str:
    text = text.lower()
    tokens = word_tokenize(text)
    tokens = [t for t in tokens if t.isalpha() and t not in stop_words]
    return " ".join(tokens)


def calculate_emotional_language(text: str) -> float:
    s = sia.polarity_scores(text)
    net = s.get("pos", 0) - s.get("neg", 0)
    scaled = (net + 1) / 2
    return max(0.0, min(1.0, scaled))


def calculate_objectivity(text_processed: str) -> float:
    words = text_processed.split()
    if not words:
        return 0.0
    adjectives = sum(1 for w in words if w.endswith("ly") or w.endswith("ive"))
    return max(0.0, min(1.0, 1 - adjectives / max(1, len(words))))


def detect_bias(text: str) -> float:
    keywords = {"always", "never", "completely", "totally", "only"}
    count = sum(1 for w in word_tokenize(text.lower()) if w in keywords)
    return 1 - min(1.0, count / 10.0)


def detect_extreme_statements(text: str) -> float:
    keywords = {"worst", "best", "amazing", "horrible"}
    count = sum(1 for w in word_tokenize(text.lower()) if w in keywords)
    return 1 - min(1.0, count / 5.0)


def calculate_readability(text: str) -> float:
    try:
        grade = textstat.flesch_kincaid_grade(text)
        scaled = grade / 20.0
        return max(0.0, min(1.0, 1 - abs(scaled - 0.5) * 2))
    except Exception:
        return 0.5


def calculate_topic_consistency(text: str) -> float:
    topics = re.findall(r"\b(computer|technology|politics|economics|science|culture|health|business)\b", text, flags=re.IGNORECASE)
    return (len(set(map(str.lower, topics))) / len(topics)) if topics else 0.0


def calculate_sentence_complexity(text: str, min_len: int = 1, max_len: int = 50) -> float:
    sentences = re.split(r"[.!?]+\s", text)
    lens = [len(s.split()) for s in sentences if s.strip()]
    if not lens:
        return 0.0
    avg = sum(lens) / len(lens)
    scaled = (avg - min_len) / (max_len - min_len)
    return max(0.0, min(1.0, scaled))


def measure_factual_accuracy(text: str) -> float:
    zs = zero_shot_model()
    res = zs(text, candidate_labels=["fact", "opinion"])
    labels = [l.lower() for l in res["labels"]]
    if "fact" in labels:
        return float(res["scores"][labels.index("fact")])
    return 0.5


def calculate_author_credibility(text: str) -> float:
    ner = ner_model()(text)
    people = sum(1 for e in ner if e.get("entity_group") == "PER")
    return min(people / 3.0, 1.0)


def measure_language_formality(text: str) -> float:
    contractions = re.findall(r"\b(can't|won't|n't|it's|i'm|he's|she's)\b", text.lower())
    return 1 - min(len(contractions) / 5.0, 1.0)


def calculate_balanced_coverage(text: str) -> float:
    zs = zero_shot_model()
    res = zs(text, candidate_labels=["balanced", "biased"], hypothesis_template="This article is {}.")
    labels = [l.lower() for l in res["labels"]]
    if "balanced" in labels:
        return float(res["scores"][labels.index("balanced")])
    return 0.5


# Source Reliability removed per request


def vectorize_text(text: str, vectorizer: CountVectorizer):
    return vectorizer.transform([text])


def predict_with_random_forest(text: str) -> float:
    vec = vectorize_text(text, bow)
    prob = rf.predict_proba(vec)[0][1]
    return float(prob)


def evaluate(text: str) -> Dict[str, float]:
    processed = preprocess_text(text)
    return {
        "Factual Accuracy": measure_factual_accuracy(text),
        "Author Credibility": calculate_author_credibility(text),
        "Emotional Language": calculate_emotional_language(text),
        "Extreme Statements": detect_extreme_statements(text),
        "Objectivity": calculate_objectivity(processed),
        "Language Style": measure_language_formality(text),
        "Sentence Complexity": calculate_sentence_complexity(text),
        "Topic Consistency": calculate_topic_consistency(text),
        "Readability": calculate_readability(text),
        "Balanced Coverage": calculate_balanced_coverage(text),
        "Bias": detect_bias(text),
    }


app = FastAPI(title="Article Rubric Scorer")


@app.post("/score", response_model=ScoreResponse)
def score(req: ScoreRequest):
    if not req.url or not req.url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Invalid url")

    text, title = fetch_article_from_url(req.url)
    if not text or len(text) < 100:
        raise HTTPException(status_code=422, detail="Article text too short")

    rubric = evaluate(text)
    rubric_vals = list(rubric.values())
    avg = sum(rubric_vals) / len(rubric_vals)
    rf_prob = predict_with_random_forest(text)

    combined = 0.7 * avg + 0.3 * rf_prob  # 0..1

    categories = []
    cat_weight = 0.7 / len(rubric)  # display weight: 70% split across rubric categories
    for k, v in rubric.items():
        categories.append(
            ScoreCategory(
                id=re.sub(r"[^a-z0-9]+", "-", k.lower()).strip("-"),
                label=k,
                weight=cat_weight,
                score=round(v * 100, 2),
                details=None,
            )
        )

    final_label = combined >= 0.6

    resp = ScoreResponse(
        url=req.url,
        title=title,
        categories=categories,
        total=round(combined * 100, 2),
        rfProb=round(rf_prob, 4),
        classification=final_label,
        classificationLabel="True" if final_label else "False",
        modelVersion="fastapi-rf-70-30",
        notes=None,
    )
    return resp


@app.get("/")
def health():
    return {"status": "ok", "bow": os.path.exists(BOW_PATH), "rf": os.path.exists(RF_PATH)}
