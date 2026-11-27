export function canApplyUpdate(billOpen: boolean, hasUpdate: boolean): boolean {
  return hasUpdate && !billOpen;
}

export type ReleaseNotes = {
  version: string;
  notes: string[];
};

export function parseReleaseNotes(value: unknown): ReleaseNotes | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.version !== 'string') return null;
  if (!Array.isArray(record.notes)) return null;
  const notes = record.notes.filter(
    (note): note is string =>
      typeof note === 'string' && note.trim().length > 0,
  );
  if (notes.length === 0) return null;
  return { version: record.version, notes };
}
