export function getUndoBaselineTimerIds(
  currentTimerIds: string[],
  savedTimerIds: string[] | undefined,
  defaultPreviewIds: Partial<Record<string, string>>,
): string[] {
  if (savedTimerIds !== undefined) return [...savedTimerIds];

  const previewIds = new Set(
    Object.values(defaultPreviewIds).filter((id): id is string => typeof id === 'string' && id.length > 0),
  );
  return currentTimerIds.filter((id) => previewIds.has(id));
}
