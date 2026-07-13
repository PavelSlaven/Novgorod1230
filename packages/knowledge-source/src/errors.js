export class KnowledgeSourceError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'KnowledgeSourceError';
    this.code = String(code);
    this.details = details == null ? null : structuredClone(details);
  }
}

export function knowledgeSourceError(code, message, details = null) {
  return new KnowledgeSourceError(code, message, details);
}
