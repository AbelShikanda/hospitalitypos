export function canApplyUpdate(billOpen: boolean, hasUpdate: boolean): boolean {
  return hasUpdate && !billOpen;
}
