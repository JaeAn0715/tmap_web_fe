import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { useStore } from "@/store/useStore";
import { apiMode } from "@/lib/apiConfig";
import { apiFetch, ApiError } from "@/lib/http";
import { collectUserCommentsForPoi } from "@/lib/collectUserPoiComments";
import {
  clearPoiReviewSummaryMemoryCache,
  fetchPoiReviewSummary,
  poiPayloadForReviewSummary,
  type PoiReviewSummaryResponseBody,
} from "@/lib/poiReviewSummaryApi";
import type { POI } from "@/types";

const DEMO_HASH = "#/demo/baby-ai";

/** 백엔드 시드 시 POI별 노트 주제·문장 다양화용 (동일 문장 반복 금지 요청). */
const DEMO_NOTE_TOPICS = ["유아의자", "유모차", "이유식"] as const;

function useDemoBabyHashOpen(): boolean {
  const [open, setOpen] = useState(() => window.location.hash === DEMO_HASH);
  useEffect(() => {
    const on = () => setOpen(window.location.hash === DEMO_HASH);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return open;
}

type SeedResponse = {
  clusterId: string;
  clusterName: string;
  poiCount: number;
  notesCreated: number;
  samplePoi: POI;
  sampleUserComments: string[];
};

function stripDemoHashFromUrl(): void {
  if (window.location.hash !== DEMO_HASH) return;
  const oldURL = window.location.href;
  const { pathname, search, origin } = window.location;
  const nextPath = `${pathname}${search}`;
  window.history.replaceState(null, "", nextPath);
  const newURL = `${origin}${nextPath}`;
  try {
    window.dispatchEvent(new HashChangeEvent("hashchange", { oldURL, newURL }));
  } catch {
    window.dispatchEvent(new Event("hashchange"));
  }
}

function SummaryCard({
  title,
  loading,
  err,
  data,
}: {
  title: string;
  loading: boolean;
  err: string | null;
  data: PoiReviewSummaryResponseBody | null;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm space-y-2">
      <div className="text-xs font-bold text-gray-800">{title}</div>
      {loading && (
        <div className="text-[11px] text-gray-500 animate-pulse">Gemini 호출 중…</div>
      )}
      {err && (
        <div className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          {err}
        </div>
      )}
      {!loading && !err && data && (
        <div className="space-y-2 text-[12px] leading-snug text-gray-900">
          <div>
            <span className="font-semibold text-green-800">장점</span>
            <p className="whitespace-pre-wrap mt-0.5">{data.pros}</p>
          </div>
          <div>
            <span className="font-semibold text-amber-800">단점</span>
            <p className="whitespace-pre-wrap mt-0.5">{data.cons}</p>
          </div>
          {data.highlightTerms?.length ? (
            <div className="text-[10px] text-gray-500">
              강조: {data.highlightTerms.join(" · ")}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * Full-screen demo: seed "실험용" 즐겨찾기 모음 + 토픽별 공유 노트 then
 * compare Gemini POI summaries with vs without `userComments`.
 *
 * Open: `#/demo/baby-ai` (API 모드 + 로그인). 시드는 JWT 사용자에만 귀속(백엔드 구현).
 */
export function BabyAiDemoOverlay() {
  const hashOpen = useDemoBabyHashOpen();
  /** replaceState는 hashchange를 안 일으켜 오버레이가 남는 경우가 있어, 닫기 시 명시적으로 숨김 */
  const [userDismissed, setUserDismissed] = useState(false);

  useEffect(() => {
    if (hashOpen) setUserDismissed(false);
  }, [hashOpen]);

  const open = hashOpen && !userDismissed;
  const user = useStore((s) => s.user);

  const [seedBusy, setSeedBusy] = useState(false);
  const [seedErr, setSeedErr] = useState<string | null>(null);
  const [seedOk, setSeedOk] = useState<SeedResponse | null>(null);

  const [aLoading, setALoading] = useState(false);
  const [aErr, setAErr] = useState<string | null>(null);
  const [aData, setAData] = useState<PoiReviewSummaryResponseBody | null>(null);

  const [bLoading, setBLoading] = useState(false);
  const [bErr, setBErr] = useState<string | null>(null);
  const [bData, setBData] = useState<PoiReviewSummaryResponseBody | null>(null);

  const [cLoading, setCLoading] = useState(false);
  const [cErr, setCErr] = useState<string | null>(null);
  const [cData, setCData] = useState<PoiReviewSummaryResponseBody | null>(null);

  const closeDemo = useCallback(() => {
    setUserDismissed(true);
    stripDemoHashFromUrl();
  }, []);

  const runCompare = useCallback(async (poi: POI, injected: string[]) => {
    clearPoiReviewSummaryMemoryCache();
    const p = poiPayloadForReviewSummary(poi);
    const hints: string[] = [];

    setAErr(null);
    setBErr(null);
    setCErr(null);
    setAData(null);
    setBData(null);
    setCData(null);

    setALoading(true);
    setBLoading(true);
    setCLoading(true);
    try {
      const [ra, rb] = await Promise.all([
        fetchPoiReviewSummary({ poi: p, userComments: [], interestHints: hints }),
        fetchPoiReviewSummary({
          poi: p,
          userComments: injected,
          interestHints: hints,
        }),
      ]);
      setAData(ra);
      setBData(rb);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      setAErr(msg);
      setBErr(msg);
    } finally {
      setALoading(false);
      setBLoading(false);
    }

    try {
      const live = await collectUserCommentsForPoi(user?.id, poi.id);
      const rc = await fetchPoiReviewSummary({
        poi: p,
        userComments: live,
        interestHints: hints,
      });
      setCData(rc);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      setCErr(msg);
    } finally {
      setCLoading(false);
    }
  }, [user?.id]);

  const onSeed = async () => {
    if (!apiMode()) {
      setSeedErr("VITE_API_BASE_URL이 필요합니다.");
      return;
    }
    if (!user) {
      setSeedErr("먼저 Google 로그인을 해 주세요.");
      return;
    }
    setSeedBusy(true);
    setSeedErr(null);
    setSeedOk(null);
    try {
      const res = await apiFetch<SeedResponse>("/demo/baby-ai-summary-seed", {
        method: "POST",
        json: {
          topics: [...DEMO_NOTE_TOPICS],
          /** 백엔드: POI·토픽마다 문장을 다르게 (템플릿 한 줄 복붙 금지) */
          varyCommentsPerPoi: true,
        },
      });
      setSeedOk(res);
      clearPoiReviewSummaryMemoryCache();
      useStore.getState().bumpClusterList();
      await runCompare(res.samplePoi, res.sampleUserComments);
    } catch (e) {
      setSeedErr(
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e)
      );
    } finally {
      setSeedBusy(false);
    }
  };

  const onRefreshCompare = async () => {
    if (!seedOk) return;
    await runCompare(seedOk.samplePoi, seedOk.sampleUserComments);
  };

  if (!open) return null;

  return (
    <div
      className={clsx(
        "fixed inset-0 z-[100] flex flex-col bg-gray-50/98 backdrop-blur-sm",
        "overflow-y-auto"
      )}
      role="dialog"
      aria-labelledby="baby-ai-demo-title"
    >
      <div className="max-w-4xl mx-auto w-full p-4 space-y-4 pb-24">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1
              id="baby-ai-demo-title"
              className="text-lg font-bold text-gray-900"
            >
              AI 요약 × 아기 관련 코멘트 데모
            </h1>
            <p className="text-[12px] text-gray-600 mt-1 leading-relaxed">
              백엔드가 <strong>현재 로그인한 계정</strong>에만 즐겨찾기 모음{" "}
              <strong>실험용</strong>(고정 id, 다수 POI)과 공유 노트를 만듭니다. 토픽은{" "}
              <strong>{DEMO_NOTE_TOPICS.join(" · ")}</strong> — POI마다 문장이 겹치지 않게
              생성하도록 요청합니다. 이후 같은 장소에 대해{" "}
              <code className="text-[11px] bg-gray-200 px-1 rounded">userComments</code> 없음 /
              주입 / <code className="text-[11px] bg-gray-200 px-1 rounded">GET /me/clusters</code>{" "}
              기반 실제 수집 세 가지로 Gemini 요약을 비교합니다.
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-100"
            onClick={closeDemo}
          >
            닫기
          </button>
        </div>

        {!apiMode() && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            이 데모는 <code>VITE_API_BASE_URL</code> 이 설정된 API 모드에서만
            동작합니다.
          </div>
        )}

        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3 shadow-sm">
          <div className="text-sm font-semibold text-gray-800">1) 시드 실행</div>
          <p className="text-[11px] text-gray-600 leading-relaxed">
            별도 시크릿 없음. <strong>JWT로 식별된 본인 계정</strong>에만 데이터가 붙습니다
            (백엔드에서 <code>/demo/baby-ai-summary-seed</code> 가 Bearer 필수·타 유저 격리를
            보장해야 합니다).
          </p>
          <button
            type="button"
            disabled={seedBusy || !user}
            onClick={() => void onSeed()}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {seedBusy ? "생성 중…" : "실험 데이터 생성 · 요약 비교"}
          </button>
          {!user && (
            <p className="text-[11px] text-gray-500">
              우측 상단에서 Google 로그인 후 다시 시도하세요.
            </p>
          )}
          {seedErr && (
            <div className="text-[12px] text-red-800 bg-red-50 border border-red-200 rounded px-2 py-1">
              {seedErr}
            </div>
          )}
          {seedOk && (
            <div className="text-[12px] text-green-900 bg-green-50 border border-green-200 rounded px-2 py-1 space-y-1">
              <div>
                완료: 즐겨찾기 모음 <strong>{seedOk.clusterName}</strong> (
                {seedOk.poiCount} POI, 노트 {seedOk.notesCreated}건) · 샘플{" "}
                <strong>{seedOk.samplePoi.name}</strong>
              </div>
              <div className="text-[11px] text-green-800/90">
                사이드패널 목록에서 열기:{" "}
                <button
                  type="button"
                  className="underline font-medium"
                  onClick={() => {
                    window.location.hash = `#/c/${seedOk.clusterId}`;
                    closeDemo();
                  }}
                >
                  #{`/c/${seedOk.clusterId}`}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-800">
              2) 샘플 POI 요약 비교 (첫 번째 데모 POI)
            </div>
            {seedOk && (
              <button
                type="button"
                className="text-[11px] font-medium text-brand underline"
                onClick={() => void onRefreshCompare()}
              >
                Gemini 다시 호출
              </button>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <SummaryCard
              title="A — userComments 없음"
              loading={aLoading}
              err={aErr}
              data={aData}
            />
            <SummaryCard
              title={`B — 시드 시 주입 (${DEMO_NOTE_TOPICS.join("·")} 성격, 서로 다른 문장)`}
              loading={bLoading}
              err={bErr}
              data={bData}
            />
            <SummaryCard
              title="C — collectUserCommentsForPoi (앱과 동일 경로)"
              loading={cLoading}
              err={cErr}
              data={cData}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
