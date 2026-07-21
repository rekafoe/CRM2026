export type { PrintAreaConfig, PrintAreaUvRect, SouvenirDraftMeta, SouvenirEditorKind, SouvenirProductMeta } from './types';
export {
  DEFAULT_PRINT_AREA_MUG,
  DEFAULT_PRINT_AREA_TSHIRT,
  parsePrintAreas,
  resolveActivePrintArea,
} from './types';
export {
  SOUVENIR_PREVIEW_DPI,
  SOUVENIR_PRODUCTION_DPI,
  printAreaAspect,
  printAreaFabricPx,
  printAreaPreviewTexturePx,
  assertAspectMatch,
} from './scale';
export { Souvenir3dPreview } from './Souvenir3dPreview';
export { Souvenir3dEditor } from './Souvenir3dEditor';
export { SouvenirPlacementPreview } from './SouvenirPlacementPreview';
export { ProceduralProduct, ProceduralMug, ProceduralTshirt } from './ProceduralProduct';
