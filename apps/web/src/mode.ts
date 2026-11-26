export type AppMode = 'edge' | 'hosted';

export function resolveAppMode(
  buildMode: string | undefined,
  healthMode?: string,
): AppMode {
  if (healthMode === 'edge' || healthMode === 'hosted') return healthMode;
  return buildMode === 'hosted' ? 'hosted' : 'edge';
}

export function navVisibleInMode(item: string, mode: AppMode): boolean {
  return mode === 'edge' || item !== 'KDS';
}
