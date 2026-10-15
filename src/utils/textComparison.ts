/**
 * Text comparison utilities to avoid repetition on Idea Cards.
 * If an idea's summary, problem statement, and help-needed text are identical
 * or nearly identical, show only one of them on the card.
 */

export function normalizeTextForComparison(text?: string | null): string {
  if (!text) return '';
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function isNearlyIdentical(textA?: string | null, textB?: string | null): boolean {
  const normA = normalizeTextForComparison(textA);
  const normB = normalizeTextForComparison(textB);

  if (!normA || !normB) return false;
  if (normA === normB) return true;

  // If one contains the other and length difference is minor (< 25%)
  if (normA.includes(normB) && normB.length / normA.length > 0.75) return true;
  if (normB.includes(normA) && normA.length / normB.length > 0.75) return true;

  return false;
}

export interface CardDisplayFields {
  summary: string;
  problem: string | null;
  helpWanted: string | null;
}

/**
 * Returns deduplicated card fields so that identical or nearly identical
 * problem statements or help-wanted text are omitted if they duplicate the summary.
 */
export function getDeduplicatedCardFields(idea: {
  summary?: string | null;
  problem?: string | null;
  helpWanted?: string | null;
}): CardDisplayFields {
  const summary = idea.summary?.trim() || '';
  const rawProblem = idea.problem?.trim() || '';
  const rawHelp = idea.helpWanted?.trim() || '';

  let problem: string | null = rawProblem || null;
  let helpWanted: string | null = rawHelp || null;

  // If problem is identical or nearly identical to summary, omit problem
  if (problem && isNearlyIdentical(problem, summary)) {
    problem = null;
  }

  // If helpWanted is identical or nearly identical to summary or problem, omit helpWanted
  if (helpWanted && (isNearlyIdentical(helpWanted, summary) || (problem && isNearlyIdentical(helpWanted, problem)))) {
    helpWanted = null;
  }

  return {
    summary: summary || problem || helpWanted || '',
    problem,
    helpWanted,
  };
}
