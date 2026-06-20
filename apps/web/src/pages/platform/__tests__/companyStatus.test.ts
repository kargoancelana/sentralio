import { describe, it, expect } from 'vitest';
import { companyStatusBadge } from '../companyStatus';

describe('companyStatusBadge', () => {
  it('memetakan status dikenal ke label + class', () => {
    expect(companyStatusBadge('active')).toEqual({
      label: 'Aktif',
      className: 'platform-badge platform-badge--active',
    });
    expect(companyStatusBadge('pending')).toEqual({
      label: 'Pending',
      className: 'platform-badge platform-badge--pending',
    });
    expect(companyStatusBadge('suspended')).toEqual({
      label: 'Disuspend',
      className: 'platform-badge platform-badge--suspended',
    });
    expect(companyStatusBadge('expired')).toEqual({
      label: 'Expired',
      className: 'platform-badge platform-badge--expired',
    });
  });

  it('fallback untuk status tak dikenal: label apa adanya + class dasar', () => {
    expect(companyStatusBadge('weird')).toEqual({
      label: 'weird',
      className: 'platform-badge',
    });
  });
});
