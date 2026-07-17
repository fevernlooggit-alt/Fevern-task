import { prisma } from '../../db/prisma.js';
import type { KbSnippet } from './types.js';

// KB retrieval for EVA (PRD §6.2). Simple, dependency-free scoring that works for
// both CJK (no word boundaries) and Latin text. Non-`synced` articles are EXCLUDED
// from EVA retrieval (agents can still see them in the KB module).
//
// Interface seam: swap the in-memory scorer below for Postgres FTS or vector search
// without changing the retrieveKb() signature.

const CJK = /[㐀-鿿豈-﫿]/;

export function extractTerms(query: string): string[] {
  const terms = new Set<string>();

  // Latin / digit tokens of length >= 2.
  for (const w of query.toLowerCase().split(/[^a-z0-9]+/)) {
    if (w.length >= 2) terms.add(w);
  }

  // CJK runs → whole run + character bigrams (approximate segmentation).
  const runs = query.match(/[㐀-鿿豈-﫿]+/g) ?? [];
  for (const run of runs) {
    if (run.length >= 2) terms.add(run);
    for (let i = 0; i < run.length - 1; i++) terms.add(run.slice(i, i + 2));
    if (run.length === 1) terms.add(run);
  }

  return [...terms];
}

export async function retrieveKb(
  tenantId: string,
  query: string,
  limit = 3,
): Promise<KbSnippet[]> {
  const articles = await prisma.kbArticle.findMany({
    where: { tenantId, syncStatus: 'synced' },
    select: { id: true, title: true, bodyMd: true, tags: true },
  });
  if (articles.length === 0) return [];

  const terms = extractTerms(query);
  if (terms.length === 0) return [];

  const scored = articles
    .map((a) => {
      const title = a.title.toLowerCase();
      const body = a.bodyMd.toLowerCase();
      const tags = a.tags.join(' ').toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (title.includes(term)) score += 3;
        if (tags.includes(term)) score += 2;
        if (body.includes(term)) score += 1;
      }
      return { a, score };
    })
    .filter((s) => s.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);

  return scored.map(({ a }) => ({ id: a.id, title: a.title, body: a.bodyMd }));
}
