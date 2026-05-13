import { create } from "zustand";
import type {
  AuthUser,
  ClusterDestinationFeedback,
  ClusterPayload,
  POI,
  SelectionId,
  SidePanelView,
} from "@/types";
import {
  clearAuthUser,
  generateHashId,
  loadAuthUser,
  saveAuthUser,
  saveCluster,
  updateCluster,
} from "@/lib/storage";
import { apiMode } from "@/lib/apiConfig";
import {
  apiCreateCluster,
  apiDeleteClusterNote,
  apiGetCluster,
  apiPatchCluster,
  apiPatchClusterNote,
  apiPostClusterLike,
  apiPostClusterNote,
} from "@/lib/clusterApi";
import { clearAuthToken } from "@/lib/http";
import { apiLogout } from "@/lib/authApi";
import { recordRecentDestination } from "@/lib/recentDestinations";
import { clearPersonalPoiCommentsApiCache } from "@/lib/poiPersonalComments";
import type { SavedSlot } from "@/lib/savedPlaces";

/**
 * Global app state. Sticky-note era removed — there are no per-POI sticky
 * notes, no draggable layouts, and no sticky-note → pin connection lines.
 * Instead the app is a *cluster builder + viewer*:
 *
 *   - `pois` — destinations of the **active cluster** (draft or loaded). The
 *     map renders one pin per entry.
 *   - `currentClusterId` / `currentClusterName` — non-null once the active
 *     cluster has been saved (or loaded from a share URL).
 *   - `feedback` — per-destination shared likes/notes for the active cluster
 *     (mirrors what's stored on disk so the UI re-renders on every mutation
 *     without re-reading localStorage).
 *   - `panelView` — main vs. cluster-detail. Only one back-step is needed.
 *
 * Persistence: any feedback mutation immediately writes through to the
 * `tmap_clusters_v2` localStorage record via `updateCluster()`, so all
 * viewers of the cluster see the latest state on next load. Mutations on a
 * draft (unsaved) cluster are in-memory only — the destination cards
 * therefore disable like/note actions when no `currentClusterId` is set.
 */

interface State {
  /* ---- active cluster (in-memory mirror of what's on the map) ---- */
  pois: POI[];
  feedback: Record<string, ClusterDestinationFeedback>;
  selectedId: SelectionId;

  currentClusterId: string | null;
  currentClusterName: string | null;
  /** Saved map view for the active cluster (share link / list open). */
  clusterMapView: { center: { lat: number; lng: number }; zoom: number } | null;
  /** True when the active cluster was loaded via a share URL and the user is
   *  not the owner. View-only restricts destination editing (add/remove/
   *  rename) but explicitly does NOT block likes/notes — that's the whole
   *  point of "shared" feedback. */
  viewOnly: boolean;

  /* ---- side panel routing ----
   * History stack — `[0]` is always the root (`{kind: "main"}`), the last
   * entry is what the panel currently shows. Back button pops one. The
   * stack approach lets us go main → cluster → poiDetail and pop step by
   * step without keeping a separate "fromKind" everywhere. */
  panelStack: SidePanelView[];

  /* ---- route mode (independent of panelView) ---- */
  routeStart: POI | null;
  routeEnd: POI | null;
  routeMode: boolean;
  routeActive: boolean;

  /* ---- auth + geo ---- */
  user: AuthUser | null;
  userLocation: { lat: number; lng: number } | null;

  /* ---- search / recommendations ---- */
  searchResults: POI[];
  searchActive: boolean;
  /** Persists the main-panel search input when navigating (e.g. results → POI detail → back). */
  mainSearchKeyword: string;
  recommendationsHintVisible: boolean;
  /** 검색 결과가 열린 상태에서 지도를 움긴 뒤 재검색하도록 안내하는 FAB. */
  searchRefreshHintVisible: boolean;
  recommendationsRefreshTick: number;

  /* ---- spotlight (recommendation row clicks) ----
   * POIs that the user has clicked from the recommendations list. They get
   * the same red transient pin + label treatment as `searchResults` so the
   * user can visually compare what they're looking at on the map. The
   * spotlight set is automatically cleared when the user enters a context
   * that owns the map (loading a cluster, running a real keyword search,
   * `clearAll`, or backing out of a cluster view). */
  spotlightPois: POI[];

