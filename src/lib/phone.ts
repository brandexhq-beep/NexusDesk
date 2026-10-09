import type { Customer } from '../types';

/**
 * Normalizes any phone number format (e.g., "+91 9876543210", "09876543210", "98765-43210")
 * into a canonical 10-digit number key (or international number without non-digits).
 */
export function getCanonicalPhoneKey(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length > 10 && digits.startsWith('91')) return digits.slice(2);
  return digits;
}

/**
 * Standardizes a phone number into clean display format (e.g. "+91 98765 43210" or "9876543210").
 */
export function normalizePhoneDisplay(raw: string | null | undefined): string {
  if (!raw) return '';
  const canonical = getCanonicalPhoneKey(raw);
  if (canonical.length === 10) {
    return `+91 ${canonical.slice(0, 5)} ${canonical.slice(5)}`;
  }
  if (raw.trim().startsWith('+')) return raw.trim();
  return canonical ? `+91 ${canonical}` : raw.trim();
}

export interface DuplicateCustomerGroup {
  canonicalKey: string;
  displayPhone: string;
  customers: Customer[];
  totalLoyaltyPoints: number;
  totalWalletBalance: number;
  totalAvailableMinutes: number;
  totalAmountOwed: number;
  suggestedPrimaryId: string;
}

/**
 * Analyzes an array of customers and groups all duplicate contacts by canonical phone key.
 */
export function findDuplicateCustomerGroups(customers: Customer[]): DuplicateCustomerGroup[] {
  const map = new Map<string, Customer[]>();

  for (const c of customers) {
    if (!c.phone || c.phone.trim() === '' || c.phone.toLowerCase() === 'n/a') continue;
    const key = getCanonicalPhoneKey(c.phone);
    if (!key || key.length < 5) continue; // Skip invalid or placeholder numbers

    const list = map.get(key) || [];
    list.push(c);
    map.set(key, list);
  }

  const groups: DuplicateCustomerGroup[] = [];

  for (const [key, groupList] of map.entries()) {
    if (groupList.length > 1) {
      // Pick best candidate for primary record (most points, highest wallet, or most complete name)
      const sorted = [...groupList].sort((a, b) => {
        const pointsDiff = (b.loyalty_points || 0) - (a.loyalty_points || 0);
        if (pointsDiff !== 0) return pointsDiff;
        const walletDiff = (b.wallet_balance || 0) - (a.wallet_balance || 0);
        if (walletDiff !== 0) return walletDiff;
        const minsDiff = (b.available_minutes || 0) - (a.available_minutes || 0);
        if (minsDiff !== 0) return minsDiff;
        return (b.name || '').length - (a.name || '').length;
      });

      const totalLoyaltyPoints = groupList.reduce((acc, curr) => acc + (curr.loyalty_points || 0), 0);
      const totalWalletBalance = groupList.reduce((acc, curr) => acc + (curr.wallet_balance || 0), 0);
      const totalAvailableMinutes = groupList.reduce((acc, curr) => acc + (curr.available_minutes || 0), 0);
      const totalAmountOwed = groupList.reduce((acc, curr) => acc + (curr.amount_owed || 0), 0);

      groups.push({
        canonicalKey: key,
        displayPhone: normalizePhoneDisplay(groupList[0].phone),
        customers: groupList,
        totalLoyaltyPoints,
        totalWalletBalance,
        totalAvailableMinutes,
        totalAmountOwed,
        suggestedPrimaryId: sorted[0].id,
      });
    }
  }

  return groups;
}
