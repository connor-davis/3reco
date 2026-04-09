import { z } from 'zod/v4';

const decimalInputPattern = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;

function isValidDecimalInput(value: string) {
  if (value.includes('.') && value.includes(',')) {
    return false;
  }

  return decimalInputPattern.test(value);
}

export function decimalInputSchema(
  error: string,
  schema: z.ZodNumber
) {
  return z
    .string()
    .trim()
    .min(1, { error })
    .refine(isValidDecimalInput, { error })
    .transform((value) => Number(value.replace(',', '.')))
    .pipe(schema);
}

export function optionalDecimalInputSchema(
  error: string,
  schema: z.ZodNumber
) {
  return z
    .string()
    .trim()
    .transform((value, ctx) => {
      if (value === '') {
        return undefined;
      }

      if (!isValidDecimalInput(value)) {
        ctx.addIssue({
          code: 'custom',
          message: error,
          input: value,
        });
        return z.NEVER;
      }

      return Number(value.replace(',', '.'));
    })
    .pipe(schema.optional());
}

export function formatDecimalInputValue(value: number | null | undefined) {
  return value == null ? '' : value.toString();
}

export function stringDecimalInputSchema(error: string) {
  return z
    .string()
    .trim()
    .min(1, { error })
    .refine(isValidDecimalInput, { error })
    .transform((value) => value.replace(',', '.'));
}

export function optionalStringDecimalInputSchema(error: string) {
  return z
    .string()
    .trim()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value === '') {
        return undefined;
      }

      if (!isValidDecimalInput(value)) {
        ctx.addIssue({
          code: 'custom',
          message: error,
        });
        return z.NEVER;
      }

      return value.replace(',', '.');
    });
}
