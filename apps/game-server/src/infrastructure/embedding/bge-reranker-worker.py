#!/usr/bin/env python3
"""Optional BGE cross-encoder reranker worker (D17).

Not wired into production until D21 gate passes (see embedding-profiles/
bge-reranker-v2-m3-v1.json). Game-server only invokes this when
production_enabled is true; otherwise Core keeps hybrid vectorScores.

Loads weights from a local snapshot (--model-path). Never downloads from the
hub (HF_HUB_OFFLINE). XLM-R does not need trust_remote_code.
"""
import argparse
import json
import os
import time
from pathlib import Path

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", required=True)
    parser.add_argument("--model-path", required=True,
                        help="Local snapshot directory (no hub download)")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--metrics-out", required=True)
    args = parser.parse_args()
    profile = json.loads(Path(args.profile).read_text(encoding="utf-8"))
    if profile.get("schema") != "world_knowledge_reranker_profile_v1":
        raise ValueError("unsupported reranker profile")
    if profile.get("model_id") != "BAAI/bge-reranker-v2-m3":
        raise ValueError("unsupported reranker model")
    model_path = Path(args.model_path)
    if not model_path.is_dir() or not (model_path / "config.json").is_file():
        raise FileNotFoundError(f"local reranker snapshot missing: {model_path}")
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
    payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
    query = payload["query"]
    candidates = payload["candidates"]
    pairs = [[query, entry["text"]] for entry in candidates]
    started = time.perf_counter()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    # Local snapshot only; XLM-R base needs no trust_remote_code.
    tokenizer = AutoTokenizer.from_pretrained(str(model_path),
                                              local_files_only=True)
    model = AutoModelForSequenceClassification.from_pretrained(
        str(model_path), local_files_only=True).to(device).eval()
    loaded = time.perf_counter()
    scores = []
    with torch.inference_mode():
        for offset in range(0, len(pairs), 8):
            batch = pairs[offset:offset + 8]
            encoded = tokenizer(batch, padding=True, truncation=True,
                                max_length=512, return_tensors="pt")
            encoded = {key: value.to(device) for key, value in encoded.items()}
            logits = model(**encoded).logits.view(-1).float().cpu().tolist()
            scores.extend(logits)
    result = {
        "scores": [
            {"claim_ref": entry["claim_ref"], "score": float(score)}
            for entry, score in zip(candidates, scores)
        ]
    }
    Path(args.output).write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8")
    Path(args.metrics_out).write_text(json.dumps({
        "device": device,
        "candidate_count": len(candidates),
        "model_load_ms": round((loaded - started) * 1000, 3),
        "score_ms": round((time.perf_counter() - loaded) * 1000, 3),
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
