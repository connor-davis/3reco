import { z } from 'zod';

export const provinces = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'Northern Cape',
  'North West',
  'Western Cape',
];

export const personalSchema = z.object({
  first_name: z.string().trim().min(2, 'Enter your first name.'),
  last_name: z.string().trim().min(2, 'Enter your last name.'),
  id_number: z
    .string()
    .regex(/^(\d{13})?$/, 'A South African ID has 13 digits.'),
  // Spaces are fine: the field shows the number grouped, and save sends digits.
  phone: z
    .string()
    .refine(
      (value) =>
        /^(?:0\d{9}|\+27\d{9}|27\d{9})$/.test(value.replace(/\s/g, '')),
      'Use a South African phone number, such as 0825550148.'
    ),
});

export const businessSchema = z.object({
  business_name: z.string().trim().min(2, 'Enter the business name.'),
  business_registration_number: z
    .string()
    .trim()
    .min(5, 'Enter the registration number.'),
});

export const bankSchema = z.object({
  bank_account_holder_name: z
    .string()
    .trim()
    .min(2, 'Enter the account holder.'),
  bank_name: z.string().trim().min(1, 'Enter a bank.'),
  bank_account_type: z.enum(['Cheque', 'Savings', 'Transmission']),
  bank_account_number: z
    .string()
    .regex(/^(\d{6,16})?$/, 'The account number is 6 to 16 digits.'),
  bank_branch_code: z.string().regex(/^\d{6}$/, 'The branch code is 6 digits.'),
});

export const locationSchema = z.object({
  street_address: z.string().trim().min(3, 'Enter your street address.'),
  city: z.string().trim().min(2, 'Enter your city or suburb.'),
  area_code: z.string().regex(/^\d{4}$/, 'The area code is 4 digits.'),
  province: z.string().min(1, 'Pick a province.'),
});

export type PersonalValues = z.infer<typeof personalSchema>;
export type BusinessValues = z.infer<typeof businessSchema>;
export type BankValues = z.infer<typeof bankSchema>;
export type LocationValues = z.infer<typeof locationSchema>;
