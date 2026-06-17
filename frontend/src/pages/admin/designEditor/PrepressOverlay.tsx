import React from 'react';

type PrepressOverlayProps = {
  canvasWidthPx: number;
  pageWidthPx: number;
  pageHeightPx: number;
  bleedPx: number;
  safeZonePx: number;
  isSpreadView: boolean;
  showBleed: boolean;
  showTrim: boolean;
  showSafeZone: boolean;
};

function buildBandPath(opts: {
  x: number;
  y: number;
  width: number;
  height: number;
  insetX: number;
  insetY: number;
  insetWidth: number;
  insetHeight: number;
}): string {
  const { x, y, width, height, insetX, insetY, insetWidth, insetHeight } = opts;
  return [
    `M ${x} ${y} L ${x + width} ${y} L ${x + width} ${y + height} L ${x} ${y + height} Z`,
    `M ${insetX} ${insetY} L ${insetX + insetWidth} ${insetY}`,
    `L ${insetX + insetWidth} ${insetY + insetHeight}`,
    `L ${insetX} ${insetY + insetHeight} Z`,
  ].join(' ');
}

export const PrepressOverlay: React.FC<PrepressOverlayProps> = ({
  canvasWidthPx,
  pageWidthPx,
  pageHeightPx,
  bleedPx,
  safeZonePx,
  isSpreadView,
  showBleed,
  showTrim,
  showSafeZone,
}) => {
  const pageOffsets = isSpreadView ? [0, pageWidthPx] : [0];
  const shouldShowBleed = showBleed && bleedPx > 0;
  const shouldShowSafeZone = showSafeZone && safeZonePx > 0;
  const shouldShowSpreadSeamWarning = isSpreadView && pageWidthPx > 0 && pageHeightPx > 0;
  const seamWarningWidth = Math.max(28, Math.min(72, safeZonePx > 0 ? safeZonePx * 2 : 36));
  const safeLabelY = Math.max(48, Math.min(safeZonePx + 30, pageHeightPx - 48));
  const pageSafeLabelWidth = Math.max(150, Math.min(pageWidthPx - 18, 460));
  const spreadSafeLabelWidth = Math.max(240, Math.min(canvasWidthPx - 24, 760));
  const safeLabelBoxHeight = 64;
  const seamLabelY = pageHeightPx / 2;

  return (
    <svg
      className="fabric-guides-overlay prepress-overlay"
      width={canvasWidthPx}
      height={pageHeightPx}
      viewBox={`0 0 ${canvasWidthPx} ${pageHeightPx}`}
      aria-hidden="true"
    >
      {pageOffsets.map((pageX) => (
        <g key={pageX}>
          {shouldShowBleed && (
            <>
              <path
                className="prepress-overlay__bleed-band"
                fillRule="evenodd"
                d={buildBandPath({
                  x: pageX - bleedPx,
                  y: -bleedPx,
                  width: pageWidthPx + bleedPx * 2,
                  height: pageHeightPx + bleedPx * 2,
                  insetX: pageX,
                  insetY: 0,
                  insetWidth: pageWidthPx,
                  insetHeight: pageHeightPx,
                })}
              />
              <rect
                className="prepress-overlay__bleed-line"
                x={pageX - bleedPx}
                y={-bleedPx}
                width={pageWidthPx + bleedPx * 2}
                height={pageHeightPx + bleedPx * 2}
              />
            </>
          )}
          {showTrim && (
            <rect
              className="prepress-overlay__trim-line"
              x={pageX}
              y={0}
              width={pageWidthPx}
              height={pageHeightPx}
            />
          )}
          {shouldShowSafeZone && (
            <>
              <path
                className="prepress-overlay__safe-band"
                fillRule="evenodd"
                d={buildBandPath({
                  x: pageX,
                  y: 0,
                  width: pageWidthPx,
                  height: pageHeightPx,
                  insetX: pageX + safeZonePx,
                  insetY: safeZonePx,
                  insetWidth: Math.max(1, pageWidthPx - safeZonePx * 2),
                  insetHeight: Math.max(1, pageHeightPx - safeZonePx * 2),
                })}
              />
              <rect
                className="prepress-overlay__safe-line"
                x={pageX + safeZonePx}
                y={safeZonePx}
                width={Math.max(1, pageWidthPx - safeZonePx * 2)}
                height={Math.max(1, pageHeightPx - safeZonePx * 2)}
              />
              {!isSpreadView && (
                <rect
                  className="prepress-overlay__label-bg"
                  x={pageX + pageWidthPx / 2 - pageSafeLabelWidth / 2}
                  y={safeLabelY - safeLabelBoxHeight / 2}
                  width={pageSafeLabelWidth}
                  height={safeLabelBoxHeight}
                  rx={safeLabelBoxHeight / 2}
                />
              )}
              {!isSpreadView && (
                <text
                  className="prepress-overlay__label"
                  x={pageX + pageWidthPx / 2}
                  y={safeLabelY}
                >
                  Важное внутри красной линии
                </text>
              )}
            </>
          )}
        </g>
      ))}
      {shouldShowSafeZone && isSpreadView && (
        <>
          <rect
            className="prepress-overlay__label-bg"
            x={canvasWidthPx / 2 - spreadSafeLabelWidth / 2}
            y={safeLabelY - safeLabelBoxHeight / 2}
            width={spreadSafeLabelWidth}
            height={safeLabelBoxHeight}
            rx={safeLabelBoxHeight / 2}
          />
          <text
            className="prepress-overlay__label prepress-overlay__label--spread"
            x={canvasWidthPx / 2}
            y={safeLabelY}
          >
            Важное внутри красной линии
          </text>
        </>
      )}
      {shouldShowSpreadSeamWarning && (
        <g className="prepress-overlay__spread-seam">
          <rect
            className="prepress-overlay__spread-seam-band"
            x={pageWidthPx - seamWarningWidth / 2}
            y={0}
            width={seamWarningWidth}
            height={pageHeightPx}
          />
          <line
            className="prepress-overlay__spread-seam-guide"
            x1={pageWidthPx - seamWarningWidth / 2}
            y1={0}
            x2={pageWidthPx - seamWarningWidth / 2}
            y2={pageHeightPx}
          />
          <line
            className="prepress-overlay__spread-seam-line"
            x1={pageWidthPx}
            y1={0}
            x2={pageWidthPx}
            y2={pageHeightPx}
          />
          <line
            className="prepress-overlay__spread-seam-guide"
            x1={pageWidthPx + seamWarningWidth / 2}
            y1={0}
            x2={pageWidthPx + seamWarningWidth / 2}
            y2={pageHeightPx}
          />
          <text
            className="prepress-overlay__spread-seam-label"
            x={pageWidthPx}
            y={seamLabelY}
            transform={`rotate(-90 ${pageWidthPx} ${seamLabelY})`}
          >
            Не ставьте фото и текст на стык
          </text>
        </g>
      )}
    </svg>
  );
};
