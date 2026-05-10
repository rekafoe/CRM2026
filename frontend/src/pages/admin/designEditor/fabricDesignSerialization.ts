import { FabricObject } from 'fabric';
import { FABRIC_CUSTOM_PROPS } from './constants';

FabricObject.customProperties = Array.from(
  new Set<string>([...(FabricObject.customProperties ?? []), ...FABRIC_CUSTOM_PROPS]),
);
