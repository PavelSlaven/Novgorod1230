import argparse
import json
import time
from pathlib import Path

import numpy as np
import psutil
import torch
import torch.nn.functional as functional
from transformers import AutoModel, AutoTokenizer


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--mode", choices=("document", "query"), required=True)
    parser.add_argument("--metrics-out", required=True)
    args = parser.parse_args()
    profile = json.loads(Path(args.profile).read_text(encoding="utf-8"))
    validate_profile(profile)
    values = json.loads(Path(args.input).read_text(encoding="utf-8"))
    texts = [entry["retrieval_text"] for entry in values]
    if args.mode == "query":
        task = "Find factual premises relevant to this game situation."
        texts = [profile["query_format"].replace("{task}", task)
                 .replace("{text}", text) for text in texts]
    started = time.perf_counter()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.bfloat16 if device == "cuda" else torch.float32
    tokenizer = AutoTokenizer.from_pretrained(
        profile["model_id"], revision=profile["model_revision"],
        trust_remote_code=True)
    model = AutoModel.from_pretrained(
        profile["model_id"], revision=profile["model_revision"],
        trust_remote_code=True, dtype=dtype).to(device).eval()
    loaded = time.perf_counter()
    vectors = []
    for offset in range(0, len(texts), 8):
        encoded = tokenizer(texts[offset:offset + 8], return_tensors="pt",
                            padding=True, truncation=True, max_length=256)
        encoded = {key: value.to(device) for key, value in encoded.items()}
        with torch.inference_mode():
            hidden = model(**encoded).last_hidden_state
            mask = encoded["attention_mask"].unsqueeze(-1).to(hidden.dtype)
            pooled = (hidden * mask).sum(1) / mask.sum(1).clamp(min=1e-6)
            vectors.append(functional.normalize(pooled, dim=-1).float().cpu())
    matrix = torch.cat(vectors).numpy().astype("<f4", copy=False)
    if matrix.shape != (len(texts), profile["dimension"]):
        raise ValueError("unexpected embedding shape")
    matrix.tofile(args.output)
    process = psutil.Process()
    metrics = {
        "device": device,
        "entry_count": len(texts),
        "dimension": int(matrix.shape[1]),
        "model_load_ms": round((loaded - started) * 1000, 3),
        "encoding_ms": round((time.perf_counter() - loaded) * 1000, 3),
        "peak_process_rss_bytes": process.memory_info().rss,
        "cuda_peak_allocated_bytes": (torch.cuda.max_memory_allocated()
                                      if device == "cuda" else 0),
    }
    Path(args.metrics_out).write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8")


def validate_profile(profile):
    if (profile.get("schema") != "world_knowledge_embedding_profile_v1"
            or profile.get("model_id")
            != "ai-sage/Giga-Embeddings-instruct-480M-0826"
            or profile.get("model_revision")
            != "0c94f705aa35719324fb46f7e75b0a5c275da6e4"
            or profile.get("dimension") != 1024
            or profile.get("normalization") != "l2"
            or profile.get("pooling") != "mean"):
        raise ValueError("unsupported embedding profile")


if __name__ == "__main__":
    main()
