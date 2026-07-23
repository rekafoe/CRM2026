import type { DesignPage } from './types';
import type { PageSaveSnapshot } from './mergePagesSnapshot';
import { parsePageLoadKey } from './canvas/canvasSerialization';
import { isTemplateTextLayerId } from './spreadPageObjectIds';

type FabricJsonObject = Record<string, unknown>;
function getFabricJsonObjects(fabricJSON: unknown): FabricJsonObject[] {
  if (!fabricJSON || typeof fabricJSON !== 'object' || Array.isArray(fabricJSON)) return [];
  const objects = (fabricJSON as FabricJsonObject).objects;
  return Array.isArray(objects)
    ? objects.filter((obj): obj is FabricJsonObject => !!obj && typeof obj === 'object' && !Array.isArray(obj))
    : [];
}

function hasPhotoFieldObject(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as FabricJsonObject;
  if (obj.isPhotoField === true) return true;
  return getFabricJsonObjects(obj).some(hasPhotoFieldObject);
}

function isTextLikeFabricJsonObject(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const type = String((value as FabricJsonObject).type ?? '').toLowerCase();
  return type === 'i-text' || type === 'textbox' || type === 'text';
}

function normalizeFabricTextContent(value: unknown): string {
  return String(value ?? '').replace(/\u200b/g, '').trim();
}

function isDesignedTemplateTextRecord(obj: FabricJsonObject): boolean {
  return isTemplateTextLayerId(obj.id) && obj.textFieldClientAdded !== true;
}

function readDesignedTextLayoutWidth(obj: FabricJsonObject): number {
  const candidates = [obj.width, obj.textFieldLayoutWidth, obj._sacredWidth, obj._editLayoutWidthFloor]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);
  return candidates.length > 0 ? Math.max(...candidates) : 0;
}

function preserveDesignedTextLayoutWhenSavedNarrower(
  previousObjects: FabricJsonObject[],
  savedObjects: FabricJsonObject[],
): FabricJsonObject[] {
  const prevById = collectObjectsById(previousObjects);
  return savedObjects.map((obj) => {
    const id = readFabricObjectId(obj);
    if (!id || !isDesignedTemplateTextRecord(obj)) return obj;
    const prev = prevById.get(id);
    if (!prev || !isDesignedTemplateTextRecord(prev)) return obj;
    // Unedited text_*: SVG/import часто завышает width — content-fit shrink должен сохраняться.
    // Иначе после каждого flip разворота поле снова «жирное» справа.
    if (obj.textFieldUserEdited !== true) {
      return obj;
    }
    // Ручной resize уголками (+ textFieldUserLayoutWidth) — доверяем сохранённой ширине.
    if (obj.textFieldUserLayoutWidth === true) {
      return obj;
    }
    // Edited: если текст реально меняли — доверяем content-fit из finishTextEdit (можно сузить).
    // Restore wide только при том же тексте (защита от ложного сужения Fabric на exit).
    const prevText = normalizeFabricTextContent(prev.text);
    const savedText = normalizeFabricTextContent(obj.text);
    if (prevText !== savedText) {
      return obj;
    }
    const prevWidth = readDesignedTextLayoutWidth(prev);
    const savedWidth = readDesignedTextLayoutWidth(obj);
    if (prevWidth > savedWidth + 1) {
      const next = cloneFabricJson(obj);
      next.width = prevWidth;
      next.textFieldLayoutWidth = prevWidth;
      return next;
    }
    return obj;
  });
}

function preserveTextContentWhenSavedEmpty(
  previousObjects: FabricJsonObject[],
  savedObjects: FabricJsonObject[],
): FabricJsonObject[] {
  const prevById = collectObjectsById(previousObjects.map((obj) => cloneFabricJson(obj)));
  return savedObjects.map((obj) => {
    const id = readFabricObjectId(obj);
    if (!id || !isTextLikeFabricJsonObject(obj)) return obj;
    const prev = prevById.get(id);
    if (!prev || !isTextLikeFabricJsonObject(prev)) return obj;
    const prevText = normalizeFabricTextContent(prev.text);
    const savedText = normalizeFabricTextContent(obj.text);
    if (prevText && prevText !== savedText && !savedText) {
      return { ...cloneFabricJson(obj), text: prev.text };
    }
    return obj;
  });
}

