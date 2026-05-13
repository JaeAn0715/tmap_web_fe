import { useState } from "react";
import { Modal } from "@/components/UI/Modal";
import { Button } from "@/components/UI/Button";
import { useStore } from "@/store/useStore";
import { generateHashId, loadCluster, saveCluster } from "@/lib/storage";
import type { ClusterPayload } from "@/types";
import type { TmapMap } from "@/types/tmap";

interface Props {
  open: boolean;
  onClose: () => void;
  map: TmapMap | null;
  defaultName?: string;
  onSaved?: (c: ClusterPayload) => void;
  /** When user is not logged in we still allow "save locally" as a graceful fallback. */
  requireLoginNotice?: boolean;
}

/**
 * Persist the active cluster to localStorage. The new schema (v2) stores
 * `pois` + per-destination `feedback` (likes, notes). Sticky-note layout
 * fields are gone.
 *
 * If we're updating an existing cluster (`currentClusterId` set), we MERGE
 * with the on-disk feedback so concurrent likes/notes left by other viewers
 * since the user opened the page aren't clobbered by an empty in-memory
 * snapshot.
 */
export function SaveClusterModal({
  open,
  onClose,
  map,
  defaultName = "",
  onSaved,
  requireLoginNotice,
}: Props) {
  const [name, setName] = useState(defaultName);
  const pois = useStore((s) => s.pois);
  const feedback = useStore((s) => s.feedback);
  const user = useStore((s) => s.user);
  const currentId = useStore((s) => s.currentClusterId);
  const setCurrentCluster = useStore((s) => s.setCurrentCluster);

  const onSave = () => {
    if (!map) return;
    const c = map.getCenter();
    const id = currentId ?? generateHashId();
    const now = Date.now();

    const existing = currentId ? loadCluster(currentId) : null;
    const mergedFeedback = mergeFeedback(existing?.feedback ?? {}, feedback);

    const payload: ClusterPayload = {
      id,
      name: name.trim() || "이름 없음",
      ownerId: existing?.ownerId ?? user?.id,
      ownerName: existing?.ownerName ?? user?.name,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      mapCenter: { lat: c.lat(), lng: c.lng() },
      mapZoom: map.getZoom(),
      pois,
      feedback: mergedFeedback,
    };
    saveCluster(payload);
    setCurrentCluster(payload.id, payload.name);
    onSaved?.(payload);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="즐겨찾기 저장"
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={onSave} disabled={!name.trim()}>
            저장
          </Button>
        </>
      }
    >
      {requireLoginNotice && (
        <div className="mb-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          로그인하지 않은 상태입니다. 저장은 일단 이 브라우저에 저장되며, 백엔드와 동기화하려면
          상단의 Google 로그인을 사용하세요. (mock 환경)
        </div>
      )}
      <label className="block text-xs text-gray-500 mb-1">즐겨찾기 이름</label>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full border rounded px-2 py-1.5 text-sm"
        placeholder="예: 주말 저녁 후보 (강남)"
      />
      <p className="mt-2 text-[11px] text-gray-500">
        지도의 현재 중심/줌이 함께 저장되어, 공유받은 사람도 같은 영역을 보게 됩니다.
        이후 받은 사람이 남기는 좋아요와 코멘트는 실시간으로 모두에게 공유됩니다.
      </p>
    </Modal>
  );
}

/* On-disk feedback wins for keys missing in-memory (e.g. concurrent edits
 * by other viewers). For overlapping keys we keep the in-memory copy since
 * that's what the current user has just been interacting with. */
function mergeFeedback<T>(disk: Record<string, T>, mem: Record<string, T>) {
  const out = { ...disk };
  for (const [k, v] of Object.entries(mem)) out[k] = v;
  return out;
}
