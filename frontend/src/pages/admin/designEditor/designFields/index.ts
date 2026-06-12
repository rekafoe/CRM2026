export {
  isClientAddedPhotoField,
  isClientAddedTextField,
  isTemplatePhotoField,
  isDesignPhotoField,
  type DesignFieldKind,
} from './fieldMeta';

export { inferSceneScaleFromPageExtents } from './sceneScale';

export {
  createEmptyPhotoField,
  syncImportedPhotoFieldGeometry,
  syncImportedPhotoFieldsOnCanvas,
  upgradeEmptyPhotoFieldsOnCanvas,
} from './photoField';

export {
  createClientTextbox,
  type CreateClientTextboxOpts,
} from './textField';

export { normalizeDesignFieldsOnCanvas } from './normalizePageFields';
