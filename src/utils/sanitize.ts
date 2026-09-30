import { IdeaStatus } from '../types/synapse';

/**
 * Reserved system handles that cannot be claimed by ordinary user accounts.
 */
export const RESERVED_USERNAMES = new Set([
  'admin',
  'admins',
  'administrator',
  'founder',
  'synapse',
  'support',
  'system',
  'root',
  'moderator',
  'mod',
  'api',
  'explore',
  'login',
  'logout',
  'profile',
  'showcase',
  'connections',
  'notifications',
  'about',
  'post',
  'ideas',
  'deleted',
  'deleted-user',
  'anonymous',
  'null',
  'undefined',
  'security',
  'help',
]);

/**
 * Sanitizes plain-text user input to prevent HTML, script, or attribute injection.
 */
export function sanitizeText(input: string, maxLength = 5000): string {
  if (!input) return '';
  return input
    .replace(/\0/g, '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<\/?[^>]+(>|$)/g, '')
    .replace(/(?:javascript|vbscript|data):/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim()
    .slice(0, maxLength);
}

/**
 * Sanitizes a tag string into a clean lowercase slug without leading '#'
 */
export function sanitizeTag(input: string): string {
  return sanitizeText(input, 32)
    .toLowerCase()
    .replace(/^#+/, '')
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 28);
}

/**
 * Normalizes a raw username string into a lowercase handle candidate.
 */
export function normalizeUsername(input: string): string {
  return sanitizeText(input, 40)
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
}

/**
 * Validates a username candidate against length, character set, and reserved system rules.
 */
export function validateUsername(
  rawInput: string,
  allowFounder = false
): { valid: boolean; normalized: string; error?: string } {
  const normalized = normalizeUsername(rawInput);
  if (normalized.length < 3) {
    return {
      valid: false,
      normalized,
      error: 'Username must be at least 3 characters long.',
    };
  }
  if (normalized.length > 30) {
    return {
      valid: false,
      normalized,
      error: 'Username must be 30 characters or fewer.',
    };
  }
  if (!/^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'Username may only contain lowercase letters, numbers, hyphens, and underscores, and must start and end with a letter or number.',
    };
  }
  if (!allowFounder && RESERVED_USERNAMES.has(normalized)) {
    return {
      valid: false,
      normalized,
      error: `@${normalized} is a reserved system handle and cannot be claimed.`,
    };
  }
  return { valid: true, normalized };
}

/**
 * Validates an external URL strictly allowing only safe http:// and https:// protocols.
 * Rejects javascript:, data:, vbscript:, file:, blob:, and embedded credentials.
 */
export function validateExternalUrl(input?: string): {
  valid: boolean;
  sanitized: string;
  error?: string;
} {
  if (!input || !input.trim()) {
    return { valid: true, sanitized: '' };
  }
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('file:') ||
    lower.startsWith('blob:')
  ) {
    return {
      valid: false,
      sanitized: '',
      error: 'Unsafe URL protocol rejected. Only https:// and http:// URLs are permitted.',
    };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return {
        valid: false,
        sanitized: '',
        error: 'Only https:// or http:// URLs are allowed.',
      };
    }
    if (parsed.username || parsed.password) {
      return {
        valid: false,
        sanitized: '',
        error: 'URLs containing embedded credentials are not allowed.',
      };
    }
    if (!parsed.hostname || !parsed.hostname.includes('.')) {
      return {
        valid: false,
        sanitized: '',
        error: 'Please enter a valid domain name (e.g. https://github.com/...).',
      };
    }
    return {
      valid: true,
      sanitized: parsed.toString().slice(0, 500),
    };
  } catch {
    return {
      valid: false,
      sanitized: '',
      error: 'Invalid URL format. Include https:// at the beginning.',
    };
  }
}

/**
 * Validates and cleans an optional http/https URL, returning empty string if invalid.
 */
export function sanitizeUrl(input?: string): string {
  const res = validateExternalUrl(input);
  return res.valid ? res.sanitized : '';
}

/**
 * Produces a deterministic, order-independent connection ID for two ideas
 * so A -> B and B -> A always resolve to the same relationship document.
 */
export function getNormalizedConnectionId(ideaAId: string, ideaBId: string): string {
  const [first, second] = [ideaAId.trim(), ideaBId.trim()].sort();
  return `${first}__${second}`;
}

/**
 * Validates legal idea lifecycle transitions:
 * Primary lifecycle: open -> in-progress -> built.
 * Once 'built', an idea cannot revert to 'open' or 'in-progress' unless overridden by an admin.
 */
export function isValidIdeaStatusTransition(
  currentStatus: IdeaStatus,
  nextStatus: IdeaStatus,
  isAdmin = false
): { allowed: boolean; reason?: string } {
  if (currentStatus === nextStatus) {
    return { allowed: true };
  }
  if (isAdmin) {
    return { allowed: true };
  }
  if (currentStatus === 'built') {
    return {
      allowed: false,
      reason:
        'A completed ("Built") specification is locked in the Showcase and cannot be moved back to Open or In Progress without an administrator override.',
    };
  }
  if (
    (currentStatus === 'open' && (nextStatus === 'in-progress' || nextStatus === 'built')) ||
    (currentStatus === 'in-progress' && (nextStatus === 'built' || nextStatus === 'open'))
  ) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: `Invalid status transition from "${currentStatus}" to "${nextStatus}".`,
  };
}

/**
 * Client-side rate limiter per action key to prevent rapid spam submission
 */
const actionTimestamps: Record<string, number> = {};

export function checkRateLimit(
  actionKey: string,
  cooldownMs = 4000
): { allowed: boolean; waitSeconds: number } {
  const now = Date.now();
  const last = actionTimestamps[actionKey] || 0;
  const elapsed = now - last;
  if (elapsed < cooldownMs) {
    return {
      allowed: false,
      waitSeconds: Math.ceil((cooldownMs - elapsed) / 1000),
    };
  }
  actionTimestamps[actionKey] = now;
  return { allowed: true, waitSeconds: 0 };
}

/**
 * Formats an ISO timestamp into a clean human-readable relative string
 */
export function formatRelativeTime(isoString?: string): string {
  if (!isoString) return 'Recently';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'Recently';
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return 'Just posted';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 30) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function getLicenseLabel(license: string): { short: string; full: string } {
  switch (license) {
    case 'mit':
      return {
        short: 'MIT License',
        full: 'MIT License · Open source permissive license. Your idea stays yours; Synapse claims no IP, rights, or equity stake.',
      };
    case 'cc-by':
      return {
        short: 'CC BY 4.0',
        full: 'Creative Commons Attribution 4.0 · Share and adapt with credit to the original author. Synapse claims no IP or rights.',
      };
    default:
      return {
        short: 'All Rights Kept',
        full: 'All Rights Kept · 100% Creator Owned. Your idea stays yours; Synapse claims no IP, rights, or equity stake.',
      };
  }
}
