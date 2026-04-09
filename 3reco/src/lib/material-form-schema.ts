import { decimalInputSchema, optionalDecimalInputSchema, optionalStringDecimalInputSchema, stringDecimalInputSchema } from '@/lib/decimal';
import { z } from 'zod/v4';

const materialNameSchema = z.string({
  error: 'Please provide a material name.',
});

const carbonFactorSchema = stringDecimalInputSchema(
  'Please provide a valid Carbon Factor that is a number or decimal, e.g. 10.5 or 10,5'
);

const wasteCodeSchema = z
  .string({ error: 'Please provide a waste code.' })
  .trim()
  .regex(
    /\d{3,}$/,
    'Please provide a valid waste code ending in at least 3 digits, e.g. GW 100 or ABC-123'
  );

const priceNumberSchema = z
  .number({
    error: 'Please provide a price that is a number or decimal, e.g. 10.5 or 10,5',
  })
  .nonnegative({ error: 'Price cannot be negative.' });

const priceSchema = decimalInputSchema(
  'Please provide a price that is a number or decimal, e.g. 10.5 or 10,5',
  priceNumberSchema
);

export const createMaterialSchema = z.object({
  name: materialNameSchema,
  carbonFactor: carbonFactorSchema,
  gwCode: wasteCodeSchema,
  price: priceSchema,
});

export const updateMaterialSchema = z.object({
  name: materialNameSchema.optional(),
  carbonFactor: optionalStringDecimalInputSchema(
    'Please provide a valid Carbon Factor that is a number or decimal, e.g. 10.5 or 10,5'
  ),
  gwCode: wasteCodeSchema.optional(),
  price: optionalDecimalInputSchema(
    'Please provide a price that is a number or decimal, e.g. 10.5 or 10,5',
    priceNumberSchema
  ),
});
