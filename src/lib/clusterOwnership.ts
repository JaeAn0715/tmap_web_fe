import type { ClusterPayload } from "@/types";

/**
 * Owner detection — derived purely from the cluster's `ownerId` field versus
 * the current user's id. This is the single source of truth for:
 *
 *   - Whether the user can **edit destinations** (add/remove POIs)
 *     ↳ `viewOnly = !isClusterOwnedByMe(cluster, user.id)`
 *   - Whether the **delete button** in `ClustersSection` says
 *     `"삭제"` (owner — would call DELETE on the backend in real deployment)
 *     vs. `"내 목록에서 제거"` (viewer — local-only unfollow).
 *
 * Special case: clusters saved while the user was logged out have no
 * `ownerId`. We treat those as "owned by anyone using this browser" — the
 * spec allows logged-out usage and we don't want to suddenly downgrade them
 * to view-only when the user logs in/out.
 */
export function isClusterOwnedByMe(
  c: Pick<ClusterPayload, "ownerId">,
  userId: string | undefined | null
): boolean {
  if (c.ownerId == null) return true;
  if (!userId) return false;
  return c.ownerId === userId;
}