  /* ---- cluster picker modal ----
   * When non-null, a modal asks the user which cluster to add the POI to.
   * Triggered by "+ 즐겨찾기에 추가" anywhere outside of the contexts that
   * have an implicit target (recommendations → in-memory draft; cluster
   * detail's inline search → that cluster). */
  clusterPickerPoi: POI | null;

  /* ---- actions: destinations ---- */
  addPois: (pois: POI[]) => void;
  /** Append a POI to the active in-memory cluster (`pois`). When a saved
   *  cluster is currently loaded, the addition is also persisted to that
   *  cluster's localStorage record so other viewers see it on next load. */
  addPoiToCurrentCluster: (poi: POI) => void;
  /** Append a POI to a specific saved cluster by id. Persists to storage
   *  unconditionally. If the target happens to be the currently active
   *  cluster, also mirrors into in-memory `pois` so the map updates. */
  addPoiToCluster: (clusterId: string, poi: POI) => void;
  /** Create a brand new cluster owned by the current user with `poi` as its
   *  only initial destination. Returns the new cluster id, or `null` if not
   *  signed in. The new cluster is immediately persisted but is NOT loaded
   *  as the active one — that's a separate UX step (the user can navigate to
   *  it from "즐겨찾기 모음"). */
  createClusterWithPoi: (
    name: string,
    poi: POI,
    mapCenter: { lat: number; lng: number },
    mapZoom: number
  ) => Promise<string | null>;
  removePoi: (id: string) => void;
  clearAll: () => void;
  selectPoi: (id: SelectionId) => void;

  /* ---- actions: side panel routing ---- */
  openClusterView: (clusterId: string) => void;
  openPoiDetailView: (poi: POI) => void;
  openProfileView: () => void;
  /** Pop one entry off the panel stack. No-op when only the root is left. */
  goBackInPanel: () => void;
  /** Main + 추천 목적지 초기 화면: 패널 스택·검색·즐겨찾기 뷰·경로·스포트라이트 등 정리. */
  resetToRecommendationsHome: () => void;

  /* ---- actions: cluster lifecycle ---- */
  loadFromCluster: (c: ClusterPayload, viewOnly: boolean) => void;
  setCurrentCluster: (id: string, name: string) => void;
  setViewOnly: (v: boolean) => void;

  /* ---- actions: shared feedback ---- */
  toggleLike: (poiId: string) => void;
  addClusterNote: (poiId: string, text: string, imageUrls?: string[]) => void;
  editClusterNote: (poiId: string, noteId: string, text: string) => void;
  deleteClusterNote: (poiId: string, noteId: string) => void;

  /* ---- actions: route ---- */
  setRouteStart: (poi: POI | null) => void;
  setRouteEnd: (poi: POI | null) => void;
  swapRouteEndpoints: () => void;
  setRouteActive: (on: boolean) => void;
  setRouteMode: (on: boolean) => void;
  exitRouteMode: () => void;

  /* ---- actions: misc ---- */
  signIn: (u: AuthUser) => void;
  signOut: () => void;
  setUserLocation: (p: { lat: number; lng: number } | null) => void;
  setSearchResults: (results: POI[]) => void;
  setSearchActive: (on: boolean) => void;
  setMainSearchKeyword: (keyword: string) => void;
  setRecommendationsHintVisible: (v: boolean) => void;
  setSearchRefreshHintVisible: (v: boolean) => void;
  triggerRecommendationsRefresh: () => void;

  /* ---- actions: cluster picker modal ---- */
  openClusterPicker: (poi: POI) => void;
  closeClusterPicker: () => void;

  /** 집/직장 칩 → 출발·도착 고르기 모달 */
  savedPlaceRoutePick: { poi: POI; slot: SavedSlot } | null;
  openSavedPlaceRoutePick: (poi: POI, slot: SavedSlot) => void;
  closeSavedPlaceRoutePick: () => void;
  confirmSavedPlaceRoute: (role: "start" | "end") => void;

