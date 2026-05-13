import { useState } from "react";
import type { ClusterNote } from "@/types";

export interface PoiCommentsPanelProps {
  poiId: string;
  notes: ClusterNote[];
  currentUserId?: string;
  onAdd: (text: string) => void | Promise<void>;
  onEdit: (noteId: string, text: string) => void | Promise<void>;
  onDelete: (noteId: string) => void | Promise<void>;
  /** Cluster owner may delete others' notes; personal POI comments use `false`. */
  ownerCanDelete: boolean;
}

export function PoiCommentsPanel({
  poiId,
  notes,
  currentUserId,
  onAdd,
  onEdit,
  onDelete,
  ownerCanDelete,
}: PoiCommentsPanelProps) {
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold text-gray-500">
        💬 코멘트 ({notes.length})
      </div>
      {notes.length === 0 ? (
        <div className="text-[11px] text-gray-400">
          아직 코멘트가 없어요. 첫 코멘트를 남겨보세요.
        </div>
      ) : (
        <ul className="space-y-1">
          {notes.map((n) => {
            const isMine = currentUserId === n.userId;
            const canDelete = isMine || ownerCanDelete;
            const isEditing = editingId === n.id;
            return (
              <li
                key={n.id}
                className="bg-yellow-50 border border-yellow-200 rounded p-1.5"
              >
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <div className="text-[10px] text-gray-600 font-semibold truncate">
                    {n.userName}
                    {isMine && (
                      <span className="ml-1 text-[9px] text-blue-600">나</span>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-400 shrink-0 tabular-nums">
                    {formatTime(n.editedAt ?? n.ts)}
                    {n.editedAt && (
                      <span className="ml-0.5 text-gray-300">(편집됨)</span>
                    )}
                  </div>
                </div>
                {isEditing ? (
                  <div className="space-y-1">
                    <textarea
                      autoFocus
                      value={editingDraft}
                      onChange={(e) => setEditingDraft(e.target.value)}
                      rows={2}
                      className="w-full text-[12px] border rounded p-1 resize-none"
                    />
                    <div className="flex gap-1 justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setEditingDraft("");
                        }}
                        className="text-[11px] text-gray-500 hover:underline"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onEdit(n.id, editingDraft);
                          setEditingId(null);
                          setEditingDraft("");
                        }}
                        className="text-[11px] text-blue-600 hover:underline"
                      >
                        저장
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {n.text &&
                    !(
                      n.text === "(이미지)" &&
                      n.imageUrls &&
                      n.imageUrls.length > 0
                    ) ? (
                      <div className="text-[12px] leading-snug whitespace-pre-wrap">
                        {n.text}
                      </div>
                    ) : null}
                    {n.imageUrls && n.imageUrls.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {n.imageUrls.map((src, i) => (
                          <a
                            key={i}
                            href={src}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block shrink-0"
                          >
                            <img
                              src={src}
                              alt=""
                              className="max-h-36 max-w-[min(100%,12rem)] rounded border border-yellow-200/80 object-cover"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                    {(isMine || canDelete) && (
                      <div className="mt-1 flex gap-2 justify-end">
                        {isMine && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(n.id);
                              setEditingDraft(n.text);
                            }}
                            className="text-[10px] text-blue-600 hover:underline"
                          >
                            편집
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => onDelete(n.id)}
                            className="text-[10px] text-red-500 hover:underline"
                          >
                            삭제
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="pt-1 space-y-1.5">
        <div className="flex gap-1.5 items-stretch">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            className="flex-1 min-h-0 text-[12px] border border-gray-200 rounded-md p-2 resize-none leading-snug"
            placeholder="코멘트를 입력하세요"
            aria-label={`${poiId} 코멘트 입력`}
          />
          <button
            type="button"
            onClick={() => {
              if (!draft.trim()) return;
              onAdd(draft);
              setDraft("");
            }}
            disabled={!draft.trim()}
            className="shrink-0 w-[3.75rem] flex items-center justify-center text-[11px] font-medium rounded-md bg-blue-600 text-white disabled:bg-gray-300"
          >
            추가
          </button>
        </div>
      </div>
    </div>
  );
}

function formatTime(ts: number) {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}
