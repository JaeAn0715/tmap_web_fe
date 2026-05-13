import type { POI } from "@/types";

interface Props {
  poi: POI;
}

interface Row {
  icon: string;
  label: string;
  value: React.ReactNode;
}

/**
 * Renders TMAP POI metadata as a clean, human-readable list.
 * Falls back to a (collapsed) raw-data viewer for power users.
 *
 * Used by the cluster destination expansion in `ClusterDetailView` to surface
 * the same structured POI info that previously lived inside sticky notes.
 */
export function PoiDetails({ poi }: Props) {
  const raw = (poi.raw ?? {}) as Record<string, unknown>;

  const buildingNo =
    [str(raw.buildingNo1), str(raw.buildingNo2)].filter(Boolean).join("-") ||
    undefined;
  const newRoad =
    str(
      (raw.newAddressList as { newAddress?: Array<{ fullAddressRoad?: string }> })
        ?.newAddress?.[0]?.fullAddressRoad
    ) || poi.roadAddress;

  const rows: Row[] = [
    poi.address && { icon: "🏠", label: "지번 주소", value: poi.address },
    newRoad && { icon: "📍", label: "도로명 주소", value: newRoad },
    buildingNo && { icon: "🏢", label: "건물 번호", value: buildingNo },
    poi.tel && {
      icon: "📞",
      label: "전화",
      value: <a className="text-blue-600 hover:underline" href={`tel:${poi.tel}`}>{poi.tel}</a>,
    },
    poi.category && { icon: "🏷", label: "업종", value: poi.category },
    poi.bizCategory && { icon: "📂", label: "분류", value: poi.bizCategory },
    {
      icon: "🌐",
      label: "좌표",
      value: (
        <span className="font-mono text-[10px]">
          {poi.lat.toFixed(5)}, {poi.lng.toFixed(5)}
        </span>
      ),
    },
    str(raw.parkFlag) === "Y" && { icon: "🅿️", label: "주차", value: "가능" },
    str(raw.evChargerCnt) && {
      icon: "⚡",
      label: "EV 충전기",
      value: `${str(raw.evChargerCnt)}대`,
    },
  ].filter(Boolean) as Row[];

  return (
    <div className="bg-white border border-gray-200 rounded p-1.5 space-y-1">
      <div className="grid grid-cols-[auto_1fr] gap-x-1.5 gap-y-1 text-[11px]">
        {rows.map((r) => (
          <DetailRow key={r.label} row={r} />
        ))}
      </div>
      <RawDataDisclosure poi={poi} />
    </div>
  );
}

function DetailRow({ row }: { row: Row }) {
  return (
    <>
      <div className="text-gray-400 leading-snug">
        <span className="mr-1">{row.icon}</span>
        <span className="text-gray-500">{row.label}</span>
      </div>
      <div className="text-gray-800 leading-snug break-words">{row.value}</div>
    </>
  );
}

function RawDataDisclosure({ poi }: { poi: POI }) {
  return (
    <details className="text-[10px] text-gray-500">
      <summary className="cursor-pointer hover:text-gray-700">
        Raw 데이터 (개발자용)
      </summary>
      <pre className="mt-1 bg-gray-50 p-1 rounded max-h-40 overflow-auto whitespace-pre-wrap break-all">
        {JSON.stringify(poi.raw ?? poi, null, 2)}
      </pre>
    </details>
  );
}

function str(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s.length > 0 ? s : undefined;
}
