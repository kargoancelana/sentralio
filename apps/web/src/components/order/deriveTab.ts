/**
 * Pure helper that derives the active `Tab` from `(mainFilter, subFilter)`.
 *
 * Exported for use in `PesananSaya` and property-based tests.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */

import type { MainFilter, SubFilter } from '../../pages/PesananSaya';
import type { Tab } from './floatingActionBar.types';

/**
 * Derives the `Tab` value that `FloatingActionBar` uses to determine which
 * buttons to render, based on the current `mainFilter` and `subFilter` state
 * from `PesananSaya`.
 *
 * Mapping:
 * - `NEED_SHIP` + `READY_TO_SHIP` → `'READY_TO_SHIP'`
 * - `NEED_SHIP` + `PROCESSED`     → `'PROCESSED'`
 * - anything else                  → `'OTHER'`
 */
export function deriveTab(mainFilter: MainFilter, subFilter: SubFilter): Tab {
  if (mainFilter === 'NEED_SHIP' && subFilter === 'READY_TO_SHIP') return 'READY_TO_SHIP';
  if (mainFilter === 'NEED_SHIP' && subFilter === 'PROCESSED')     return 'PROCESSED';
  return 'OTHER';
}
