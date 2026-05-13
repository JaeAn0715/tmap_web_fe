export interface POI {
  id: string;
  name: string;
  address: string;
  roadAddress?: string;
  tel?: string;
  category?: string;
  bizCategory?: string;
  /** TMAP `lowerBizName` (소분류) — 추천 검색 키워드 등에 사용. */
  lowerBizName?: string;
  lat: number;
  lng: number;
  /** Optional photo URL — populated by `lib/poiPhoto.ts` (Gemini grounded).
   *  May be missing on transient search results; resolved lazily by surfaces
   *  that render thumbnails. */
  photoUrl?: string;
  /** Raw payload from TMAP search for the expansion panel. */
  raw?: Record<string, unknown>;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export type SelectionId = string | null;

/* ---------------------------------------------------------------------------
 * Cluster + shared feedback (notes, likes)
 *
 * The new app model:
 *   - The map shows pins for the **active cluster's** destinations.
 *   - The side panel switches between a default view (search/recs/clusters)
 *     and a cluster detail view (destinations + per-destination notes/likes).
 *   - Notes and likes are **shared across every viewer of a cluster** (i.e.
 *     they are stored in the cluster payload itself, not in per-user buckets).
 *   - Each like / note records the **author user-id and display name** so the
 *     cluster detail view can surface "X liked", "Y said: …".
 * ------------------------------------------------------------------------- */

export interface ClusterLike {
  userId: string;
  userName: string;
  ts: number;
}

export interface ClusterNote {
  /** Stable id (uuid-ish) so a given note can be edited / removed. */
  id: string;
  userId: string;
  userName: string;
  text: string;
  ts: number;
  /** Last edit timestamp; equal to `ts` until the note is edited. */
  editedAt?: number;
  /**
   * Optional images (mock: JPEG data URLs). API mode: HTTPS URLs once backend stores them.
   */
  imageUrls?: string[];
}

export interface ClusterDestinationFeedback {
  likes: ClusterLike[];
  notes: ClusterNote[];
}

export interface ClusterPayload {
  /** Hash id used as short-url slug. */
  id: string;
  name: string;
  ownerId?: string;
  ownerName?: string;
  createdAt: number;
  updatedAt: number;
  /** Map state at save-time so viewers recreate the same view. */
  mapCenter: { lat: number; lng: number };
  mapZoom: number;
  pois: POI[];
  /** Per-destination shared feedback. Keyed by `POI.id`. Empty objects are
   *  allowed; missing keys are treated as `{ likes: [], notes: [] }`. */
  feedback: Record<string, ClusterDestinationFeedback>;
}

/** Side-panel navigation. The store keeps a history stack of these so
 *  back-button can pop one entry — main → cluster → poiDetail is the deepest
 *  flow today. New variants should remain shallow so the back-button stays
 *  predictable. */
export type SidePanelView =
  | { kind: "main" }
  | { kind: "cluster"; clusterId: string }
  /** Account: logout etc. Opened from the name chip in the map toolbar. */
  | { kind: "profile" }
  /** Read-only POI detail screen — opened from search results, recommendations,
   *  or the cluster destination list. Carries the full POI so the view doesn't
   *  have to re-fetch metadata. */
  | { kind: "poiDetail"; poi: POI };
