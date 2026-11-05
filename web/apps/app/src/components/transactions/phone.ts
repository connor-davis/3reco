import { z } from 'zod';

/** A South African phone: 0xx xxx xxxx, or the same with +27 in front. */
export const phoneSchema = z.string().refine((value) => {
  const digits = value.replace(/\D/g, '');

  return (
    (digits.length === 10 && digits.startsWith('0')) ||
    (digits.length === 11 && digits.startsWith('27'))
  );
}, 'Use a phone like 082 555 0148.');
