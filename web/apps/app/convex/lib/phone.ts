import { ConvexError } from 'convex/values';

export function normalizeSouthAfricanPhoneNumber(phone: string) {
  const trimmed = phone.trim();

  if (trimmed.length === 0) {
    throw new ConvexError({
      name: 'Invalid Input',
      message: 'Please provide a phone number.',
    });
  }

  const compact = trimmed.replace(/\s+/g, '');
  const digits = compact.replace(/[^\d]/g, '');

  if (/^0\d{9}$/.test(digits)) {
    return `+27${digits.slice(1)}`;
  }

  if (/^27\d{9}$/.test(digits)) {
    return `+${digits}`;
  }

  if (/^\+27\d{9}$/.test(compact)) {
    return compact;
  }

  throw new ConvexError({
    name: 'Invalid Input',
    message: 'Invalid South African phone number format (+27 or 0...).',
  });
}

