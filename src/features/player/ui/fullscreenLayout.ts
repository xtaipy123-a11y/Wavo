export const DEFAULT_LEFT_PANE_PERCENT = 50;
export const FULLSCREEN_PANE_STORAGE_KEY = "wavo_fullscreen_left_pane_percent_v1";
export const DEFAULT_ARTWORK_SIZE = 380;
export const FULLSCREEN_ARTWORK_STORAGE_KEY = "wavo_fullscreen_artwork_size_v1";

export function getLeftPaneLimits(containerWidth: number) {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return { min: 25, max: 75 };
  }

  const dividerWidth = 12;
  const minPaneWidth = Math.min(360, Math.max(0, (containerWidth - dividerWidth) / 2));
  const min = Math.max(25, (minPaneWidth / containerWidth) * 100);
  const max = Math.min(75, ((containerWidth - dividerWidth - minPaneWidth) / containerWidth) * 100);
  return min <= max ? { min, max } : { min: 50, max: 50 };
}

export function clampLeftPanePercent(value: number, containerWidth: number): number {
  const { min, max } = getLeftPaneLimits(containerWidth);
  const safeValue = Number.isFinite(value) ? value : DEFAULT_LEFT_PANE_PERCENT;
  return Math.min(max, Math.max(min, safeValue));
}

export function getFullscreenArtworkSize(
  preferredSize: number,
  leftPanePercent: number,
  containerWidth: number,
  containerHeight: number,
): number {
  const desired = Number.isFinite(preferredSize) ? preferredSize : DEFAULT_ARTWORK_SIZE;
  const widthLimit = containerWidth > 0 ? (containerWidth * leftPanePercent) / 100 - 48 : 640;
  const heightLimit = containerHeight > 0 ? containerHeight - 290 : 640;
  return Math.round(Math.max(150, Math.min(640, desired, widthLimit, heightLimit)));
}
