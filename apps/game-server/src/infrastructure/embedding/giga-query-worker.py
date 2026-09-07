import argparse
import json
import sys
from pathlib import Path

import torch
import torch.nn.functional as functional
from transformers import AutoModel, AutoTokenizer


parser = argparse.ArgumentParser()
parser.add_argument("--profile", required=True)
args = parser.parse_args()
profile = json.loads(Path(args.profile).read_text(encoding="utf-8"))
if (profile.get("embedding_profile_ref")
        != "wk-embedding:giga-480m-0826:v1"
        or profile.get("model_revision")
        != "0c94f705aa35719324fb46f7e75b0a5c275da6e4"
        or profile.get("dimension") != 1024
        or profile.get("pooling") != "mean"
        or profile.get("normalization") != "l2"):
    raise ValueError("unsupported embedding profile")

device = "cuda" if torch.cuda.is_available() else "cpu"
dtype = torch.bfloat16 if device == "cuda" else torch.float32
tokenizer = AutoTokenizer.from_pretrained(
    profile["model_id"], revision=profile["model_revision"],
    trust_remote_code=True, local_files_only=True)
model = AutoModel.from_pretrained(
    profile["model_id"], revision=profile["model_revision"],
    trust_remote_code=True, local_files_only=True,
    dtype=dtype).to(device).eval()
print(json.dumps({"ready": True, "device": device}), flush=True)

for line in sys.stdin:
    request = {}
    try:
        request = json.loads(line)
        if request.get("op") == "close":
            break
        text = request["text"]
        if not isinstance(text, str) or not text.strip() or len(text) > 8000:
            raise ValueError("invalid query text")
        query = profile["query_format"].replace(
            "{task}", "Find factual premises relevant to this game situation.")
        query = query.replace("{text}", text)
        encoded = tokenizer([query], return_tensors="pt", padding=True,
                            truncation=True, max_length=256)
        encoded = {key: value.to(device) for key, value in encoded.items()}
        with torch.inference_mode():
            hidden = model(**encoded).last_hidden_state
            mask = encoded["attention_mask"].unsqueeze(-1).to(hidden.dtype)
            pooled = (hidden * mask).sum(1) / mask.sum(1).clamp(min=1e-6)
            vector = functional.normalize(pooled, dim=-1)[0].float().cpu()
        print(json.dumps({"id": request["id"], "vector": vector.tolist()}),
              flush=True)
    except Exception:
        print(json.dumps({"id": request.get("id") if isinstance(request, dict)
                          else None, "error": "encoding_failed"}), flush=True)
