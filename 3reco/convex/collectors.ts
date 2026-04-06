import { defineTable, paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { normalizeSouthAfricanPhoneNumber } from './lib/phone';
import {
  getCollectorPayoutValidationIssues,
} from '../src/lib/payout-details';
import {
  getCurrentUserForMutationOrThrow,
  getCurrentUserOrThrow,
} from './users';

const bankAccountTypeValidator = v.union(
  v.literal('Cheque'),
  v.literal('Savings'),
  v.literal('Transmission')
);

export default defineTable({
  name: v.string(),
  email: v.optional(v.string()),
  phone: v.string(),
  normalizedPhone: v.string(),
  image: v.optional(v.string()),
  bankAccountHolderName: v.optional(v.string()),
  bankName: v.optional(v.string()),
  bankAccountNumber: v.optional(v.string()),
  bankBranchCode: v.optional(v.string()),
  bankAccountType: v.optional(bankAccountTypeValidator),
  payoutMethod: v.optional(v.union(v.literal('bank'), v.literal('ewallet'))),
  ewalletPlatformName: v.optional(v.string()),
  ewalletPaymentId: v.optional(v.string()),
  streetAddress: v.optional(v.string()),
  city: v.optional(v.string()),
  areaCode: v.optional(v.number()),
  province: v.optional(
    v.union(
      v.literal('Eastern Cape'),
      v.literal('Free State'),
      v.literal('Gauteng'),
      v.literal('KwaZulu-Natal'),
      v.literal('Limpopo'),
      v.literal('Mpumalanga'),
      v.literal('Northern Cape'),
      v.literal('North West'),
      v.literal('Western Cape')
    )
  ),
  createdByUserId: v.id('users'),
  createdByBusinessId: v.optional(v.id('users')),
})
  .index('by_normalizedPhone', ['normalizedPhone'])
  .index('by_createdByUserId', ['createdByUserId']);

function requireCollectorManager(type: string | undefined) {
  if (type !== 'admin' && type !== 'staff' && type !== 'business') {
    throw new ConvexError({
      name: 'Unauthorized',
      message: 'You are not authorized to manage collectors.',
    });
  }
}

async function findBusinessUserByPhone(
  ctx: QueryCtx | MutationCtx,
  normalizedPhone: string
) {
  const directMatch = await ctx.db
    .query('users')
    .withIndex('by_normalizedPhone', (q) => q.eq('normalizedPhone', normalizedPhone))
    .take(10);

  const indexedBusiness = directMatch.find((user) => user.type === 'business');
  if (indexedBusiness) {
    return indexedBusiness;
  }

  const businesses = await ctx.db
    .query('users')
    .withIndex('type', (q) => q.eq('type', 'business'))
    .collect();

  return businesses.find((user) => {
    if (!user.phone) {
      return false;
    }

    try {
      return normalizeSouthAfricanPhoneNumber(user.phone) === normalizedPhone;
    } catch {
      return false;
    }
  });
}

function getCollectorDisplayName(collector: {
  name: string;
  email?: string;
  phone: string;
}) {
  return collector.name.trim().length > 0
    ? collector.name
    : collector.email?.trim() || collector.phone;
}

function validateCollectorPayoutInput(values: {
  payoutMethod?: 'bank' | 'ewallet';
  bankAccountHolderName?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankBranchCode?: string;
  bankAccountType?: 'Cheque' | 'Savings' | 'Transmission';
  ewalletPlatformName?: string;
  ewalletPaymentId?: string;
}) {
  const issues = getCollectorPayoutValidationIssues(values);

  if (issues.length > 0) {
    throw new ConvexError({
      name: 'Invalid Input',
      message: issues[0].message,
    });
  }
}

export const listManaged = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const user = await getCurrentUserOrThrow(ctx);
    requireCollectorManager(user.type);

    return await ctx.db.query('collectors').order('desc').paginate(paginationOpts);
  },
});

export const listForSelection = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrThrow(ctx);
    requireCollectorManager(user.type);

    return await ctx.db.query('collectors').order('desc').take(200);
  },
});

