import {
  DEFAULT_ACTIVE_ZONE,
  type ActiveZone,
  type TipMapping,
} from '@ghost-hands/gestures';

export const ZONE_STORAGE_KEY = 'gh:zone';

function isActiveZone(v: unknown): v is ActiveZone {
  if (!v || typeof v !== 'object') return false;
  const z = v as Record<string, unknown>;
  return (
    typeof z.x0 === 'number' &&
    typeof z.y0 === 'number' &&
    typeof z.x1 === 'number' &&
    typeof z.y1 === 'number'
  );
}

export function loadZone(): ActiveZone {
  try {
    const raw = localStorage.getItem(ZONE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ACTIVE_ZONE };
    const parsed: unknown = JSON.parse(raw);
    if (isActiveZone(parsed)) return parsed;
  } catch {
    // ignore corrupt storage
  }
  return { ...DEFAULT_ACTIVE_ZONE };
}

/** Persist zone; returns false if storage threw (callers still update in-memory). */
export function saveZone(zone: ActiveZone): boolean {
  try {
    localStorage.setItem(ZONE_STORAGE_KEY, JSON.stringify(zone));
    return true;
  } catch {
    return false;
  }
}

/** Clear stored zone; returns false if storage threw. */
export function resetZone(): boolean {
  try {
    localStorage.removeItem(ZONE_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Tip mapping currently always uses the stored (or default) active zone. */
export function loadMapping(): TipMapping {
  return { kind: 'zone', zone: loadZone() };
}
