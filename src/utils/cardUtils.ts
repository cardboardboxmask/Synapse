import { Idea } from '../types/synapse';

/**
 * Normalizes text for similarity comparison (lowercased, stripped punctuation, normalized whitespace).
 */
function normalizeForComparison(str?: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks if two strings are identical or nearly identical (substring match or >80% overlap).
 */
function isNearlyIdentical(a?: string, b?: string): boolean {
  const normA = normalizeForComparison(a);
  const normB = normalizeForComparison(b);
  if (!normA || !normB) return false;
  if (normA === normB) return true;
  if (normA.length > 15 && normB.length > 15) {
    if (normA.includes(normB) || normB.includes(normA)) return true;
  }
  return false;
}

export interface DedupedCardContent {
  mainText: string;
  showHelp: boolean;
  helpText: string;
}

/**
 * Resolves an idea's card text, deduplicating summary, problem statement,
 * and help-needed fields if they repeat the same text.
 */
export function getDedupedCardContent(idea: {
  summary?: string;
  problem?: string;
  helpWanted?: string;
}): DedupedCardContent {
  const problem = (idea.problem || '').trim();
  const summary = (idea.summary || '').trim();
  const helpWanted = (idea.helpWanted || '').trim();

  // Primary text to display on the card: prefer problem if descriptive, else summary
  const mainText = problem || summary || 'No description provided.';

  // Check if helpWanted is identical or nearly identical to the problem or summary
  const isHelpRedundant =
    isNearlyIdentical(helpWanted, problem) ||
    isNearlyIdentical(helpWanted, summary);

  return {
    mainText,
    showHelp: Boolean(helpWanted && !isHelpRedundant),
    helpText: helpWanted,
  };
}