export const findById = query({
  args: { _id: v.id('collectors') },
  handler: async (ctx, { _id }) => {
    await getCurrentUserOrThrow(ctx);
    return await ctx.db.get(_id);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.string(),
    image: v.optional(v.string()),
    bankAccountHolderName: v.optional(v.string()),
    bankName: v.optional(v.string()),
    bankAccountNumber: v.optional(v.string()),
    bankBranchCode: v.optional(v.string()),
    bankAccountType: v.optional(bankAccountTypeValidator),
    payoutMethod: v.optional(v.union(v.literal('bank'), v.literal('ewallet'))),
    ewalletPlatformName: v.optional(v.string()),
    ewalletPaymentId: v.optional(v.string()),
    streetAddress: v.optional(v.string()),
    city: v.optional(v.string()),
    areaCode: v.optional(v.number()),
    province: v.optional(
      v.union(
        v.literal('Eastern Cape'),
        v.literal('Free State'),
        v.literal('Gauteng'),
        v.literal('KwaZulu-Natal'),
        v.literal('Limpopo'),
        v.literal('Mpumalanga'),
        v.literal('Northern Cape'),
        v.literal('North West'),
        v.literal('Western Cape')
      )
    ),
  },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUserForMutationOrThrow(ctx);
    requireCollectorManager(currentUser.type);

    const normalizedPhone = normalizeSouthAfricanPhoneNumber(args.phone);
    const existingCollector = await ctx.db
      .query('collectors')
      .withIndex('by_normalizedPhone', (q) => q.eq('normalizedPhone', normalizedPhone))
      .unique();

    if (existingCollector) {
      throw new ConvexError({
        name: 'Invalid Input',
        message: 'A collector with that phone number already exists.',
      });
    }

    const businessUser = await findBusinessUserByPhone(ctx, normalizedPhone);
    if (businessUser) {
      throw new ConvexError({
        name: 'Invalid Input',
        message: 'That phone number is already linked to a business account.',
      });
    }

    const email = args.email?.trim() || undefined;
    validateCollectorPayoutInput({
      payoutMethod: args.payoutMethod,
      bankAccountHolderName: args.bankAccountHolderName,
      bankName: args.bankName,
      bankAccountNumber: args.bankAccountNumber,
      bankBranchCode: args.bankBranchCode,
      bankAccountType: args.bankAccountType,
      ewalletPlatformName: args.ewalletPlatformName,
      ewalletPaymentId: args.ewalletPaymentId,
    });

    return await ctx.db.insert('collectors', {
      name: args.name.trim(),
      phone: args.phone.trim(),
      normalizedPhone,
      ...(args.image ? { image: args.image } : {}),
      ...(email ? { email } : {}),
      ...(args.bankAccountHolderName
        ? { bankAccountHolderName: args.bankAccountHolderName.trim() }
        : {}),
      ...(args.bankName ? { bankName: args.bankName.trim() } : {}),
      ...(args.bankAccountNumber
        ? { bankAccountNumber: args.bankAccountNumber.trim() }
        : {}),
      ...(args.bankBranchCode
        ? { bankBranchCode: args.bankBranchCode.trim() }
        : {}),
      ...(args.bankAccountType ? { bankAccountType: args.bankAccountType } : {}),
      ...(args.payoutMethod ? { payoutMethod: args.payoutMethod } : {}),
      ...(args.ewalletPlatformName
        ? { ewalletPlatformName: args.ewalletPlatformName.trim() }
        : {}),
      ...(args.ewalletPaymentId
        ? { ewalletPaymentId: args.ewalletPaymentId.trim() }
        : {}),
      ...(args.streetAddress
        ? { streetAddress: args.streetAddress.trim() }
        : {}),
      ...(args.city ? { city: args.city.trim() } : {}),
      ...(args.areaCode === undefined ? {} : { areaCode: args.areaCode }),
      ...(args.province ? { province: args.province } : {}),
      createdByUserId: currentUser._id,
      ...(currentUser.type === 'business'
        ? { createdByBusinessId: currentUser._id }
        : {}),
    });
  },
});

export const update = mutation({
  args: {
    _id: v.id('collectors'),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.string(),
    image: v.optional(v.string()),
    bankAccountHolderName: v.optional(v.string()),
    bankName: v.optional(v.string()),
    bankAccountNumber: v.optional(v.string()),
    bankBranchCode: v.optional(v.string()),
    bankAccountType: v.optional(bankAccountTypeValidator),
    payoutMethod: v.optional(v.union(v.literal('bank'), v.literal('ewallet'))),
    ewalletPlatformName: v.optional(v.string()),
    ewalletPaymentId: v.optional(v.string()),
    streetAddress: v.optional(v.string()),
    city: v.optional(v.string()),
    areaCode: v.optional(v.number()),
    province: v.optional(
      v.union(
        v.literal('Eastern Cape'),
        v.literal('Free State'),
        v.literal('Gauteng'),
        v.literal('KwaZulu-Natal'),
        v.literal('Limpopo'),
        v.literal('Mpumalanga'),
        v.literal('Northern Cape'),
        v.literal('North West'),
        v.literal('Western Cape')
      )
    ),
  },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUserForMutationOrThrow(ctx);
    requireCollectorManager(currentUser.type);

    const existingCollector = await ctx.db.get(args._id);
    if (!existingCollector) {
      throw new ConvexError({
        name: 'Not Found',
        message: 'The collector was not found.',
      });
    }

    const normalizedPhone = normalizeSouthAfricanPhoneNumber(args.phone);
    const conflictingCollector = await ctx.db
      .query('collectors')
      .withIndex('by_normalizedPhone', (q) => q.eq('normalizedPhone', normalizedPhone))
      .unique();

    if (conflictingCollector && conflictingCollector._id !== args._id) {
      throw new ConvexError({
        name: 'Invalid Input',
        message: 'A collector with that phone number already exists.',
      });
    }

    const businessUser = await findBusinessUserByPhone(ctx, normalizedPhone);
    if (businessUser) {
      throw new ConvexError({
        name: 'Invalid Input',
        message: 'That phone number is already linked to a business account.',
      });
    }

    const email = args.email?.trim() || undefined;
    validateCollectorPayoutInput({
      payoutMethod: args.payoutMethod,
      bankAccountHolderName: args.bankAccountHolderName,
      bankName: args.bankName,
      bankAccountNumber: args.bankAccountNumber,
      bankBranchCode: args.bankBranchCode,
      bankAccountType: args.bankAccountType,
      ewalletPlatformName: args.ewalletPlatformName,
      ewalletPaymentId: args.ewalletPaymentId,
    });

    await ctx.db.patch(args._id, {
      name: args.name.trim(),
      phone: args.phone.trim(),
      normalizedPhone,
      image: args.image,
      email,
      bankAccountHolderName: args.bankAccountHolderName?.trim(),
      bankName: args.bankName?.trim(),
      bankAccountNumber: args.bankAccountNumber?.trim(),
      bankBranchCode: args.bankBranchCode?.trim(),
      bankAccountType: args.bankAccountType,
      payoutMethod: args.payoutMethod,
      ewalletPlatformName: args.ewalletPlatformName?.trim(),
      ewalletPaymentId: args.ewalletPaymentId?.trim(),
      streetAddress: args.streetAddress?.trim(),
      city: args.city?.trim(),
      areaCode: args.areaCode,
      province: args.province,
    });
  },
});

