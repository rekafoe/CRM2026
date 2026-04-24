const MINIAPP_LAYOUTS_PENDING_PREFIX = '[Mini App] Ожидаются макеты к позициям заказа';

function splitNoteLines(notes: string | null | undefined): string[] {
  return String(notes || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function appendMiniappLayoutsPendingNote(notes: string | null | undefined, expectedItemsCount: number): string {
  const lines = splitNoteLines(notes).filter((line) => !line.startsWith(MINIAPP_LAYOUTS_PENDING_PREFIX));
  const suffix =
    expectedItemsCount > 0 ? ` (${expectedItemsCount} поз.)` : '';
  lines.push(`${MINIAPP_LAYOUTS_PENDING_PREFIX}${suffix}.`);
  return lines.join('\n\n');
}

export function clearMiniappLayoutsPendingNote(notes: string | null | undefined): string {
  return splitNoteLines(notes)
    .filter((line) => !line.startsWith(MINIAPP_LAYOUTS_PENDING_PREFIX))
    .join('\n\n');
}

