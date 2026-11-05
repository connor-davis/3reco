import { z } from 'zod';

// Field rules from the old app: 13-digit ID, 6-16 digit account, 6-digit
// branch code, 4-digit area code.
export const personalSchema = z.object({
  firstName: z.string().min(2, 'Enter your first name.'),
  lastName: z.string().min(2, 'Enter your last name.'),
  idNumber: z.string().regex(/^\d{13}$/, 'A South African ID has 13 digits.'),
  phone: z
    .string()
    .regex(/^0\d{2} ?\d{3} ?\d{4}$/, 'Use a phone like 082 555 0148.'),
});

export const businessSchema = z.object({
  businessName: z.string().min(2, 'Enter the business name.'),
  registration: z.string().min(5, 'Enter the registration number.'),
});

export const bankSchema = z.object({
  holder: z.string().min(2, 'Enter the account holder.'),
  bank: z.string().min(1, 'Pick a bank.'),
  accountType: z.string().min(1, 'Pick an account type.'),
  accountNumber: z
    .string()
    .regex(/^\d{6,16}$/, 'The account number is 6 to 16 digits.'),
  branchCode: z.string().regex(/^\d{6}$/, 'The branch code is 6 digits.'),
});

export const walletSchema = z.object({
  walletProvider: z.string().min(1, 'Pick a wallet provider.'),
  walletPhone: z.string().min(10, 'Enter the wallet phone number.'),
});

export const locationSchema = z.object({
  street: z.string().min(3, 'Enter your street address.'),
  city: z.string().min(2, 'Enter your city or suburb.'),
  postal: z.string().regex(/^\d{4}$/, 'The area code is 4 digits.'),
  province: z.string().min(1, 'Pick a province.'),
});

export type PersonalValues = z.infer<typeof personalSchema>;
export type BusinessValues = z.infer<typeof businessSchema>;
export type BankValues = z.infer<typeof bankSchema>;
export type WalletValues = z.infer<typeof walletSchema>;
export type LocationValues = z.infer<typeof locationSchema>;
