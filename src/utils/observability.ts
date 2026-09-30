export interface ClientDiagnosticEvent {
  category: 'firebase' | 'publish' | 'moderation' | 'auth' | 'network' | 'runtime';
  operation: string;
  message: string;
  path?: string | null;
  timestamp: string;
}

const MAX_RECENT_EVENTS = 50;
const recentEvents: ClientDiagnosticEvent[] = [];

/**
 * Captures non-PII diagnostic and error events for production observability
 * and forwards critical failures to `/api/client-error` when online.
 */
export function recordClientError(
  category: ClientDiagnosticEvent['category'],
  operation: string,
  error: unknown,
  path?: string | null
): void {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const event: ClientDiagnosticEvent = {
    category,
    operation,
    message: rawMessage.slice(0, 600),
    path: path || null,
    timestamp: new Date().toISOString(),
  };

  recentEvents.unshift(event);
  if (recentEvents.length > MAX_RECENT_EVENTS) {
    recentEvents.pop();
  }

  if (typeof window !== 'undefined' && navigator.onLine) {
    fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    }).catch(() => {
      // Non-blocking telemetry delivery
    });
  }
}

export function getRecentDiagnosticEvents(): readonly ClientDiagnosticEvent[] {
  return recentEvents;
}

export function isBrowserOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

/**
 * Throws a user-friendly error immediately if the browser is offline,
 * preventing false optimistic success notifications during network loss.
 */
export function assertOnlineForMutation(actionDescription = 'perform this action'): void {
  if (!isBrowserOnline()) {
    throw new Error(
      `Network connection lost. Cannot ${actionDescription} while offline. Please reconnect and retry.`
    );
  }
}
