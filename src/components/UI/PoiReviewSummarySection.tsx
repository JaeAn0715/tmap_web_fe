import { Fragment, type ReactNode, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useStore } from "@/store/useStore";
import { apiMode } from "@/lib/apiConfig";
import { ApiError } from "@/lib/http";
import { buildInterestHints } from "@/lib/recentSearches";
import { collectUserCommentsForPoi } from "@/lib/collectUserPoiComments";
import {
  fetchPoiReviewSummary,
  type PoiReviewSummaryResponseBody,
} from "@/lib/poiReviewSummaryApi";
import type { POI } from "@/types";

interface Props {
  poi: POI;
  /**
   * Same-POI note bodies visible in the current surface (e.g. cluster row),
   * merged with server-side cluster scan so new notes count before list sync.
   */
  mergeUserCommentTexts?: readonly string[];
  className?: string;
}

/** Longest `terms` first, greedy left-to-right match (Unicode code points). */
function highlightTermsInLine(text: string, terms: string[]): ReactNode {
  const tset = [
    ...new Set(
      terms
        .map((t) => t.trim())
        .filter((t) => t.length >= 2)
    ),
  ].sort((a, b) => b.length - a.length);
  if (!text || tset.length === 0) return text;

  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < text.length) {
    let hit: string | null = null;
    for (const t of tset) {
      if (text.startsWith(t, i)) {
        hit = t;
        break;
      }
    }
    if (hit) {
      out.push(
        <strong key={k++} className="font-semibold text-brand">
          {hit}
        </strong>
      );
      i += hit.length;
    } else {
      const ch = text[i];
      out.push(<Fragment key={k++}>{ch}</Fragment>);
      i += 1;
    }
  }
  return <>{out}</>;
}

function renderBlock(text: string, terms: string[]): ReactNode {
  const lines = text.split("\n");
  return lines.map((line, idx) => (
    <Fragment key={idx}>
      {idx > 0 ? <br /> : null}
      {highlightTermsInLine(line, terms)}
    </Fragment>
  ));
}

function isGeminiKey503(e: unknown): boolean {
  if (!(e instanceof ApiError) || e.status !== 503) return false;
  const combined = `${e.body ?? ""}\n${e.message}`;
  return /GEMINI_API_KEY|GEMINI.*KEY|not configured|api\s*key|API_KEY/i.test(
    combined
  );
}

/**
 * Loads Gemini POI review summary via backend when `VITE_API_BASE_URL` is set.
 * Logged-in users send their cluster notes as `userComments`; anonymous users
 * still get a summary (empty comments, search `interestHints` only).
 */
export function PoiReviewSummarySection({
  poi,
  mergeUserCommentTexts,
  className,
}: Props) {
  const user = useStore((s) => s.user);
  const mainSearchKeyword = useStore((s) => s.mainSearchKeyword);

  const mergeKey = useMemo(
    () =>
      (mergeUserCommentTexts ?? [])
        .map((t) => t.trim())
        .filter(Boolean)
        .join("\x1e"),
    [mergeUserCommentTexts]
  );

  const poiRequestKey = useMemo(
    () =>
      JSON.stringify({
        id: poi.id,
        name: poi.name,
        lat: poi.lat,
        lng: poi.lng,
        address: poi.address,
        roadAddress: poi.roadAddress,
        category: poi.category,
        bizCategory: poi.bizCategory,
        tel: poi.tel,
      }),
    [
      poi.id,
      poi.name,
      poi.lat,
      poi.lng,
      poi.address,
      poi.roadAddress,
      poi.category,
      poi.bizCategory,
      poi.tel,
    ]
  );

  const [data, setData] = useState<PoiReviewSummaryResponseBody | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!apiMode()) {
      setData(null);
      setErr(null);
      setHidden(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setData(null);
    setErr(null);
    setHidden(false);
    setLoading(true);

    void (async () => {
      try {
        const userComments = await collectUserCommentsForPoi(
          user?.id,
          poi.id,
          mergeUserCommentTexts
        );
        const interestHints = buildInterestHints(mainSearchKeyword);
        if (cancelled) return;
        const res = await fetchPoiReviewSummary({
          poi,
          userComments,
          interestHints,
        });
        if (cancelled) return;
        if (!res.pros.trim() && !res.cons.trim()) {
          setData(null);
        } else {
          setData(res);
        }
      } catch (e: unknown) {
        if (cancelled) return;
        if (isGeminiKey503(e)) {
          setHidden(true);
          return;
        }
        if (e instanceof ApiError && e.status === 401) {
          setErr("요약을 불러오려면 로그인이 필요합니다.");
          return;
        }
        if (e instanceof ApiError && (e.status === 502 || e.status === 503)) {
          const detail = e.message.replace(/\s+/g, " ").trim().slice(0, 160);
          setErr(
            detail
              ? `요약을 불러오지 못했습니다. (${detail})`
              : "요약을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
          );
          return;
        }
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [poi, poiRequestKey, user?.id, mainSearchKeyword, mergeKey]);

  if (!apiMode()) return null;
  if (hidden) return null;

  if (loading) {
    return (
      <div
        className={clsx(
          "rounded-lg border border-emerald-100 bg-white p-2 space-y-1.5 animate-pulse",
          className
        )}
      >
        <div className="text-sm font-semibold text-emerald-700">
          AI 요약 불러오는 중…
        </div>
        <div className="h-2 bg-emerald-100/80 rounded w-full" />
        <div className="h-2 bg-emerald-100/80 rounded w-4/5" />
      </div>
    );
  }

  if (err) {
    return (
      <div
        className={clsx(
          "rounded-lg border border-amber-200 bg-amber-50/90 px-2 py-1.5 text-[11px] text-amber-900",
          className
        )}
      >
        {err}
      </div>
    );
  }

  if (!data) return null;

  const terms = data.highlightTerms ?? [];

  return (
    <div className={clsx("space-y-1.5", className)}>
      <div className="rounded-lg border border-emerald-200 bg-white p-2 shadow-sm">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="text-sm font-semibold text-emerald-800 shrink-0">
            AI 요약
          </div>
          <p className="text-[10px] text-gray-400 leading-snug text-right max-w-[58%]">
            일부 정보는 현재와 다를 수 있습니다.
          </p>
        </div>
        <div className="space-y-1.5">
          <div>
            <div className="text-[10px] font-semibold text-green-700 mb-0.5">
              장점
            </div>
            <div className="text-[12px] leading-snug text-tmap-ink whitespace-pre-wrap">
              {renderBlock(data.pros, terms)}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-amber-800 mb-0.5">
              단점
            </div>
            <div className="text-[12px] leading-snug text-tmap-ink whitespace-pre-wrap">
              {renderBlock(data.cons, terms)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
