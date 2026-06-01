import {
  CLIENT_PHOTO_FIELD_WIDTH_FRACTION,
  resolvePhotoFieldSizeForPage,
} from '../services/designEditorPhotoFieldClientSizing';

describe('resolvePhotoFieldSizeForPage', () => {
  const base = {
    pageWidthPx: 1000,
    pageHeightPx: 700,
    safeZonePx: 0,
  };

  it('uses 30% of page width for square', () => {
    const { width, height } = resolvePhotoFieldSizeForPage({
      ...base,
      aspectW: 1,
      aspectH: 1,
    });
    expect(width).toBe(Math.round(1000 * CLIENT_PHOTO_FIELD_WIDTH_FRACTION));
    expect(height).toBe(width);
  });

  it('keeps aspect for landscape 4:3', () => {
    const { width, height } = resolvePhotoFieldSizeForPage({
      ...base,
      aspectW: 4,
      aspectH: 3,
    });
    expect(width).toBe(300);
    expect(height).toBe(225);
  });

  it('clamps into safe zone when too tall', () => {
    const { width, height } = resolvePhotoFieldSizeForPage({
      pageWidthPx: 1000,
      pageHeightPx: 200,
      safeZonePx: 10,
      aspectW: 3,
      aspectH: 4,
    });
    const safeH = 200 - 20;
    expect(height).toBeLessThanOrEqual(safeH);
    expect(width).toBeLessThanOrEqual(1000 - 20);
    expect(Math.abs(width / height - 3 / 4)).toBeLessThan(0.05);
  });
});
