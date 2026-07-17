// Lightweight language detection for zh / en / ms (PRD §6.1). Heuristic, no deps:
// CJK block => zh; otherwise pick between Malay and English by common-word ratio.

const MS_MARKERS = new Set([
  'saya', 'anda', 'tidak', 'boleh', 'sila', 'terima', 'kasih', 'akaun', 'maklumat',
  'bantuan', 'masalah', 'permainan', 'wang', 'tolong', 'macam', 'mana', 'kenapa',
  'sudah', 'belum', 'dengan', 'untuk', 'dan', 'yang', 'ini', 'itu', 'manusia',
]);

export type Lang = 'zh' | 'en' | 'ms';

export function detectLanguage(text: string): Lang {
  if (/[一-鿿㐀-䶿]/.test(text)) return 'zh';

  const words = text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  if (words.length === 0) return 'en';

  let ms = 0;
  for (const w of words) if (MS_MARKERS.has(w)) ms++;
  // If a meaningful fraction of tokens are Malay markers, call it Malay.
  if (ms >= 1 && ms / words.length >= 0.15) return 'ms';
  return 'en';
}
