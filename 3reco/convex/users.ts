import { defineTable, paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { normalizeSouthAfricanPhoneNumber } from './lib/phone';

export default defineTable({
  authId: v.optional(v.string()),
  tokenIdentifier: v.optional(v.string()),
  authSubject: v.optional(v.string()),
  name: v.optional(v.string()),
  image: v.optional(v.string()),
  email: v.optional(v.string()),
  emailVerificationTime: v.optional(v.number()),
  phone: v.optional(v.string()),
  normalizedPhone: v.optional(v.string()),
  phoneVerificationTime: v.optional(v.number()),
  isAnonymous: v.optional(v.boolean()),
  type: v.optional(
    v.union(
      v.literal('admin'),
      v.literal('staff'),
      v.literal('business'),
      v.literal('collector')
    )
  ),
  profileComplete: v.optional(v.boolean()),
  agreedToTerms: v.optional(v.boolean()),
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  idNumber: v.optional(v.string()),
  businessName: v.optional(v.string()),
  businessRegistrationNumber: v.optional(v.string()),
  bankAccountHolderName: v.optional(v.string()),
  bankName: v.optional(v.string()),
  bankAccountNumber: v.optional(v.string()),
  bankBranchCode: v.optional(v.string()),
  bankAccountType: v.optional(
    v.union(
      v.literal('Cheque'),
      v.literal('Savings'),
      v.literal('Transmission')
    )
  ),
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
})
  .index('by_authId', ['authId'])
  .index('by_tokenIdentifier', ['tokenIdentifier'])
  .index('by_authSubject', ['authSubject'])
  .index('by_normalizedPhone', ['normalizedPhone'])
  .index('email', ['email'])
  .index('type', ['type']);

function unauthorizedError() {
  return new ConvexError({
    name: 'Unauthorized',
    message: 'You are not authorized to access this resource.',
  });
}

async function requireIdentity(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw unauthorizedError();
  }

  return identity;
}

async function findUserByIdentity(
  ctx: QueryCtx | MutationCtx,
  tokenIdentifier: string,
  subject: string
) {
  const byAuthId = await ctx.db
    .query('users')
    .withIndex('by_authId', (q) => q.eq('authId', subject))
    .unique();

  if (byAuthId) {
    return byAuthId;
  }

  const byToken = await ctx.db
    .query('users')
    .withIndex('by_tokenIdentifier', (q) =>
      q.eq('tokenIdentifier', tokenIdentifier)
    )
    .unique();

  if (byToken) {
    return byToken;
  }

  return await ctx.db
    .query('users')
    .withIndex('by_authSubject', (q) => q.eq('authSubject', subject))
    .unique();
}

async function syncIdentityFields(
  ctx: MutationCtx,
  user: Doc<'users'>,
  identity: Awaited<ReturnType<typeof requireIdentity>>
) {
  const patch: Partial<Doc<'users'>> = {};

  if (user.authId !== identity.subject) {
    patch.authId = identity.subject;
  }

  if (user.tokenIdentifier !== identity.tokenIdentifier) {
    patch.tokenIdentifier = identity.tokenIdentifier;
  }

  if (user.authSubject !== identity.subject) {
    patch.authSubject = identity.subject;
  }

  if (identity.email && user.email !== identity.email) {
    patch.email = identity.email;
  }

  if (identity.name && user.name !== identity.name) {
    patch.name = identity.name;
  }

  if (identity.pictureUrl && user.image !== identity.pictureUrl) {
    patch.image = identity.pictureUrl;
  }

  if (Object.keys(patch).length > 0) {
    await ctx.db.patch('users', user._id, patch);
    return { ...user, ...patch };
  }

  return user;
}

export async function getCurrentUserOrThrow(ctx: QueryCtx | MutationCtx) {
  const identity = await requireIdentity(ctx);
  const user = await findUserByIdentity(
    ctx,
    identity.tokenIdentifier,
    identity.subject
  );

  if (!user) {
    throw new ConvexError({
      name: 'Not Found',
      message: 'The user was not found.',
    });
  }

  return user;
}

export async function getCurrentUserForMutationOrThrow(ctx: MutationCtx) {
  const identity = await requireIdentity(ctx);
  const user = await findUserByIdentity(
    ctx,
    identity.tokenIdentifier,
    identity.subject
  );

  if (!user) {
    throw new ConvexError({
      name: 'Not Found',
      message: 'The user was not found.',
    });
  }

  return await syncIdentityFields(ctx, user, identity);
}

export async function getCurrentUserIdOrThrow(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUserOrThrow(ctx);
  return user._id;
}

export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    return await getCurrentUserOrThrow(ctx);
  },
});

export const currentUserOrNull = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      return null;
    }

    return await findUserByIdentity(
      ctx,
      identity.tokenIdentifier,
      identity.subject
    );
  },
});