function hasTextLikeObject(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as FabricJsonObject;
  if (isTextLikeFabricJsonObject(obj)) return true;
  return getFabricJsonObjects(obj).some(hasTextLikeObject);
}

function cloneFabricJson(value: Record<string, unknown>): Record<string, unknown> {
  try {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  } catch {
    return { ...value };
  }
}

function buildFabricObjectSignature(obj: FabricJsonObject): string {
  try {
    return JSON.stringify(obj);
  } catch {
    return `${String(obj.type ?? 'object')}:${String(obj.id ?? '')}`;
  }
}

function buildObjectSignatureCounts(objects: FabricJsonObject[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const obj of objects) {
    const signature = buildFabricObjectSignature(obj);
    counts.set(signature, (counts.get(signature) ?? 0) + 1);
  }
  return counts;
}

export function readFabricObjectId(obj: FabricJsonObject): string | null {
  const id = obj.id;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

function pickPreferredFabricJsonObject(
  best: FabricJsonObject,
  current: FabricJsonObject,
): FabricJsonObject {
  const bestLayout = Number(best.textFieldLayoutWidth ?? best.width ?? 0);
  const curLayout = Number(current.textFieldLayoutWidth ?? current.width ?? 0);
  if (curLayout > bestLayout + 1) return current;
  if (bestLayout > curLayout + 1) return best;
  if (current.textFieldUserEdited === true && best.textFieldUserEdited !== true) return current;
  return best;
}

/** Оставляет предпочтительное вхождение каждого id, сохраняя порядок слоёв. */
export function deduplicateFabricJsonObjectsById(objects: FabricJsonObject[]): FabricJsonObject[] {
  const preferredById = new Map<string, FabricJsonObject>();
  for (const obj of objects) {
    const id = readFabricObjectId(obj);
    if (!id) continue;
    const prev = preferredById.get(id);
    preferredById.set(id, prev ? pickPreferredFabricJsonObject(prev, obj) : obj);
  }
  const seen = new Set<string>();
  const out: FabricJsonObject[] = [];
  for (const obj of objects) {
    const id = readFabricObjectId(obj);
    if (!id) {
      out.push(cloneFabricJson(obj));
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(cloneFabricJson(preferredById.get(id)!));
  }
  return out;
}

function isClientAddedFabricObject(obj: FabricJsonObject): boolean {
  return obj.photoFieldClientAdded === true || obj.textFieldClientAdded === true;
}

function shouldPreserveMissingPreviousObject(obj: FabricJsonObject): boolean {
  if (hasPhotoFieldObject(obj)) return true;
  if (isDesignedTemplateTextRecord(obj)) return true;
  if (isClientAddedFabricObject(obj)) return true;
  return false;
}

/** Собирает id объектов в fabricJSON (включая вложенные group). */
export function collectFabricJsonObjectIds(fabricJSON: unknown): Set<string> {
  const ids = new Set<string>();
  const walk = (objects: FabricJsonObject[]) => {
    for (const obj of objects) {
      const id = readFabricObjectId(obj);
      if (id) ids.add(id);
      getFabricJsonObjects(obj).forEach((child) => walk([child]));
    }
  };
  walk(getFabricJsonObjects(fabricJSON));
  return ids;
}

/** true, если в canvasJson есть id, которых нет в сохранённой странице. */
export function fabricJsonHasIdsNotInStored(
  canvasJson: Record<string, unknown>,
  storedJson: unknown,
): boolean {
  const canvasIds = collectFabricJsonObjectIds(canvasJson);
  const storedIds = collectFabricJsonObjectIds(storedJson);
  for (const id of canvasIds) {
    if (!storedIds.has(id)) return true;
  }
  return false;
}

function mergeMissingObjectsFromPrevious(
  previousObjects: FabricJsonObject[],
  mergedObjects: FabricJsonObject[],
  options?: { siblingObjects?: FabricJsonObject[] },
): FabricJsonObject[] {
  const mergedIds = new Set(
    mergedObjects.map((obj) => readFabricObjectId(obj)).filter((id): id is string => !!id),
  );
  const siblingById = options?.siblingObjects
    ? collectObjectsById(options.siblingObjects)
    : null;
  const appended = previousObjects
    .filter((obj) => {
      const id = readFabricObjectId(obj);
      if (!id || mergedIds.has(id)) return false;
      if (siblingById && shouldSkipRestoringSpreadMirrorGhost(obj, siblingById)) return false;
      return shouldPreserveMissingPreviousObject(obj);
    })
    .map((obj) => cloneFabricJson(obj));
  if (appended.length === 0) return mergedObjects;
  return deduplicateFabricJsonObjectsById([...mergedObjects, ...appended]);
}

/**
 * Старый split зеркалил text_* на обе страницы. Новый split кладёт текст только на одну,
 * но reconcile возвращал «призрак» с соседней страницы (тот же id + тот же text).
 */
function shouldSkipRestoringSpreadMirrorGhost(
  previousObj: FabricJsonObject,
  siblingById: Map<string, FabricJsonObject>,
): boolean {
  if (!isDesignedTemplateTextRecord(previousObj)) return false;
  const id = readFabricObjectId(previousObj);
  if (!id) return false;
  const sibling = siblingById.get(id);
  if (!sibling || !isDesignedTemplateTextRecord(sibling)) return false;
  return normalizeFabricTextContent(previousObj.text) === normalizeFabricTextContent(sibling.text);
}

function collectObjectsById(
  objects: FabricJsonObject[],
  out = new Map<string, FabricJsonObject>(),
): Map<string, FabricJsonObject> {
  objects.forEach((obj) => {
    const id = readFabricObjectId(obj);
    if (id) out.set(id, obj);
    getFabricJsonObjects(obj).forEach((child) => collectObjectsById([child], out));
  });
  return out;
}

function replaceObjectsById(
  objects: FabricJsonObject[],
  replacements: Map<string, FabricJsonObject>,
  usedIds: Set<string>,
): FabricJsonObject[] {
  return objects.map((obj) => {
    const id = readFabricObjectId(obj);
    if (id && replacements.has(id)) {
      usedIds.add(id);
      return cloneFabricJson(replacements.get(id)!);
    }
    const children = getFabricJsonObjects(obj);
    if (children.length === 0) return obj;
    return {
      ...obj,
      objects: replaceObjectsById(children, replacements, usedIds),
    };
  });
}

/** Не даём пустому/урезанному canvas snapshot затереть сохранённую страницу при transition commit. */
export function reconcilePhotoFieldSnapshotLoss(
  previous: Record<string, unknown> | undefined,
  saved: Record<string, unknown>,
  options?: { siblingPageJson?: Record<string, unknown> },
): Record<string, unknown> {
  if (!previous) return saved;
  const previousObjects = getFabricJsonObjects(previous);
  const savedObjects = getFabricJsonObjects(saved);
  const siblingObjects = options?.siblingPageJson
    ? getFabricJsonObjects(options.siblingPageJson)
    : undefined;
  if (previousObjects.length === 0) return saved;
  if (savedObjects.length === 0) {
    // Пустой saved: не возвращаем целиком previous, если sibling уже держит те же text_* (mirror ghost).
    if (siblingObjects && siblingObjects.length > 0) {
      const siblingById = collectObjectsById(siblingObjects);
      const filtered = previousObjects.filter(
        (obj) => !shouldSkipRestoringSpreadMirrorGhost(obj, siblingById),
      );
      if (filtered.length !== previousObjects.length) {
        return { ...cloneFabricJson(previous), objects: filtered.map((obj) => cloneFabricJson(obj)) };
      }
    }
    return cloneFabricJson(previous);
  }
  if (savedObjects.length >= previousObjects.length) {
    const dedupedSaved = deduplicateFabricJsonObjectsById(savedObjects);
    const withText = preserveTextContentWhenSavedEmpty(previousObjects, dedupedSaved);
    const merged = mergeMissingObjectsFromPrevious(
      previousObjects,
      preserveDesignedTextLayoutWhenSavedNarrower(previousObjects, withText),
      { siblingObjects },
    );
    const changed = merged.length !== dedupedSaved.length
      || merged.some((obj, index) => JSON.stringify(obj) !== JSON.stringify(dedupedSaved[index]));
    if (changed) {
      return { ...saved, objects: merged };
    }
    return { ...saved, objects: dedupedSaved };
  }
  if (
    !hasPhotoFieldObject(saved)
    && !hasTextLikeObject(saved)
    && (hasPhotoFieldObject(previous) || hasTextLikeObject(previous))
  ) {
    if (siblingObjects && siblingObjects.length > 0) {
      const siblingById = collectObjectsById(siblingObjects);
      const filtered = previousObjects.filter(
        (obj) => !shouldSkipRestoringSpreadMirrorGhost(obj, siblingById),
      );
      if (filtered.length !== previousObjects.length) {
        return { ...cloneFabricJson(previous), objects: filtered.map((obj) => cloneFabricJson(obj)) };
      }
    }
    return cloneFabricJson(previous);
  }
  if (!hasPhotoFieldObject(saved) && !hasTextLikeObject(saved)) return saved;

  const replacements = collectObjectsById(savedObjects);
  if (replacements.size === 0) return saved;
  const prevById = collectObjectsById(previousObjects);
  for (const [id, savedObj] of replacements) {
    const prev = prevById.get(id);
    if (!prev) continue;
    const [upgraded] = preserveDesignedTextLayoutWhenSavedNarrower([prev], [savedObj]);
    replacements.set(id, upgraded);
  }
  const usedIds = new Set<string>();
  const nextObjects = replaceObjectsById(
    previousObjects.map((obj) => cloneFabricJson(obj)),
    replacements,
    usedIds,
  );
  const existingSignatures = buildObjectSignatureCounts(nextObjects);
  const appendedObjects = savedObjects
    .filter((obj) => {
      const id = readFabricObjectId(obj);
      if (id) return !usedIds.has(id);
      const signature = buildFabricObjectSignature(obj);
      const remaining = existingSignatures.get(signature) ?? 0;
      if (remaining > 0) {
        existingSignatures.set(signature, remaining - 1);
        return false;
      }
      return true;
    })
    .map((obj) => cloneFabricJson(obj));

  let mergedObjects = deduplicateFabricJsonObjectsById([...nextObjects, ...appendedObjects]);
  if (siblingObjects && siblingObjects.length > 0) {
    const siblingById = collectObjectsById(siblingObjects);
    const before = mergedObjects.length;
    mergedObjects = mergedObjects.filter(
      (obj) => {
        const id = readFabricObjectId(obj);
        // Уже пришедшие из saved оставляем; выкидываем только previous-only ghost
        // с тем же текстом, что на sibling (если id не из usedIds/saved — они уже в usedIds).
        if (id && usedIds.has(id)) return true;
        return !shouldSkipRestoringSpreadMirrorGhost(obj, siblingById);
      },
    );
    if (mergedObjects.length !== before) {
      return { ...saved, objects: mergedObjects };
    }
  }

  return {
    ...saved,
    objects: mergedObjects,
  };
}

export function reconcileSavedSnapshotLoss(
  pages: DesignPage[],
  saved: PageSaveSnapshot,
  mergeContext: { currentPage: number; leftPageIdx: number; rightPageIdx: number },
): PageSaveSnapshot {
  if (saved.kind === 'single') {
    const previous = pages[mergeContext.currentPage]?.fabricJSON;
    const reconciled = reconcilePhotoFieldSnapshotLoss(previous, saved.json);
    return { kind: 'single', json: reconciled };
  }
  return {
    kind: 'spread',
    left: reconcilePhotoFieldSnapshotLoss(
      pages[mergeContext.leftPageIdx]?.fabricJSON,
      saved.left,
      { siblingPageJson: saved.right },
    ),
    right: reconcilePhotoFieldSnapshotLoss(
      pages[mergeContext.rightPageIdx]?.fabricJSON,
      saved.right,
      { siblingPageJson: saved.left },
    ),
  };
}

function areFabricJsonEqual(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
  } catch {
    return false;
  }
}

/**
 * Нужно ли писать исходящую страницу в pages[] перед загрузкой следующей.
 * Сравниваем с pages[], а не с undo-history: после saveSnapshot history уже обновлён, а pages[] — ещё нет.
 */
export function shouldCommitOutgoingPageSnapshot(
  prevKey: string,
  pages: DesignPage[],
  canvasJson: Record<string, unknown>,
): boolean {
  const parsedPrev = parsePageLoadKey(prevKey);
  if (!parsedPrev) return true;
  if (parsedPrev.type === 'spread') return true;
  const stored = pages[parsedPrev.index]?.fabricJSON;
  return !areFabricJsonEqual(canvasJson, stored);
}
