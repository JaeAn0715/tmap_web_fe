import { useEffect, useState } from "react";
import { Modal } from "@/components/UI/Modal";
import { Button } from "@/components/UI/Button";
import { useStore } from "@/store/useStore";
import { apiMode } from "@/lib/apiConfig";
import {
  apiDeleteCluster,
  apiPatchCluster,
  apiUnfollowCluster,
} from "@/lib/clusterApi";
import { deleteCluster, updateCluster } from "@/lib/storage";
import { isClusterOwnedByMe } from "@/lib/clusterOwnership";
import type { ClusterPayload } from "@/types";

interface Props {
  open: boolean;
  cluster: ClusterPayload | null;
  onClose: () => void;
}

/**
 * 즐겨찾기 모음 행의「수정」— 소유 즐겨찾기는 이름 변경·삭제, 공유받은 항목은 목록에서만 제거.
 */
export function EditClusterModal({ open, cluster, onClose }: Props) {
  const user = useStore((s) => s.user);
  const bumpClusterList = useStore((s) => s.bumpClusterList);
  const goBackInPanel = useStore((s) => s.goBackInPanel);
  const setCurrentCluster = useStore((s) => s.setCurrentCluster);
  const [name, setName] = useState("");

  useEffect(() => {
    if (open && cluster) setName(cluster.name);
  }, [open, cluster]);

  if (!open || !cluster) return null;

  const ownedByMe = isClusterOwnedByMe(cluster, user?.id);

  const handleRename = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (trimmed === cluster.name) {
      onClose();
      return;
    }
    try {
      if (apiMode()) {
        await apiPatchCluster(cluster.id, { name: trimmed });
      } else {
        const next = updateCluster(cluster.id, (c) => ({ ...c, name: trimmed }));
        if (!next) {
          alert("저장된 즐겨찾기를 찾을 수 없습니다.");
          return;
        }
      }
      const s = useStore.getState();
      if (s.currentClusterId === cluster.id) {
        setCurrentCluster(cluster.id, trimmed);
      }
      bumpClusterList();
      onClose();
    } catch (e) {
      console.error(e);
      alert("이름을 바꾸지 못했습니다.");
    }
  };

  const handleRemoveOrDelete = async () => {
    const msg = ownedByMe
      ? "이 즐겨찾기를 삭제할까요? 목적지와 코멘트가 모두 사라집니다."
      : "내 목록에서 이 즐겨찾기를 제거할까요? (원본은 유지됩니다.)";
    if (!window.confirm(msg)) return;
    try {
      if (apiMode()) {
        if (ownedByMe) await apiDeleteCluster(cluster.id);
        else await apiUnfollowCluster(cluster.id);
      } else {
        deleteCluster(cluster.id);
      }
      if (useStore.getState().currentClusterId === cluster.id) {
        goBackInPanel();
      }
      bumpClusterList();
      onClose();
    } catch (e) {
      console.error(e);
      alert("처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={ownedByMe ? "즐겨찾기 수정" : "즐겨찾기"}
      footer={
        ownedByMe ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              닫기
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleRename()}
              disabled={!name.trim()}
            >
              이름 저장
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              닫기
            </Button>
            <Button variant="danger" onClick={() => void handleRemoveOrDelete()}>
              내 목록에서 제거
            </Button>
          </>
        )
      }
    >
      {ownedByMe ? (
        <div className="space-y-4">
          <div>
            <label
              htmlFor="edit-cluster-name"
              className="block text-xs font-medium text-gray-500 mb-1"
            >
              즐겨찾기 이름
            </label>
            <input
              id="edit-cluster-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-tmap-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
              placeholder="이름"
              autoFocus
            />
          </div>
          <div className="pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-2">
              삭제하면 복구할 수 없습니다.
            </p>
            <Button
              variant="danger"
              className="w-full"
              onClick={() => void handleRemoveOrDelete()}
            >
              즐겨찾기 삭제
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-600 leading-relaxed">
          공유받은 즐겨찾기는 이름을 바꿀 수 없습니다. 목록에서만 제거할 수
          있어요.
        </p>
      )}
    </Modal>
  );
}
