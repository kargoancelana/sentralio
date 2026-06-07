/**
 * Tests for order item aggregation.
 *
 * Regression guard for the bug where Shopee returns multiple item_list rows
 * with the same (item_id, model_id) and the old upsert overwrote qty instead
 * of summing — storing a 5-pcs order as 2 pcs.
 */

import { describe, it, expect } from 'bun:test';
import { aggregateOrderItems, collectRawItems } from '../order-items.util';

describe('aggregateOrderItems', () => {
  it('sums qty for duplicate (item_id, model_id) rows (the 3+2=5 bug)', () => {
    const result = aggregateOrderItems([
      { item_id: 24390368094, model_id: 275760991491, item_name: 'Daster', model_name: 'Elia Orange', model_quantity_purchased: 3, model_discounted_price: 46759 },
      { item_id: 24390368094, model_id: 275760991491, item_name: 'Daster', model_name: 'Elia Orange', model_quantity_purchased: 2, model_discounted_price: 46759 },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].qty).toBe(5);
    expect(result[0].modelName).toBe('Elia Orange');
    expect(result[0].itemPrice).toBe(46759);
  });

  it('keeps distinct variants separate', () => {
    const result = aggregateOrderItems([
      { item_id: 1, model_id: 10, item_name: 'A', model_quantity_purchased: 2 },
      { item_id: 1, model_id: 11, item_name: 'A', model_quantity_purchased: 3 },
      { item_id: 2, model_id: 20, item_name: 'B', model_quantity_purchased: 1 },
    ]);

    expect(result).toHaveLength(3);
    const total = result.reduce((s, it) => s + it.qty, 0);
    expect(total).toBe(6);
  });

  it('defaults missing per-row qty to 1 each and sums them', () => {
    // package_list items often have no qty field; N rows = N pcs.
    const result = aggregateOrderItems([
      { item_id: 5, model_id: 50, item_name: 'X' },
      { item_id: 5, model_id: 50, item_name: 'X' },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].qty).toBe(2);
  });

  it('falls back to quantity_purchased when model_quantity_purchased is absent', () => {
    const result = aggregateOrderItems([
      { item_id: 7, model_id: 70, item_name: 'Y', quantity_purchased: 4 },
    ]);
    expect(result[0].qty).toBe(4);
  });

  it('uses model_original_price when discounted price is absent', () => {
    const result = aggregateOrderItems([
      { item_id: 8, model_id: 80, item_name: 'Z', model_quantity_purchased: 1, model_original_price: 12345.6 },
    ]);
    expect(result[0].itemPrice).toBe(12346);
  });

  it('handles null item_id / model_id without merging unrelated rows incorrectly', () => {
    const result = aggregateOrderItems([
      { item_id: null, model_id: null, item_name: 'NoIds', model_quantity_purchased: 2 },
      { item_id: null, model_id: null, item_name: 'NoIds', model_quantity_purchased: 1 },
    ]);
    // Both share the same empty key, so they aggregate to qty 3.
    expect(result).toHaveLength(1);
    expect(result[0].qty).toBe(3);
    expect(result[0].itemId).toBeNull();
    expect(result[0].modelId).toBeNull();
  });
});

describe('collectRawItems', () => {
  it('prefers top-level item_list when present', () => {
    const items = collectRawItems({
      item_list: [{ item_id: 1, model_id: 2, model_quantity_purchased: 1 }],
      package_list: [{ item_list: [{ item_id: 9, model_id: 9 }] }],
    });
    expect(items).toHaveLength(1);
    expect(String(items[0].item_id)).toBe('1');
  });

  it('falls back to package_list[].item_list when top-level is empty', () => {
    const items = collectRawItems({
      item_list: [],
      package_list: [
        { item_list: [{ item_id: 1, model_id: 2 }] },
        { item_list: [{ item_id: 1, model_id: 2 }, { item_id: 3, model_id: 4 }] },
      ],
    });
    expect(items).toHaveLength(3);
  });

  it('end-to-end: package_list duplicates aggregate to correct total', () => {
    const raw = collectRawItems({
      item_list: [],
      package_list: [
        { item_list: [{ item_id: 1, model_id: 2, item_name: 'P' }] },
        { item_list: [{ item_id: 1, model_id: 2, item_name: 'P' }] },
        { item_list: [{ item_id: 1, model_id: 2, item_name: 'P' }] },
      ],
    });
    const agg = aggregateOrderItems(raw);
    expect(agg).toHaveLength(1);
    expect(agg[0].qty).toBe(3);
  });
});