export const remove = mutation({
  args: {
    _id: v.id('collectors'),
    confirmationValue: v.string(),
  },
  handler: async (ctx, { _id, confirmationValue }) => {
    const currentUser = await getCurrentUserForMutationOrThrow(ctx);
    if (currentUser.type !== 'admin' && currentUser.type !== 'staff') {
      throw new ConvexError({
        name: 'Unauthorized',
        message: 'Only admins and staff can remove collectors.',
      });
    }

    const collector = await ctx.db.get(_id);
    if (!collector) {
      throw new ConvexError({
        name: 'Not Found',
        message: 'The collector was not found.',
      });
    }

    const expectedConfirmationValue = collector.email?.trim()
      ? collector.email.trim().toLowerCase()
      : collector.phone.trim();
    const suppliedConfirmationValue = collector.email?.trim()
      ? confirmationValue.trim().toLowerCase()
      : confirmationValue.trim();

    if (expectedConfirmationValue !== suppliedConfirmationValue) {
      throw new ConvexError({
        name: 'Invalid Input',
        message: collector.email?.trim()
          ? 'Enter the collector email exactly to confirm removal.'
          : 'Enter the collector phone number exactly to confirm removal.',
      });
    }

    await ctx.db.delete(_id);
  },
});

export const statsByPhone = query({
  args: {
    phone: v.string(),
  },
  handler: async (ctx, { phone }) => {
    const normalizedPhone = normalizeSouthAfricanPhoneNumber(phone);

    const businessUser = await findBusinessUserByPhone(ctx, normalizedPhone);
    if (businessUser) {
      return null;
    }

    const collector = await ctx.db
      .query('collectors')
      .withIndex('by_normalizedPhone', (q) => q.eq('normalizedPhone', normalizedPhone))
      .unique();

    if (!collector) {
      return null;
    }

    const transactions = await ctx.db
      .query('transactions')
      .withIndex('by_sellerId_and_type', (q) =>
        q.eq('sellerId', collector._id).eq('type', 'c2b')
      )
      .order('desc')
      .collect();

    let carbonSavings = 0;
    for (const transaction of transactions) {
      for (const item of transaction.items) {
        const material = await ctx.db.get(item.materialId);
        if (!material) {
          continue;
        }

        const factor = Number(material.carbonFactor);
        if (!Number.isNaN(factor)) {
          carbonSavings += item.weight * factor;
        }
      }
    }

    const latestTransactions = await Promise.all(
      transactions.slice(0, 5).map(async (transaction) => {
        const firstMaterial = transaction.items[0]
          ? await ctx.db.get(transaction.items[0].materialId)
          : null;
        const buyer = await ctx.db.get(transaction.buyerId);

        return {
          _id: transaction._id,
          _creationTime: transaction._creationTime,
          type: transaction.type,
          collectionDay: transaction.collectionDay,
          collectionDate: transaction.collectionDate,
          materialName:
            transaction.items.length === 1
              ? firstMaterial?.name ?? 'Unknown'
              : `${transaction.items.length} materials`,
          weight: transaction.items.reduce((sum, item) => sum + item.weight, 0),
          price: transaction.totalPrice,
          buyerName: buyer?.businessName ?? buyer?.name ?? buyer?.email ?? 'Unknown',
        };
      })
    );

    return {
      collector: {
        _id: collector._id,
        name: getCollectorDisplayName(collector),
        email: collector.email,
        phone: collector.phone,
      },
      totals: {
        totalRevenue: transactions.reduce(
          (sum, transaction) => sum + transaction.totalPrice,
          0
        ),
        totalVolume: transactions.reduce(
          (sum, transaction) =>
            sum + transaction.items.reduce((itemSum, item) => itemSum + item.weight, 0),
          0
        ),
        transactionCount: transactions.length,
      },
      carbonSavings,
      latestTransactions,
    };
  },
});

