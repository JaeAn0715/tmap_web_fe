import type { ClusterPayload } from "@/types";
import { apiMode } from "./apiConfig";

/**
 * Mock backend persistence using `localStorage`.
 * Real backend will replace this module 1:1.
 *
 * Hash short-url scheme:
 *   /#/c/<hashId>   - View a saved cluster
 * The id is generated from a random 64-bit-ish value so external users can't
 * enumerate other clusters (matches the "Short URL 보안" requirement).
 *
 * Schema bumped from v1 → v2 when sticky-note layout was removed and shared
 * per-destination feedback (likes / notes) was introduced. v1 entries are
 * intentionally ignored rather than migrated, since their layout coordinates
 * have no meaning in the new model.
 */

const KEY = "tmap_clusters_v2";
const USER_KEY = "tmap_auth_user_v1";

function read(): Record<string, ClusterPayload> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

function write(map: Record<string, ClusterPayload>) {
  localStorage.setItem(KEY, JSON.stringify(map));
}

export function generateHashId(): string {
  // 96-bit random base36 -> ~18 chars, unguessable for our prototype's purposes.
  const a = crypto.getRandomValues(new Uint32Array(3));
  return Array.from(a, (x) => x.toString(36).padStart(7, "0")).join("");
}

export function saveCluster(c: ClusterPayload): ClusterPayload {
  if (apiMode()) {
    return { ...c, updatedAt: Date.now() };
  }
  const map = read();
  /* Touch updatedAt on every write so the cluster list can sort by recency
   * and viewers can detect stale data. */
  const stamped: ClusterPayload = { ...c, updatedAt: Date.now() };
  map[c.id] = stamped;
  write(map);
  return stamped;
}

export function loadCluster(id: string): ClusterPayload | null {
  if (apiMode()) return null;
  return read()[id] ?? null;
}

export function listClusters(): ClusterPayload[] {
  if (apiMode()) return [];
  return Object.values(read()).sort(
    (a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt)
  );
}

export function deleteCluster(id: string): void {
  if (apiMode()) return;
  const map = read();
  delete map[id];
  write(map);
}

/** Mutate an existing cluster in place using a reducer-style update. Used by
 *  feedback (likes / notes) actions so a single mutation atomically reads,
 *  modifies, and persists — minimising the chance two surfaces stomp each
 *  other's writes. Returns the new payload, or `null` if the cluster id no
 *  longer exists in storage. */
export function updateCluster(
  id: string,
  recipe: (current: ClusterPayload) => ClusterPayload
): ClusterPayload | null {
  if (apiMode()) return null;
  const map = read();
  const cur = map[id];
  if (!cur) return null;
  const next: ClusterPayload = { ...recipe(cur), updatedAt: Date.now() };
  map[id] = next;
  write(map);
  return next;
}

/* ------------------------------------------------------------------ Auth */

export function saveAuthUser<T>(u: T): void {
  localStorage.setItem(USER_KEY, JSON.stringify(u));
}
export function loadAuthUser<T>(): T | null {
  try {
    const v = localStorage.getItem(USER_KEY);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
export function clearAuthUser(): void {
  localStorage.removeItem(USER_KEY);
}
