/**
 * Utility for intelligent fuzzy searching across items with typo tolerance and score ranking.
 */

export interface FuzzyMatchResult<T> {
  item: T;
  score: number;
}

export function fuzzySearch<T>(
  items: T[],
  query: string,
  getTexts: (item: T) => (string | number | undefined | null)[]
): T[] {
  if (!query || !query.trim()) return items;

  const normalizedQuery = query.toLowerCase().trim();
  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);

  const scoredResults: FuzzyMatchResult<T>[] = [];

  for (const item of items) {
    const rawFields = getTexts(item);
    const searchString = rawFields
      .filter((f): f is string | number => f !== null && f !== undefined)
      .map(f => String(f).toLowerCase())
      .join(' ');

    if (!searchString) continue;

    let totalScore = 0;
    let matchesAllTokens = true;

    for (const token of queryTokens) {
      if (searchString.includes(token)) {
        // Exact substring match
        const tokenIdx = searchString.indexOf(token);
        totalScore += (tokenIdx === 0 ? 100 : 50) + token.length * 5;
      } else {
        // Subsequence fuzzy match
        let tokenIdx = 0;
        let subSeqMatches = 0;
        for (let i = 0; i < searchString.length && tokenIdx < token.length; i++) {
          if (searchString[i] === token[tokenIdx]) {
            tokenIdx++;
            subSeqMatches++;
          }
        }
        if (tokenIdx === token.length) {
          totalScore += 20 + subSeqMatches * 2;
        } else {
          matchesAllTokens = false;
          break;
        }
      }
    }

    if (matchesAllTokens && totalScore > 0) {
      scoredResults.push({ item, score: totalScore });
    }
  }

  scoredResults.sort((a, b) => b.score - a.score);
  return scoredResults.map(r => r.item);
}