export const syncCurrentUserFromAuth = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const existingUser = await findUserByIdentity(
      ctx,
      identity.tokenIdentifier,
      identity.subject
    );

    if (existingUser) {
      return await syncIdentityFields(ctx, existingUser, identity);
    }

    const userId = await ctx.db.insert('users', {
      authId: identity.subject,
      tokenIdentifier: identity.tokenIdentifier,
      authSubject: identity.subject,
      name: identity.name,
      image: identity.pictureUrl,
      email: identity.email,
      emailVerificationTime: identity.emailVerified
        ? Date.now()
        : undefined,
      profileComplete: false,
      agreedToTerms: false,
    });

    const createdUser = await ctx.db.get('users', userId);

    if (!createdUser) {
      throw new ConvexError({
        name: 'Internal Error',
        message: 'The user could not be provisioned.',
      });
    }

    return createdUser;
  },
});

export const update = mutation({
  args: {
    _id: v.id('users'),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    type: v.optional(
      v.union(
        v.literal('admin'),
        v.literal('staff'),
        v.literal('business'),
        v.literal('collector')
      )
    ),
    profileComplete: v.optional(v.boolean()),
    agreedToTerms: v.optional(v.boolean()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    idNumber: v.optional(v.string()),
    businessName: v.optional(v.string()),
    businessRegistrationNumber: v.optional(v.string()),
    bankAccountHolderName: v.optional(v.string()),
    bankName: v.optional(v.string()),
    bankAccountNumber: v.optional(v.string()),
    bankBranchCode: v.optional(v.string()),
    bankAccountType: v.optional(
      v.union(
        v.literal('Cheque'),
        v.literal('Savings'),
        v.literal('Transmission')
      )
    ),
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

    if (currentUser._id !== args._id) {
      throw unauthorizedError();
    }

    const existingUser = await ctx.db.get(args._id);

    if (!existingUser)
      throw new ConvexError({
        name: 'Not Found',
        message: 'The user was not found.',
      });

    const nextUser = {
      ...existingUser,
      ...args,
    };

    const providedBankDetailCount = bankDetailFields.filter((fieldName) =>
      isBankDetailValueFilled(nextUser[fieldName])
    ).length;

    if (
      providedBankDetailCount > 0 &&
      providedBankDetailCount < bankDetailFields.length
    ) {
      throw new ConvexError({
        name: 'Invalid Input',
        message:
          'Please complete all bank details or leave every bank detail field blank.',
      });
    }

    if (
      nextUser.type === 'business' &&
      nextUser.profileComplete &&
      providedBankDetailCount < bankDetailFields.length
    ) {
      throw new ConvexError({
        name: 'Invalid Input',
        message:
          'Businesses must provide complete bank details before completing their profile.',
      });
    }

    const normalizedPhone =
      args.phone === undefined
        ? undefined
        : normalizeSouthAfricanPhoneNumber(args.phone);

    await ctx.db.patch('users', args._id, {
      ...args,
      ...(args.phone === undefined ? {} : { normalizedPhone }),
      _id: undefined,
    });
  },
});

export const listCollectors = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query('users')
      .withIndex('type', (q) => q.eq('type', 'collector'))
      .collect();
  },
});

export const listBusinesses = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query('users')
      .withIndex('type', (q) => q.eq('type', 'business'))
      .collect();
  },
});

export const findById = query({
  args: {
    _id: v.id('users'),
  },
  handler: async (ctx, { _id }) => {
    return await ctx.db.get('users', _id);
  },
});

export const listAll = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const caller = await getCurrentUserOrThrow(ctx);
    if (!caller || caller.type !== 'admin')
      throw new ConvexError({ name: 'Unauthorized', message: 'Only admins can list all users.' });

    return await ctx.db.query('users').order('desc').paginate(paginationOpts);
  },
});

export const setType = mutation({
  args: {
    _id: v.id('users'),
    type: v.union(
      v.literal('admin'),
      v.literal('staff'),
      v.literal('business'),
      v.literal('collector')
    ),
  },
  handler: async (ctx, { _id, type }) => {
    const caller = await getCurrentUserForMutationOrThrow(ctx);
    if (!caller || caller.type !== 'admin')
      throw new ConvexError({ name: 'Unauthorized', message: 'Only admins can change user types.' });

    if (_id === caller._id)
      throw new ConvexError({ name: 'Invalid Input', message: 'You cannot change your own type.' });

    await ctx.db.patch('users', _id, { type });
  },
});

export const removeUser = mutation({
  args: { _id: v.id('users') },
  handler: async (ctx, { _id }) => {
    const caller = await getCurrentUserForMutationOrThrow(ctx);
    if (!caller || caller.type !== 'admin')
      throw new ConvexError({ name: 'Unauthorized', message: 'Only admins can remove users.' });

    if (_id === caller._id)
      throw new ConvexError({ name: 'Invalid Input', message: 'You cannot remove your own account.' });

    await ctx.db.delete('users', _id);
  },
});

const bankDetailFields = [
  'bankAccountHolderName',
  'bankName',
  'bankAccountNumber',
  'bankBranchCode',
  'bankAccountType',
] as const;

function isBankDetailValueFilled(value: string | undefined) {
  return typeof value === 'string' && value.trim().length > 0;
}
