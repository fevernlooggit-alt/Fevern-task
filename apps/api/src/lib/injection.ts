// Prompt-injection guard (PRD §6.1): end-user content is DATA, never instructions.
// We strip role/tool/system directive patterns before templating user text into
// an LLM prompt. This is defence-in-depth alongside the system prompt itself.

const DIRECTIVE_PATTERNS: RegExp[] = [
  /^\s*(system|assistant|user|developer|tool)\s*:/gim,
  /<\/?\s*(system|assistant|user|tool|function[_-]?call|tools?)\b[^>]*>/gi,
  /\[(?:\/)?(?:INST|SYS|system|assistant)\]/gi,
  /```(?:system|tool|json_tool)[\s\S]*?```/gi,
  /\b(ignore|disregard|forget)\b[^.\n]{0,40}\b(previous|above|prior|earlier|all)\b[^.\n]{0,40}\b(instructions?|prompts?|rules?)\b/gi,
  /\byou\s+are\s+now\b[^.\n]{0,60}/gi,
  /\bnew\s+(system\s+)?instructions?\b[^.\n]{0,60}/gi,
];

export function sanitizeUserContent(input: string): string {
  let out = input;
  for (const re of DIRECTIVE_PATTERNS) out = out.replace(re, '[filtered]');
  // Collapse excessive whitespace introduced by redaction.
  return out.replace(/\n{3,}/g, '\n\n').trim();
}
