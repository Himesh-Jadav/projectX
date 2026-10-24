const secretPatterns = [
  /\bsk-[A-Za-z0-9_-]{10,}\b/i,
  /\bsk_(?:test|live)_[A-Za-z0-9_-]{4,}/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:password|passwd|passphrase|pwd)\s*[:=]\s*[^\s,;]{4,}/i,
  /\b(?:api[_ -]?key|access[_ -]?token|secret)\s*[:=]\s*[^\s,;]{8,}/i,
  /\b(?:gsk_|AIza|AQ\.)[A-Za-z0-9._-]{20,}\b/i,
  /\b[A-Za-z0-9_-]{32,}\b/
];

function hasCardLikeNumber(text) {
  const matches = text.match(/(?:\d[ -]?){13,19}/g) ?? [];
  return matches.some((value) => {
    const digits = value.replace(/\D/g, '').length;
    return digits >= 13 && digits <= 19;
  });
}

export function hasSecret(text) {
  return typeof text === 'string' && (hasCardLikeNumber(text) || secretPatterns.some((pattern) => pattern.test(text)));
}