  /** Increment so "즐겨찾기 모음" refetches when using API backend. */
  clusterListVersion: number;
  bumpClusterList: () => void;

  /* ---- actions: spotlight ---- */
  /** Add a POI to the spotlight set (deduped by `id`). */
  addSpotlightPoi: (poi: POI) => void;
  /** Drop one POI from the spotlight set. */
  removeSpotlightPoi: (id: string) => void;
  /** Wipe the spotlight set. */
  clearSpotlight: () => void;

  /** Short message over the map (e.g. share link copied). */
  mapToast: string | null;
  showMapToast: (message: string) => void;
  dismissMapToast: () => void;
}

function emptyFeedback(): ClusterDestinationFeedback {
  return { likes: [], notes: [] };
}

function genNoteId(): string {
  /* Short, unique-enough id — collisions across notes inside one cluster are
   *  astronomically unlikely with 96 bits. */
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Returns a feedback bucket for `poiId`, creating an empty one if missing. */
function ensureBucket(
  feedback: Record<string, ClusterDestinationFeedback>,
  poiId: string
): ClusterDestinationFeedback {
  return feedback[poiId] ?? emptyFeedback();
}

/** Apply server cluster snapshot to in-memory cluster view (active cluster only). */
function mergeClusterView(
  set: (partial: Partial<State> | ((s: State) => Partial<State>)) => void,
  c: ClusterPayload
) {
  set((s) => {
    const next = {
      pois: c.pois,
      feedback: c.feedback ?? {},
      currentClusterName: c.name,
    };
    if (s.currentClusterId !== c.id) return next;
    return {
      ...next,
      clusterMapView: { center: c.mapCenter, zoom: c.mapZoom },
    };
  });
}

export const useStore = create<State>((set, get) => ({
  pois: [],
  feedback: {},
  selectedId: null,

  currentClusterId: null,
  currentClusterName: null,
  clusterMapView: null,
  viewOnly: false,

  panelStack: [{ kind: "main" }],

  routeStart: null,
  routeEnd: null,
  routeMode: false,
  routeActive: false,

  user: loadAuthUser<AuthUser>(),
  userLocation: null,

  searchResults: [],
  searchActive: false,
  mainSearchKeyword: "",
  recommendationsHintVisible: false,
  searchRefreshHintVisible: false,
  recommendationsRefreshTick: 0,

  spotlightPois: [],

  clusterPickerPoi: null,

  savedPlaceRoutePick: null,

  mapToast: null,

  clusterListVersion: 0,

  /* ------------------------------ destinations ------------------------- */
  addPois: (pois) =>
    set((s) => {
      const existing = new Set(s.pois.map((p) => p.id));
      const merged = [...s.pois];
      for (const p of pois) {
        if (existing.has(p.id)) continue;
        merged.push(p);
        existing.add(p.id);
      }
      return { pois: merged };
    }),

  addPoiToCurrentCluster: (poi) => {
    const s = get();
    if (s.pois.some((p) => p.id === poi.id)) return;
    const nextPois = [...s.pois, poi];
    set({ pois: nextPois });
    if (!s.currentClusterId) return;
    const cid = s.currentClusterId;
    if (apiMode()) {
      void (async () => {
        try {
          const c = await apiPatchCluster(cid, { pois: nextPois });
          mergeClusterView(set, c);
        } catch (e) {
          console.error("addPoiToCurrentCluster", e);
        }
      })();
      return;
    }
    updateCluster(cid, (c) => ({
      ...c,
      pois: c.pois.some((p) => p.id === poi.id) ? c.pois : [...c.pois, poi],
    }));
  },

  addPoiToCluster: (clusterId, poi) => {
    if (apiMode()) {
      void (async () => {
        try {
          const cur = await apiGetCluster(clusterId);
          const merged = cur.pois.some((p) => p.id === poi.id)
            ? cur.pois
            : [...cur.pois, poi];
          const c = await apiPatchCluster(clusterId, { pois: merged });
          const s = get();
          if (s.currentClusterId === clusterId && !s.pois.some((p) => p.id === poi.id)) {
            mergeClusterView(set, c);
          }
        } catch (e) {
          console.error("addPoiToCluster", e);
        }
      })();
      return;
    }
    updateCluster(clusterId, (c) => ({
      ...c,
      pois: c.pois.some((p) => p.id === poi.id) ? c.pois : [...c.pois, poi],
    }));
    const s = get();
    if (s.currentClusterId === clusterId && !s.pois.some((p) => p.id === poi.id)) {
      set({ pois: [...s.pois, poi] });
    }
  },

  createClusterWithPoi: async (name, poi, mapCenter, mapZoom) => {
    const s = get();
    if (!s.user) return null;
    if (apiMode()) {
      try {
        const id = generateHashId();
        const c = await apiCreateCluster({
          id,
          name: name.trim() || "새 즐겨찾기",
          mapCenter,
          mapZoom,
          pois: [poi],
        });
        return c.id;
      } catch (e) {
        console.error("createClusterWithPoi", e);
        return null;
      }
    }
    const id = generateHashId();
    const now = Date.now();
    const payload: ClusterPayload = {
      id,
      name: name.trim() || "새 즐겨찾기",
      ownerId: s.user.id,
      ownerName: s.user.name,
      createdAt: now,
      updatedAt: now,
      mapCenter,
      mapZoom,
      pois: [poi],
      feedback: {},
    };
    saveCluster(payload);
    return id;
  },

  removePoi: (id) => {
    const s = get();
    const feedback = { ...s.feedback };
    delete feedback[id];
    const nextPois = s.pois.filter((p) => p.id !== id);
    set({
      pois: nextPois,
      feedback,
      selectedId: s.selectedId === id ? null : s.selectedId,
    });
    if (!s.currentClusterId) return;
    const cid = s.currentClusterId;
    if (apiMode()) {
      void (async () => {
        try {
          const c = await apiPatchCluster(cid, { pois: nextPois });
          mergeClusterView(set, c);
        } catch (e) {
          console.error("removePoi", e);
        }
      })();
      return;
    }
    updateCluster(cid, (c) => {
      const nextFeedback = { ...c.feedback };
      delete nextFeedback[id];
      return {
        ...c,
        pois: c.pois.filter((p) => p.id !== id),
        feedback: nextFeedback,
      };
    });
  },

  clearAll: () =>
    set({
      pois: [],
      feedback: {},
      selectedId: null,
      currentClusterId: null,
      currentClusterName: null,
      clusterMapView: null,
      viewOnly: false,
      panelStack: [{ kind: "main" }],
      routeStart: null,
      routeEnd: null,
      routeMode: false,
      routeActive: false,
      spotlightPois: [],
      savedPlaceRoutePick: null,
      mainSearchKeyword: "",
    }),

  selectPoi: (id) => set({ selectedId: id }),

  /* ----------------------------- panel routing -------------------------
   * Push semantics: any "open X" action appends to the stack so the user
   * can use the unified back button to retrace their path. We dedupe an
   * identical top-of-stack push so rapid double-taps don't bloat history. */
  openClusterView: (clusterId) =>
    set((s) => {
      const top = s.panelStack[s.panelStack.length - 1];
      if (top?.kind === "cluster" && top.clusterId === clusterId) return {};
      return { panelStack: [...s.panelStack, { kind: "cluster", clusterId }] };
    }),
  openPoiDetailView: (poi) =>
    set((s) => {
      const top = s.panelStack[s.panelStack.length - 1];
      if (top?.kind === "poiDetail" && top.poi.id === poi.id) return {};
      return { panelStack: [...s.panelStack, { kind: "poiDetail", poi }] };
    }),
  openProfileView: () =>
    set((s) => {
      const top = s.panelStack[s.panelStack.length - 1];
      if (top?.kind === "profile") return {};
      return { panelStack: [...s.panelStack, { kind: "profile" }] };
    }),
  goBackInPanel: () =>
    set((s) => {
      if (s.panelStack.length <= 1) return {};
      const popped = s.panelStack[s.panelStack.length - 1];
      const next = s.panelStack.slice(0, -1);
      /* When the user backs out of a `cluster` view, clear the active
       * cluster context so its pins disappear from the map. The cluster
       * record itself is untouched (it's still in storage and listed in
       * "즐겨찾기 모음") — we're only deactivating the in-memory mirror. */
      if (popped.kind === "cluster") {
        return {
          panelStack: next,
          pois: [],
          feedback: {},
          selectedId: null,
          currentClusterId: null,
          currentClusterName: null,
          clusterMapView: null,
          viewOnly: false,
          /* Clear search results too: search done inside the cluster
           * view was scoped to that cluster, so leaving the cluster
           * also clears the temporary search markers. */
          searchResults: [],
          searchActive: false,
          searchRefreshHintVisible: false,
          recommendationsHintVisible: false,
          /* Spotlight (recommendation clicks) belongs to the main view;
           * coming back from a cluster gives the user a clean slate. */
          spotlightPois: [],
          savedPlaceRoutePick: null,
        };
      }
      /* Backing out of a POI detail view also drops any spotlight pin
       * that was created when the user opened it from the recommendation
       * list — per spec the recommendation pin must disappear once the
       * user returns to the recommendations list. We blanket-clear here
       * (not just the popped POI's id) so that re-entering the same
       * recommendations list always shows a clean map; cluster
       * destination clicks don't add to spotlight in the first place
       * so this clear is effectively a no-op for those paths. */
      if (popped.kind === "poiDetail") {
        return {
          panelStack: next,
          spotlightPois: [],
          savedPlaceRoutePick: null,
          recommendationsHintVisible: false,
          searchRefreshHintVisible: false,
        };
      }
      return { panelStack: next, savedPlaceRoutePick: null };
    }),
  resetToRecommendationsHome: () =>
    set({
      panelStack: [{ kind: "main" }],
      pois: [],
      feedback: {},
      selectedId: null,
      currentClusterId: null,
      currentClusterName: null,
      clusterMapView: null,
      viewOnly: false,
      searchResults: [],
      searchActive: false,
      mainSearchKeyword: "",
      spotlightPois: [],
      savedPlaceRoutePick: null,
      clusterPickerPoi: null,
      routeStart: null,
      routeEnd: null,
      routeMode: false,
      routeActive: false,
      mapToast: null,
      recommendationsHintVisible: false,
      searchRefreshHintVisible: false,
    }),

  /* ------------------------------ cluster ------------------------------ */
  loadFromCluster: (c, viewOnly) =>
    set({
      pois: c.pois,
      feedback: c.feedback ?? {},
      selectedId: null,
      currentClusterId: c.id,
      currentClusterName: c.name,
      clusterMapView: { center: c.mapCenter, zoom: c.mapZoom },
      viewOnly,
      routeStart: null,
      routeEnd: null,
      routeMode: false,
      routeActive: false,
      savedPlaceRoutePick: null,
      /* Drop any spotlight pins from the prior main-view exploration so
       * the cluster's own pins are the only "owned" markers on the map. */
      spotlightPois: [],
      /* Seed history as [main, cluster] so the back button on the cluster
       * detail view always returns to the main panel — this is intuitive
       * for both share-link entries and "즐겨찾기 모음" picks. */
      panelStack: [{ kind: "main" }, { kind: "cluster", clusterId: c.id }],
    }),

  setCurrentCluster: (id, name) =>
    set({ currentClusterId: id, currentClusterName: name, viewOnly: false }),
  setViewOnly: (v) => set({ viewOnly: v }),

  /* ------------------------------ feedback ----------------------------- */
  toggleLike: (poiId) => {
    const s = get();
    const user = s.user;
    if (!user) return;
    if (!s.currentClusterId) return;
    const cid = s.currentClusterId;
    if (apiMode()) {
      void (async () => {
        try {
          const c = await apiPostClusterLike(cid, poiId);
          mergeClusterView(set, c);
        } catch (e) {
          console.error("toggleLike", e);
        }
      })();
      return;
    }
    const cur = ensureBucket(s.feedback, poiId);
    const already = cur.likes.find((l) => l.userId === user.id);
    const nextLikes = already
      ? cur.likes.filter((l) => l.userId !== user.id)
      : [
          ...cur.likes,
          { userId: user.id, userName: user.name, ts: Date.now() },
        ];
    const nextBucket: ClusterDestinationFeedback = {
      ...cur,
      likes: nextLikes,
    };
    const nextFeedback = { ...s.feedback, [poiId]: nextBucket };
    set({ feedback: nextFeedback });
    updateCluster(cid, (c) => ({
      ...c,
      feedback: { ...c.feedback, [poiId]: nextBucket },
    }));
  },

  addClusterNote: (poiId, text, imageUrls) => {
    const trimmed = text.trim();
    const imgs = imageUrls?.filter(Boolean) ?? [];
    if (!trimmed && imgs.length === 0) return;
    const s = get();
    const user = s.user;
    if (!user) return;
    if (!s.currentClusterId) return;
    const cid = s.currentClusterId;
    const textForApi = trimmed || (imgs.length > 0 ? "(이미지)" : "");
    if (apiMode()) {
      void (async () => {
        try {
          const c = await apiPostClusterNote(cid, poiId, {
            text: textForApi,
            ...(imgs.length > 0 ? { imageUrls: imgs } : {}),
          });
          mergeClusterView(set, c);
        } catch (e) {
          console.error("addClusterNote", e);
          alert(
            "코멘트를 저장하지 못했습니다."
          );
        }
      })();
      return;
    }
    const cur = ensureBucket(s.feedback, poiId);
    const note = {
      id: genNoteId(),
      userId: user.id,
      userName: user.name,
      text: trimmed || (imgs.length > 0 ? "(이미지)" : ""),
      ts: Date.now(),
      ...(imgs.length > 0 ? { imageUrls: imgs } : {}),
    };
    const nextBucket: ClusterDestinationFeedback = {
      ...cur,
      notes: [...cur.notes, note],
    };
    const nextFeedback = { ...s.feedback, [poiId]: nextBucket };
    set({ feedback: nextFeedback });
    updateCluster(cid, (c) => ({
      ...c,
      feedback: { ...c.feedback, [poiId]: nextBucket },
    }));
  },

  editClusterNote: (poiId, noteId, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const s = get();
    const user = s.user;
    if (!user) return;
    if (!s.currentClusterId) return;
    const cid = s.currentClusterId;
    const cur = ensureBucket(s.feedback, poiId);
    const idx = cur.notes.findIndex((n) => n.id === noteId);
    if (idx === -1) return;
    if (cur.notes[idx].userId !== user.id) return;
    if (apiMode()) {
      void (async () => {
        try {
          const prev = cur.notes[idx];
          const c = await apiPatchClusterNote(cid, poiId, noteId, {
            text: trimmed,
            ...(prev.imageUrls?.length
              ? { imageUrls: prev.imageUrls }
              : {}),
          });
          mergeClusterView(set, c);
        } catch (e) {
          console.error("editClusterNote", e);
        }
      })();
      return;
    }
    const nextNotes = [...cur.notes];
    nextNotes[idx] = {
      ...nextNotes[idx],
      text: trimmed,
      editedAt: Date.now(),
    };
    const nextBucket: ClusterDestinationFeedback = {
      ...cur,
      notes: nextNotes,
    };
    const nextFeedback = { ...s.feedback, [poiId]: nextBucket };
    set({ feedback: nextFeedback });
    updateCluster(cid, (c) => ({
      ...c,
      feedback: { ...c.feedback, [poiId]: nextBucket },
    }));
  },

  deleteClusterNote: (poiId, noteId) => {
    const s = get();
    const user = s.user;
    if (!user) return;
    if (!s.currentClusterId) return;
    const cid = s.currentClusterId;
    const cur = ensureBucket(s.feedback, poiId);
    const target = cur.notes.find((n) => n.id === noteId);
    if (!target) return;
    const isOwner = !s.viewOnly;
    if (target.userId !== user.id && !isOwner) return;
    if (apiMode()) {
      void (async () => {
        try {
          const c = await apiDeleteClusterNote(cid, poiId, noteId);
          mergeClusterView(set, c);
        } catch (e) {
          console.error("deleteClusterNote", e);
        }
      })();
      return;
    }
    const nextBucket: ClusterDestinationFeedback = {
      ...cur,
      notes: cur.notes.filter((n) => n.id !== noteId),
    };
    const nextFeedback = { ...s.feedback, [poiId]: nextBucket };
    set({ feedback: nextFeedback });
    updateCluster(cid, (c) => ({
      ...c,
      feedback: { ...c.feedback, [poiId]: nextBucket },
    }));
  },

  /* -------------------------------- route ------------------------------ */
  setRouteStart: (poi) => set({ routeStart: poi }),
  setRouteEnd: (poi) => set({ routeEnd: poi }),
  swapRouteEndpoints: () =>
    set((s) => ({ routeStart: s.routeEnd, routeEnd: s.routeStart })),
  setRouteActive: (on) => set({ routeActive: on }),
  setRouteMode: (on) =>
    set((s) => ({
      routeMode: on,
      routeActive: on ? s.routeActive : false,
    })),
  exitRouteMode: () =>
    set({
      routeMode: false,
      routeActive: false,
      routeStart: null,
      routeEnd: null,
      savedPlaceRoutePick: null,
    }),

  /* -------------------------------- misc ------------------------------- */
  signIn: (u) => {
    saveAuthUser(u);
    set({ user: u });
  },
  signOut: () => {
    void apiLogout();
    clearAuthUser();
    if (apiMode()) clearAuthToken();
    clearPersonalPoiCommentsApiCache();
    set({ user: null, savedPlaceRoutePick: null });
  },

  setUserLocation: (p) => set({ userLocation: p }),
  setSearchResults: (results) =>
    /* Running a real search owns the map: drop spotlight pins so the user
     * sees only the keyword matches plus any active cluster pins. */
    set((s) => ({
      searchResults: results,
      searchActive: results.length > 0,
      spotlightPois: results.length > 0 ? [] : s.spotlightPois,
      ...(results.length === 0 ? { searchRefreshHintVisible: false } : {}),
    })),
  setSearchActive: (on) =>
    set(
      on
        ? { searchActive: true }
        : { searchActive: false, searchRefreshHintVisible: false }
    ),
  setMainSearchKeyword: (keyword) => set({ mainSearchKeyword: keyword }),

  setRecommendationsHintVisible: (v) =>
    set({ recommendationsHintVisible: v }),
  setSearchRefreshHintVisible: (v) => set({ searchRefreshHintVisible: v }),
  triggerRecommendationsRefresh: () =>
    set((s) => ({
      recommendationsRefreshTick: s.recommendationsRefreshTick + 1,
      recommendationsHintVisible: false,
      searchRefreshHintVisible: false,
    })),

  openClusterPicker: (poi) => set({ clusterPickerPoi: poi }),
  closeClusterPicker: () => set({ clusterPickerPoi: null }),

  bumpClusterList: () =>
    set((s) => ({ clusterListVersion: s.clusterListVersion + 1 })),

  openSavedPlaceRoutePick: (poi, slot) =>
    set({ savedPlaceRoutePick: { poi, slot } }),
  closeSavedPlaceRoutePick: () => set({ savedPlaceRoutePick: null }),
  confirmSavedPlaceRoute: (role) => {
    const ctx = get().savedPlaceRoutePick;
    if (!ctx) return;
    const { poi } = ctx;
    recordRecentDestination(poi);
    if (role === "start") {
      set({
        routeStart: poi,
        routeMode: true,
        savedPlaceRoutePick: null,
      });
    } else {
      set({
        routeEnd: poi,
        routeMode: true,
        savedPlaceRoutePick: null,
      });
    }
  },

  addSpotlightPoi: (poi) =>
    set((s) =>
      s.spotlightPois.some((p) => p.id === poi.id)
        ? {}
        : { spotlightPois: [...s.spotlightPois, poi] }
    ),
  removeSpotlightPoi: (id) =>
    set((s) => ({ spotlightPois: s.spotlightPois.filter((p) => p.id !== id) })),
  clearSpotlight: () => set({ spotlightPois: [] }),

  showMapToast: (message) => set({ mapToast: message }),
  dismissMapToast: () => set({ mapToast: null }),
}));

/** Helper to read the current state outside React. */
export const getState = () => useStore.getState();
