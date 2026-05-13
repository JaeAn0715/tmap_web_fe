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

function closeDemo() {
  if (window.location.hash === DEMO_HASH) {
    const { pathname, search } = window.location;
    window.history.replaceState(null, "", `${pathname}${search}`);
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
 * Full-screen demo: seed "실험용" 즐겨찾기 모음 (50 POI + 아기 관련 노트) then
 * compare Gemini POI summaries with vs without `userComments`.
 *
 * Open: `http://localhost:5173/#/demo/baby-ai` (requires API mode + login).
 */
export function BabyAiDemoOverlay() {
  const open = useDemoBabyHashOpen();
  const user = useStore((s) => s.user);

  const [secret, setSecret] = useState(() => {
    try {
      const fromSession = sessionStorage.getItem("tmap_demo_seed_secret_v1");
      const fromEnv =
        typeof import.meta.env.VITE_DEMO_SEED_SECRET === "string"
          ? import.meta.env.VITE_DEMO_SEED_SECRET.trim()
          : "";
      return (fromSession ?? "").trim() || fromEnv;
    } catch {
      return typeof import.meta.env.VITE_DEMO_SEED_SECRET === "string"
        ? import.meta.env.VITE_DEMO_SEED_SECRET.trim()
        : "";
    }
  });
  const [restrictEmail, setRestrictEmail] = useState(false);

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

  const persistSecret = useCallback((v: string) => {
    setSecret(v);
    try {
      sessionStorage.setItem("tmap_demo_seed_secret_v1", v);
    } catch {
      /* ignore */
    }
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
      const headers: Record<string, string> = {};
      if (secret.trim()) headers["X-Demo-Seed-Secret"] = secret.trim();
      const body: { expectEmail?: string } = {};
      if (restrictEmail) body.expectEmail = "sprite1345@gmail.com";

      const res = await apiFetch<SeedResponse>("/demo/baby-ai-summary-seed", {
        method: "POST",
        headers,
        json: body,
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
              백엔드에 즐겨찾기 모음 <strong>실험용</strong>(고정 id, 50개 POI)과
              각 POI당 유모차·아기의자·이유식 성격의 공유 노트 3개를 만듭니다.
              이후 같은 장소에 대해 <code className="text-[11px] bg-gray-200 px-1 rounded">userComments</code>{" "}
              없음 / 주입 / <code className="text-[11px] bg-gray-200 px-1 rounded">GET /me/clusters</code>{" "}
              기반 실제 수집 세 가지로 Gemini 요약을 나란히 비교합니다.
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
          <label className="flex flex-col gap-1 text-[12px] text-gray-700">
            <span>
              X-Demo-Seed-Secret (백엔드 <code>DEMO_SEED_SECRET</code> 과 같게.
              비워 두면 로컬 non-production 에서만 허용됩니다.)
            </span>
            <input
              className="rounded border border-gray-300 px-2 py-1.5 text-sm"
              value={secret}
              onChange={(e) => persistSecret(e.target.value)}
              placeholder="선택"
              autoComplete="off"
            />
          </label>
          <label className="flex items-center gap-2 text-[12px] text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={restrictEmail}
              onChange={(e) => setRestrictEmail(e.target.checked)}
            />
            <span>
              로그인 계정이 <strong>sprite1345@gmail.com</strong> 일 때만 시드
              (expectEmail)
            </span>
          </label>
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
              title="B — 시드 시 주입한 3줄 (유모차·의자·이유식)"
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
