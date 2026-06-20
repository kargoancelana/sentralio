/**
 * Pemetaan status company -> label Bahasa Indonesia + class badge.
 * Dipakai PlatformCompanies & PlatformCompanyDetail. Pure function (mudah ditest).
 */

export interface CompanyStatusBadge {
  label: string;
  className: string;
}

export function companyStatusBadge(status: string): CompanyStatusBadge {
  switch (status) {
    case 'active':
      return { label: 'Aktif', className: 'platform-badge platform-badge--active' };
    case 'pending':
      return { label: 'Pending', className: 'platform-badge platform-badge--pending' };
    case 'suspended':
      return { label: 'Disuspend', className: 'platform-badge platform-badge--suspended' };
    case 'expired':
      return { label: 'Expired', className: 'platform-badge platform-badge--expired' };
    default:
      return { label: status, className: 'platform-badge' };
  }
}
