/**
 * Filters `selection` to only include order SNs that are present in `visibleOrderSns`.
 * Preserves the original order and duplicates from `selection`.
 *
 * Used to prune stale selections when the visible order list changes due to filter updates.
 * @see Requirements 8.2
 */
export function pruneSelection(selection: string[], visibleOrderSns: string[]): string[] {
  const visible = new Set(visibleOrderSns);
  return selection.filter(sn => visible.has(sn));
}
