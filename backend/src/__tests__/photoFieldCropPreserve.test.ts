import {
  computePhotoFieldCropSource,
  computePhotoFieldLayout,
  resolvePanZoomFromPhotoFieldCropSource,
  zoomPhotoFieldLayout,
} from '../services/designEditorPhotoFieldLayout';

describe('resolvePanZoomFromPhotoFieldCropSource', () => {
  const iw = 1200;
  const ih = 800;
  const oldFw = 300;
  const oldFh = 400;

  it('keeps the same intrinsic crop rect after frame resize', () => {
    const base = computePhotoFieldLayout('cover', oldFw, oldFh, iw, ih);
    const layout = zoomPhotoFieldLayout(base, 1.4);
    const panX = 12;
    const panY = -8;
    const crop = computePhotoFieldCropSource(oldFw, oldFh, iw, ih, layout, panX, panY, 'cover');

    const newFw = 450;
    const newFh = 600;
    const next = resolvePanZoomFromPhotoFieldCropSource(newFw, newFh, iw, ih, 'cover', crop);
    const nextBase = computePhotoFieldLayout('cover', newFw, newFh, iw, ih);
    const nextLayout = zoomPhotoFieldLayout(nextBase, next.zoom);
    const roundTrip = computePhotoFieldCropSource(
      newFw,
      newFh,
      iw,
      ih,
      nextLayout,
      next.panX,
      next.panY,
      'cover',
    );

    expect(roundTrip.x).toBeCloseTo(crop.x, 0);
    expect(roundTrip.y).toBeCloseTo(crop.y, 0);
    expect(roundTrip.w).toBeCloseTo(crop.w, 0);
    expect(roundTrip.h).toBeCloseTo(crop.h, 0);
  });
});
