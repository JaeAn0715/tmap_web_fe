import { useEffect, useState } from "react";
import clsx from "clsx";
import { fetchPoiPhoto } from "@/lib/poiPhoto";
import type { POI } from "@/types";

interface Props {
  poi: POI;
  /**
   * Lazily loads via `fetchPoiPhoto` (Gemini + Google Search grounding) when
   * not provided. Pass an explicit URL or `null` to override (e.g. when the
   * parent already batched the lookup). `undefined` = fetch myself.
   */
  initial?: string | null;
  /** Tailwind classes for the rendered image / fallback container. */
  className?: string;
  /** Optional fallback element when no photo is available. */
  fallback?: React.ReactNode;
}

/**
 * Shared photo cell. Renders an `<img>` if we have a URL (resolved either via
 * the prop or the lazy Gemini lookup), otherwise the supplied `fallback`.
 *
 * Keeps the network/disk cache (in `lib/poiPhoto`) and in-flight dedup, so
 * mounting many of these for the same POI is free after the first call.
 */
export function PoiPhoto({ poi, initial, className, fallback }: Props) {
  /* `initial === undefined` means "no opinion, please fetch". `null` means
   *  the caller has *already determined* there's no photo. */
  const [url, setUrl] = useState<string | null>(
    initial !== undefined ? initial : poi.photoUrl ?? null
  );
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
    if (initial !== undefined) {
      setUrl(initial);
      return;
    }
    if (poi.photoUrl) {
      setUrl(poi.photoUrl);
      return;
    }
    let cancelled = false;
    fetchPoiPhoto(poi)
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => {
        /* swallow — the fallback below will show. */
      });
    return () => {
      cancelled = true;
    };
  }, [poi.id, initial, poi.photoUrl]);

  if (url && !broken) {
    return (
      <img
        src={url}
        alt=""
        className={clsx("object-cover bg-gray-100", className)}
        /* Some hosts (Wikimedia Commons, news CDNs) redirect or 403 with a
         * referrer header. `no-referrer` makes display reliable across more
         * sources without losing anything we need. */
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setBroken(true)}
      />
    );
  }
  return <>{fallback}</>;
}

/**
 * Default emoji avatar matching the previous look, exported so different cards
 * can plug it in as the `fallback` of `<PoiPhoto>`.
 */
export function PoiEmojiAvatar({
  poi,
  className,
}: {
  poi: POI;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "rounded shrink-0 flex items-center justify-center bg-gradient-to-br from-yellow-100 to-orange-100",
        className
      )}
    >
      {emojiForCategory(poi.category)}
    </div>
  );
}

export function emojiForCategory(cat?: string): string {
  if (!cat) return "📍";
  const c = cat.toLowerCase();
  if (cat.includes("카페") || cat.includes("디저트")) return "☕";
  if (cat.includes("음식") || cat.includes("식당") || cat.includes("맛집")) return "🍽";
  if (cat.includes("주유") || cat.includes("EV") || c.includes("ev")) return "⛽";
  if (cat.includes("호텔") || cat.includes("숙박") || cat.includes("모텔")) return "🏨";
  if (cat.includes("병원") || cat.includes("의원") || cat.includes("약국")) return "🏥";
  if (cat.includes("쇼핑") || cat.includes("마트") || cat.includes("백화")) return "🛍";
  if (cat.includes("학교") || cat.includes("학원")) return "🏫";
  if (cat.includes("공원") || cat.includes("산")) return "🌳";
  if (cat.includes("주차")) return "🅿️";
  if (cat.includes("문화") || cat.includes("미술") || cat.includes("박물")) return "🖼";
  if (cat.includes("영화") || cat.includes("극장")) return "🎬";
  return "📍";
}
