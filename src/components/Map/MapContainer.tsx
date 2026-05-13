interface Props {
  containerRef: React.RefObject<HTMLDivElement>;
  error?: string | null;
}

export function MapContainer({ containerRef, error }: Props) {
  return (
    <div className="absolute inset-0">
      <div
        ref={containerRef}
        className="tmap-container"
        aria-label="map"
        data-testid="tmap-container"
      />
      {error && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white border border-red-300 rounded-lg p-4 text-sm text-red-700 shadow max-w-sm">
          <div className="font-semibold mb-1">지도를 불러오지 못했습니다</div>
          <div className="text-xs leading-relaxed">{error}</div>
          <div className="mt-2 text-xs text-gray-600">
            루트의 <code>.env</code> 파일에 <code>VITE_TMAP_APP_KEY</code>가 설정되어 있는지 확인하세요.
          </div>
        </div>
      )}
    </div>
  );
}
