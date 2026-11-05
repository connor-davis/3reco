import { z } from 'zod/v4';
import { bankAccountTypes } from './payout-details';

export { bankAccountTypes };

const bankDetailLabels = {
  bankAccountHolderName: 'account holder name',
  bankName: 'bank name',
  bankAccountNumber: 'account number',
  bankBranchCode: 'branch code',
  bankAccountType: 'account type',
} as const;

const optionalTrimmedValue = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => {
    if (typeof value !== 'string') return value;

    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }, schema.optional());

export const bankDetailsFormSchema = z
  .object({
    bankAccountHolderName: optionalTrimmedValue(
      z.string().min(2, 'Please provide the account holder name.')
    ),
    bankName: optionalTrimmedValue(
      z.string().min(2, 'Please provide the bank name.')
    ),
    bankAccountNumber: optionalTrimmedValue(
      z
        .string()
        .regex(/^\d{6,20}$/, 'Account numbers must contain 6 to 20 digits.')
    ),
    bankBranchCode: optionalTrimmedValue(
      z.string().regex(/^\d{6}$/, 'Branch codes must contain 6 digits.')
    ),
    bankAccountType: optionalTrimmedValue(
      z.enum(bankAccountTypes, {
        error: 'Please select an account type.',
      })
    ),
  })
  .superRefine((values, context) => {
    const providedCount = bankDetailFieldNames.filter((fieldName) =>
      isBankDetailValueFilled(values[fieldName])
    ).length;

    if (providedCount === 0 || providedCount === bankDetailFieldNames.length) {
      return;
    }

    for (const fieldName of bankDetailFieldNames) {
      if (isBankDetailValueFilled(values[fieldName])) {
        continue;
      }

      context.addIssue({
        code: 'custom',
        path: [fieldName],
        message: `Please provide the ${bankDetailLabels[fieldName]}.`,
      });
    }
  });

export const requiredBankDetailsFormSchema = z.object({
  bankAccountHolderName: z
    .string()
    .trim()
    .min(2, 'Please provide the account holder name.'),
  bankName: z.string().trim().min(2, 'Please provide the bank name.'),
  bankAccountNumber: z
    .string()
    .trim()
    .regex(/^\d{6,20}$/, 'Account numbers must contain 6 to 20 digits.'),
  bankBranchCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Branch codes must contain 6 digits.'),
  bankAccountType: z.enum(bankAccountTypes, {
    error: 'Please select an account type.',
  }),
});

export type BankDetailsFormInputValues = z.input<typeof bankDetailsFormSchema>;
export type BankDetailsFormValues = z.output<typeof bankDetailsFormSchema>;

export const bankDetailFieldNames = [
  'bankAccountHolderName',
  'bankName',
  'bankAccountNumber',
  'bankBranchCode',
  'bankAccountType',
] as const satisfies readonly (keyof BankDetailsFormValues)[];

export function hasCompleteBankDetails(
  values: Partial<BankDetailsFormValues> | null | undefined
) {
  return bankDetailFieldNames.every((fieldName) =>
    isBankDetailValueFilled(values?.[fieldName])
  );
}

function isBankDetailValueFilled(value: string | undefined) {
  return typeof value === 'string' && value.trim().length > 0;
}
