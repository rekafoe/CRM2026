export function isDraftVersionConflictError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  return message.includes('409:')
    || message.includes('другой вкладке')
    || message.includes('draft изменился');
}
