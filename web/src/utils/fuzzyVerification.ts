/**
 * Smart Fuzzy & Semantic Relation Verification for SafeKeep
 *
 * Compares claimant's response with finder's expected answer.
 * Handles:
 * - Case insensitivity & punctuation stripping
 * - Fillers & stop-words ("it's a", "there is a", "on the back")
 * - Word order differences ("blue star sticker" vs "sticker of a blue star")
 * - Typos & spelling errors via normalized Levenshtein distance ("carabener" vs "carabiner")
 * - Substring and token set containment
 * - Compact space-free containment ("spider-man" vs "spiderman")
 * - Character n-gram (Dice similarity)
 */

export function cleanText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function levenshteinDistance(s1: string, s2: string): number {
  if (s1 === s2) return 0
  if (s1.length === 0) return s2.length
  if (s2.length === 0) return s1.length

  const m = s1.length
  const n = s2.length
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  let curr = new Array(n + 1)

  for (let i = 1; i <= m; i++) {
    curr[0] = i
    const c1 = s1.charCodeAt(i - 1)
    for (let j = 1; j <= n; j++) {
      const c2 = s2.charCodeAt(j - 1)
      const cost = c1 === c2 ? 0 : 1
      curr[j] = Math.min(
        curr[j - 1] + 1,       // insertion
        prev[j] + 1,           // deletion
        prev[j - 1] + cost     // substitution
      )
    }
    const temp = prev
    prev = curr
    curr = temp
  }
  return prev[n]
}

export function tokenSimilarity(w1: string, w2: string): number {
  if (w1 === w2) return 1.0
  if (lenGte4(w1) && lenGte4(w2)) {
    if (w1.startsWith(w2) || w2.startsWith(w1)) return 0.92
    if (w1.endsWith(w2) || w2.endsWith(w1)) return 0.90
  }
  const maxLen = Math.max(w1.length, w2.length)
  if (maxLen === 0) return 1.0
  const dist = levenshteinDistance(w1, w2)
  return 1.0 - dist / maxLen
}

function lenGte4(s: string): boolean {
  return s.length >= 4
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'it', 'its', 'is', 'are', 'was', 'were',
  'has', 'have', 'had', 'with', 'on', 'in', 'at', 'to', 'for', 'of',
  'and', 'or', 'my', 'your', 'this', 'that', 'there',
  'some', 'one', 'side', 'back', 'front', 'attached', 'like', 'i',
  'think', 'got', 'has', 'here'
])

export function extractKeyTokens(text: string): string[] {
  const cleaned = cleanText(text)
  const tokens = cleaned.split(' ').filter(Boolean)
  const filtered = tokens.filter((t) => !STOP_WORDS.has(t))
  return filtered.length > 0 ? filtered : tokens
}

export function diceBigramSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0
  if (s1.length < 2 || s2.length < 2) return 0.0

  const getBigrams = (str: string) => {
    const bigrams = new Map<string, number>()
    for (let i = 0; i < str.length - 1; i++) {
      const bg = str.substring(i, i + 2)
      bigrams.set(bg, (bigrams.get(bg) || 0) + 1)
    }
    return bigrams
  }

  const bg1 = getBigrams(s1)
  const bg2 = getBigrams(s2)
  let intersection = 0
  for (const [bg, count1] of bg1.entries()) {
    const count2 = bg2.get(bg) || 0
    intersection += Math.min(count1, count2)
  }

  const total = (s1.length - 1) + (s2.length - 1)
  return (2.0 * intersection) / total
}

export interface VerificationEvaluation {
  verified: boolean
  score: number
  matchType: string
}

export function verifyAnswerRelation(expected: string, provided: string): VerificationEvaluation {
  const cleanExp = cleanText(expected)
  const cleanProv = cleanText(provided)

  if (!cleanExp || !cleanProv) {
    return { verified: false, score: 0, matchType: 'empty' }
  }

  // 1. Direct equality
  if (cleanExp === cleanProv) {
    return { verified: true, score: 1.0, matchType: 'exact' }
  }

  // 2. Direct containment (one contains the other)
  if (cleanProv.includes(cleanExp)) {
    return { verified: true, score: 1.0, matchType: 'contains_expected' }
  }

  if (cleanExp.includes(cleanProv) && cleanProv.length >= 3) {
    // Expected "yellow pikachu sticker", provided "pikachu" or "pikachu sticker"
    return { verified: true, score: 0.92, matchType: 'contained_in_expected' }
  }

  // 3. Compact space-free check ("spider-man" / "spider man" vs "spiderman")
  const compactExp = cleanExp.replace(/\s+/g, '')
  const compactProv = cleanProv.replace(/\s+/g, '')
  if (compactExp === compactProv) {
    return { verified: true, score: 0.98, matchType: 'compact_exact' }
  }
  if (compactProv.includes(compactExp) || (compactExp.includes(compactProv) && compactProv.length >= 4)) {
    return { verified: true, score: 0.92, matchType: 'compact_contains' }
  }

  // 4. Token coverage with fuzzy word matching
  const expTokens = extractKeyTokens(cleanExp)
  const provTokens = extractKeyTokens(cleanProv)

  let matchedTokens = 0
  for (const et of expTokens) {
    let bestSim = 0
    for (const pt of provTokens) {
      const sim = tokenSimilarity(et, pt)
      if (sim > bestSim) bestSim = sim
    }
    // Threshold 0.75 allows 1-2 character typos (e.g. carabener -> carabiner)
    if (bestSim >= 0.75) {
      matchedTokens++
    }
  }

  const coverage = matchedTokens / expTokens.length

  // If 1 key token: must match
  // If 2 key tokens: both must match (e.g. 'yellow' + 'sticker' required to prevent guessing generic object noun)
  // If 3+ key tokens: at least 2 matches and >= 60% coverage
  if (expTokens.length === 1) {
    if (matchedTokens === 1) {
      return { verified: true, score: coverage, matchType: 'fuzzy_token_coverage' }
    }
  } else if (expTokens.length === 2) {
    if (matchedTokens === 2) {
      return { verified: true, score: coverage, matchType: 'fuzzy_token_coverage' }
    }
  } else {
    if (matchedTokens >= 2 && coverage >= 0.60) {
      return { verified: true, score: coverage, matchType: 'fuzzy_token_coverage' }
    }
  }

  // 5. Bigram Dice similarity on normalized string
  const bigramScore = diceBigramSimilarity(cleanExp, cleanProv)
  if (bigramScore >= 0.60) {
    return { verified: true, score: bigramScore, matchType: 'bigram_similarity' }
  }

  // 6. Overall whole-phrase Levenshtein similarity
  const phraseDist = levenshteinDistance(cleanExp, cleanProv)
  const maxPhraseLen = Math.max(cleanExp.length, cleanProv.length)
  const phraseSim = 1.0 - phraseDist / maxPhraseLen
  if (phraseSim >= 0.70) {
    return { verified: true, score: phraseSim, matchType: 'phrase_levenshtein' }
  }

  return { verified: false, score: Math.max(coverage, bigramScore, phraseSim), matchType: 'insufficient_match' }
}
