/**
 * Text similarity functions.
 * Pure, no dependencies.
 */

/**
 * Normalizes text to improve similarity matching.
 * Removes accents, extra spaces, and converts to lowercase.
 */
export function normalizeStr(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD') // divide caracteres con acentos
    .replace(/[\u0300-\u036f]/g, '') // quita acentos
    .trim()
    .replace(/\s+/g, ' '); // colapsa multiples espacios
}

/**
 * Normalized Levenshtein similarity: 1.0 = identical, 0.0 = completely different.
 */
export function levenshteinSimilarity(a: string, b: string): number {
  const normA = normalizeStr(a);
  const normB = normalizeStr(b);
  if (normA === normB) return 1;
  if (normA.length === 0 || normB.length === 0) return 0;

  const m = normA.length;
  const n = normB.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (normA[i - 1] === normB[j - 1]) {
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
  const normA = normalizeStr(a);
  const normB = normalizeStr(b);
  if (normA === normB) return 1;
  const bigrams = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };

  const setA = bigrams(normA);
  const setB = bigrams(normB);
  if (setA.size === 0 && setB.size === 0) {
    return normA === normB && normA.length > 0 ? 1 : 0;
  }
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const bg of setA) if (setB.has(bg)) intersection++;

  return intersection / (setA.size + setB.size - intersection);
}

/**
 * Combined similarity: weighted average. 
 * Levenshtein is better for short IDs/SKUs.
 * Jaccard is better for longer descriptions.
 */
export function combinedSimilarity(a: string, b: string): number {
  const maxLength = Math.max(a.length, b.length);
  const levWeight = maxLength < 10 ? 0.7 : 0.4;
  const jacWeight = 1 - levWeight;
  
  return (levenshteinSimilarity(a, b) * levWeight) + (jaccardSimilarity(a, b) * jacWeight);
}
