import {
  measureFilledPhotoFieldFrameSize,
  resolvePhotoFieldFrameSize,
} from '../../../frontend/src/pages/admin/designEditor/photoFieldGeometry';

function mockFilledPhotoFieldGroup(opts: {
  frameW: number;
  frameH: number;
  groupScaleX?: number;
  groupScaleY?: number;
  unionScaledW: number;
  unionScaledH: number;
  photoFieldFw?: number;
  photoFieldFh?: number;
}) {
  const frameRect = {
    type: 'rect',
    width: opts.frameW,
    height: opts.frameH,
    scaleX: 1,
    scaleY: 1,
  };
  const group = {
    type: 'group',
    scaleX: opts.groupScaleX ?? 1,
    scaleY: opts.groupScaleY ?? 1,
    isPhotoField: true,
    photoFieldFilled: true,
    photoFieldFw: opts.photoFieldFw ?? opts.frameW,
    photoFieldFh: opts.photoFieldFh ?? opts.frameH,
    getObjects: () => [frameRect],
    getScaledWidth: () => opts.unionScaledW,
    getScaledHeight: () => opts.unionScaledH,
  };
  return group;
}

describe('measureFilledPhotoFieldFrameSize', () => {
  it('returns frame rect size, not union bbox of cover image', () => {
    const group = mockFilledPhotoFieldGroup({
      frameW: 200,
      frameH: 300,
      unionScaledW: 480,
      unionScaledH: 520,
    });
    expect(measureFilledPhotoFieldFrameSize(group as never)).toEqual({ fw: 200, fh: 300 });
  });

  it('includes group scale during corner resize', () => {
    const group = mockFilledPhotoFieldGroup({
      frameW: 200,
      frameH: 300,
      groupScaleX: 1.5,
      groupScaleY: 1.5,
      unionScaledW: 720,
      unionScaledH: 780,
    });
    expect(measureFilledPhotoFieldFrameSize(group as never)).toEqual({ fw: 300, fh: 450 });
  });
});

describe('resolvePhotoFieldFrameSize (filled)', () => {
  it('uses frame anchor, not getScaledWidth union', () => {
    const group = mockFilledPhotoFieldGroup({
      frameW: 200,
      frameH: 300,
      unionScaledW: 480,
      unionScaledH: 520,
    });
    expect(resolvePhotoFieldFrameSize(group as never)).toEqual({ fw: 200, fh: 300 });
  });
});
