import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { parseHash, hashFor } from '../router.js';

const RouteContext = createContext(null);

/** Syncs `location.hash` ↔ React state; setting the hash creates a history entry, so back/forward work. */
export function RouteProvider({ children }) {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((id, sub = null) => {
    const next = hashFor(id, sub);
    if (window.location.hash === next) return;
    window.location.hash = next; // fires hashchange → setRoute
  }, []);

  return <RouteContext.Provider value={{ route, navigate }}>{children}</RouteContext.Provider>;
}

export function useRoute() {
  return useContext(RouteContext);
}

/**
 * Module-owned sub-path (scenario id, lab tab). Returns [sub, setSub];
 * setSub(null) clears the segment. `valid(sub)` guards junk URLs.
 * With `nullable`, a bare module hash syncs sub back to null (back-button
 * returns to the list view); without it the last selection is kept.
 */
export function useSubRoute(moduleId, valid, { nullable = false } = {}) {
  const { route, navigate } = useRoute();
  const ok = (s) => s != null && valid(s);
  const [sub, setSubState] = useState(() => (route.id === moduleId && ok(route.sub) ? route.sub : null));

  useEffect(() => {
    if (route.id !== moduleId) return;
    if (ok(route.sub)) setSubState(route.sub);
    else if (nullable) setSubState(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.id, route.sub]);

  const setSub = useCallback((s) => {
    setSubState(s);
    navigate(moduleId, s);
  }, [navigate, moduleId]);

  return [sub, setSub];
}
