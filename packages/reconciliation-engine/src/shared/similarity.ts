/**
 * Text similarity functions.
 * Pure, no dependencies.
 */

/**
 * Normalized Levenshtein similarity: 1.0 = identical, 0.0 = completely different.
 */
export function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  const distance = dp[m][n];
  return 1 - distance / Math.max(m, n);
}

/**
 * Jaccard similarity over character bigrams.
 * Faster than Levenshtein for short strings, good for product titles.
 */
export function jaccardSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const bigrams = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };

  const setA = bigrams(a);
  const setB = bigrams(b);
  if (setA.size === 0 && setB.size === 0) return 1;

  let intersection = 0;
  for (const bg of setA) if (setB.has(bg)) intersection++;

  return intersection / (setA.size + setB.size - intersection);
}

/**
 * Combined similarity: average of Levenshtein and Jaccard.
 */
export function combinedSimilarity(a: string, b: string): number {
  return (levenshteinSimilarity(a, b) + jaccardSimilarity(a, b)) / 2;
}
