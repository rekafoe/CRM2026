import type {
  PublicEditorPreflightField,
  PublicEditorPreflightSummary,
} from './publicDesignPreflight';

export type PublicEditorNextAction =
  | { kind: 'replacePhoto'; label: string; description: string; field: PublicEditorPreflightField }
  | { kind: 'editText'; label: string; description: string; field: PublicEditorPreflightField }
  | { kind: 'readyForCart'; label: string; description: string };

export function resolvePublicEditorNextAction(preflight: PublicEditorPreflightSummary): PublicEditorNextAction {
  const missingPhoto = preflight.photoFields.find((field) => field.status === 'missing');
  if (missingPhoto) {
    return {
      kind: 'replacePhoto',
      label: 'Добавить следующее фото',
      description: `Страница ${missingPhoto.pageIndex + 1}: ${missingPhoto.label}`,
      field: missingPhoto,
    };
  }

  const missingText = preflight.textFields.find((field) => field.status === 'missing');
  if (missingText) {
    return {
      kind: 'editText',
      label: 'Заполнить следующий текст',
      description: `Страница ${missingText.pageIndex + 1}: ${missingText.detail || missingText.label}`,
      field: missingText,
    };
  }

  return {
    kind: 'readyForCart',
    label: 'Заказать макет',
    description: 'Макет заполнен и готов к заказу',
  };
}
