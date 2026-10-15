import { useEffect, useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';

const SESSION_CACHE_KEY = 'synapse_feature_visibility_v1';

interface CachedVisibility {
  showConnections: boolean;
  showShowcase: boolean;
  timestamp: number;
}

function getSessionCache(): CachedVisibility | null {
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setSessionCache(val: CachedVisibility) {
  try {
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(val));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Determines whether Connections and Showcase features should be shown in nav, footer, and hero links.
 * Rule:
 * Hide "Connections" when there are fewer than 5 ideas total AND zero connections.
 * Hide "Showcase" when there are fewer than 5 ideas total AND zero Built ideas.
 * Caches results in sessionStorage for instant rendering.
 */
export function useFeatureVisibility() {
  const { ideas, connections, ideasLoading } = useApp();

  const totalIdeas = ideas.length;
  const totalConnections = connections.length;
  const builtIdeas = useMemo(
    () => ideas.filter((i) => i.status === 'built').length,
    [ideas]
  );

  // Initialize from session cache if available, otherwise default conservatively to false if loading
  const [visibility, setVisibility] = useState<CachedVisibility>(() => {
    const cached = getSessionCache();
    if (cached) return cached;
    return {
      showConnections: false,
      showShowcase: false,
      timestamp: Date.now(),
    };
  });

  useEffect(() => {
    if (ideasLoading && visibility.timestamp > 0 && (visibility.showConnections || visibility.showShowcase)) {
      // Use cached state while initial fetch is completing
      return;
    }

    const showConn = totalIdeas >= 5 || totalConnections > 0;
    const showShow = totalIdeas >= 5 || builtIdeas > 0;

    const nextState: CachedVisibility = {
      showConnections: showConn,
      showShowcase: showShow,
      timestamp: Date.now(),
    };

    setVisibility(nextState);
    setSessionCache(nextState);
  }, [totalIdeas, totalConnections, builtIdeas, ideasLoading]);

  return {
    showConnections: visibility.showConnections,
    showShowcase: visibility.showShowcase,
    totalIdeas,
    totalConnections,
    builtIdeas,
  };
}
