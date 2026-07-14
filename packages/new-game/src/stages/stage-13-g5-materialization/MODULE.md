# Stage 13 — g5-materialization

Code-only Stage 13 materializes G5 from approved profiles/rules with versioned RNG and trace. It never calls an LLM materializer and blocks on missing required candidates. LLM may run only the separate Stage 14 audit.
