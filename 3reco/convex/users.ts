import { defineTable, paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { components, internal } from './_generated/api';
import { normalizeSouthAfricanPhoneNumber } from './lib/phone';

const userRoleValues = ['admin', 'staff', 'business', 'collector'] as const;
type UserRole = (typeof userRoleValues)[number];
const userRoleValidator = v.union(
  v.literal('admin'),
  v.literal('staff'),
  v.literal('business'),
  v.literal('collector')
);
const userRoleSet = new Set<UserRole>(userRoleValues);

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
  role: v.optional(userRoleValidator),
  // Deprecated during the role migration window. Remove after the backfill is complete.
  type: v.optional(userRoleValidator),
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
  isRemoved: v.optional(v.boolean()),
  removedAt: v.optional(v.number()),
  removedBy: v.optional(v.id('users')),
})
  .index('by_authId', ['authId'])
  .index('by_tokenIdentifier', ['tokenIdentifier'])
  .index('by_authSubject', ['authSubject'])
  .index('by_normalizedPhone', ['normalizedPhone'])
  .index('email', ['email'])
  .index('by_role', ['role'])
  .index('by_type', ['type']);

function unauthorizedError() {
  return new ConvexError({
    name: 'Unauthorized',
    message: 'You are not authorized to access this resource.',
  });
}

function removedAccountError() {
  return new ConvexError({
    name: 'Account Removed',
    message: 'This account has been removed.',
  });
}

function isRemovedUser(user: Pick<Doc<'users'>, 'isRemoved'> | null | undefined) {
  return user?.isRemoved === true;
}

type UserRoleCarrier = Pick<Doc<'users'>, 'role'> & { type?: unknown };

export function getUserRole(user: UserRoleCarrier | null | undefined): UserRole | undefined {
  if (!user) {
    return undefined;
  }

  if (typeof user.role === 'string' && userRoleSet.has(user.role as UserRole)) {
    return user.role as UserRole;
  }

  if (typeof user.type === 'string' && userRoleSet.has(user.type as UserRole)) {
    return user.type as UserRole;
  }

  return undefined;
}

function normalizeUserRole<T extends Doc<'users'> | null | undefined>(user: T): T {
  if (!user) {
    return user;
  }

  const role = getUserRole(user);
  if (!role || user.role === role) {
    return user;
  }

  return { ...user, role } as T;
}

const REMOVED_ACCOUNT_LABEL = 'Removed account';
const AUTH_DELETE_PAGINATION_OPTS = {
  cursor: null,
  numItems: 1024,
} as const;

async function requireIdentity(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw unauthorizedError();
  }

  return identity;
}

/**
 * Checks that the authenticated user has one of the given roles.
 * Reads the role from the Convex `users` table (single source of truth).
 */
export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  role: string | string[]
) {
  await requireIdentity(ctx);
  const allowed = Array.isArray(role) ? role : [role];
  const user = await getCurrentUserOrThrow(ctx);
  const resolvedRole = getUserRole(user);
  if (!resolvedRole || !allowed.includes(resolvedRole)) throw unauthorizedError();
  return user;
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
  if (isRemovedUser(user)) {
    throw removedAccountError();
  }

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

  if (identity.emailVerified) {
    patch.emailVerificationTime = user.emailVerificationTime ?? Date.now();
  }

  if (identity.name && user.name !== identity.name) {
    patch.name = identity.name;
  }

  if (identity.pictureUrl && user.image !== identity.pictureUrl) {
    patch.image = identity.pictureUrl;
  }

  if (Object.keys(patch).length > 0) {
    await ctx.db.patch('users', user._id, patch);
    return normalizeUserRole({ ...user, ...patch } as Doc<'users'>);
  }

  return normalizeUserRole(user);
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

  if (isRemovedUser(user)) {
    throw removedAccountError();
  }

  return normalizeUserRole(user);
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

  if (isRemovedUser(user)) {
    throw removedAccountError();
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

    const user = await findUserByIdentity(
      ctx,
      identity.tokenIdentifier,
      identity.subject
    );

    return isRemovedUser(user) ? null : normalizeUserRole(user);
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

    const existingByEmail = identity.email
      ? await ctx.db
          .query('users')
          .withIndex('email', (q) => q.eq('email', identity.email))
          .unique()
      : null;

    if (existingByEmail && !isRemovedUser(existingByEmail)) {
      return await syncIdentityFields(ctx, existingByEmail, identity);
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

    return normalizeUserRole(createdUser);
  },
});

export const update = mutation({
  args: {
    _id: v.id('users'),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
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
      getUserRole(nextUser) === 'business' &&
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
    return await listUsersByRole(ctx, 'collector');
  },
});

export const listBusinesses = query({
  args: {},
  handler: async (ctx) => {
    return await listUsersByRole(ctx, 'business');
  },
});

export const findById = query({
  args: {
    _id: v.id('users'),
  },
  handler: async (ctx, { _id }) => {
    return normalizeUserRole(await ctx.db.get('users', _id));
  },
});

export const listAll = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    await requireRole(ctx, 'admin');

    const results = await ctx.db
      .query('users')
      .filter((q) => q.neq(q.field('isRemoved'), true))
      .order('desc')
      .paginate(paginationOpts);

    return {
      ...results,
      page: results.page.map((user) => normalizeUserRole(user)),
    };
  },
});

function dedupeById<T extends { _id: string }>(docs: T[]) {
  return [...new Map(docs.map((doc) => [doc._id, doc])).values()];
}

async function listUsersByRole(ctx: QueryCtx, role: UserRole) {
  const [usersByRole, legacyUsersByType] = await Promise.all([
    ctx.db
      .query('users')
      .withIndex('by_role', (q) => q.eq('role', role))
      .collect(),
    ctx.db
      .query('users')
      .withIndex('by_type', (q) => q.eq('type', role))
      .collect(),
  ]);

  return dedupeById(
    [...usersByRole, ...legacyUsersByType].map((user) => normalizeUserRole(user))
  ).filter((user) => !isRemovedUser(user) && getUserRole(user) === role);
}

function buildRemovedUserPatch(removedBy: Id<'users'>): Partial<Doc<'users'>> {
  return {
    authId: undefined,
    tokenIdentifier: undefined,
    authSubject: undefined,
    name: REMOVED_ACCOUNT_LABEL,
    image: undefined,
    email: undefined,
    emailVerificationTime: undefined,
    phone: undefined,
    normalizedPhone: undefined,
    phoneVerificationTime: undefined,
    role: undefined,
    type: undefined,
    profileComplete: false,
    agreedToTerms: false,
    firstName: undefined,
    lastName: undefined,
    idNumber: undefined,
    businessName: REMOVED_ACCOUNT_LABEL,
    businessRegistrationNumber: undefined,
    bankAccountHolderName: undefined,
    bankName: undefined,
    bankAccountNumber: undefined,
    bankBranchCode: undefined,
    bankAccountType: undefined,
    streetAddress: undefined,
    city: undefined,
    areaCode: undefined,
    province: undefined,
    isRemoved: true,
    removedAt: Date.now(),
    removedBy,
  };
}

async function deleteBetterAuthData(ctx: MutationCtx, user: Doc<'users'>) {
  const authUserId = user.authId ?? user.authSubject;

  if (authUserId) {
    await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
      input: { model: 'session', where: [{ field: 'userId', value: authUserId }] },
      paginationOpts: AUTH_DELETE_PAGINATION_OPTS,
    });
    await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
      input: { model: 'account', where: [{ field: 'userId', value: authUserId }] },
      paginationOpts: AUTH_DELETE_PAGINATION_OPTS,
    });
    await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
      input: { model: 'twoFactor', where: [{ field: 'userId', value: authUserId }] },
      paginationOpts: AUTH_DELETE_PAGINATION_OPTS,
    });
    await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
      input: {
        model: 'oauthApplication',
        where: [{ field: 'userId', value: authUserId }],
      },
      paginationOpts: AUTH_DELETE_PAGINATION_OPTS,
    });
    await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
      input: {
        model: 'oauthAccessToken',
        where: [{ field: 'userId', value: authUserId }],
      },
      paginationOpts: AUTH_DELETE_PAGINATION_OPTS,
    });
    await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
      input: { model: 'oauthConsent', where: [{ field: 'userId', value: authUserId }] },
      paginationOpts: AUTH_DELETE_PAGINATION_OPTS,
    });
    await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
      input: { model: 'user', where: [{ field: '_id', value: authUserId }] },
      paginationOpts: AUTH_DELETE_PAGINATION_OPTS,
    });
  }

  if (user.email) {
    await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
      input: {
        model: 'verification',
        where: [{ field: 'identifier', value: user.email }],
      },
      paginationOpts: AUTH_DELETE_PAGINATION_OPTS,
    });
  }
}

async function deleteDisposableUserData(ctx: MutationCtx, userId: Id<'users'>) {
  const [notifications, stock, requestsAsSeller, requestsAsBuyer, allCarts] =
    await Promise.all([
      ctx.db
        .query('notifications')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .collect(),
      ctx.db
        .query('stock')
        .withIndex('by_ownerId', (q) => q.eq('ownerId', userId))
        .collect(),
      ctx.db
        .query('transactionRequests')
        .withIndex('by_sellerId', (q) => q.eq('sellerId', userId))
        .collect(),
      ctx.db
        .query('transactionRequests')
        .withIndex('by_buyerId', (q) => q.eq('buyerId', userId))
        .collect(),
      ctx.db.query('carts').collect(),
    ]);

  await Promise.all(notifications.map((notification) => ctx.db.delete(notification._id)));
  await Promise.all(stock.map((item) => ctx.db.delete(item._id)));

  const carts = allCarts.filter(
    (cart) => cart.buyerId === userId || cart.sellerId === userId
  );
  await Promise.all(carts.map((cart) => ctx.db.delete(cart._id)));

  const requests = dedupeById([...requestsAsSeller, ...requestsAsBuyer]);
  const requestMessages = await Promise.all(
    requests.map((request) =>
      ctx.db
        .query('transactionRequestMessages')
        .withIndex('by_transactionId', (q) => q.eq('transactionId', request._id))
        .collect()
    )
  );

  await Promise.all(
    requestMessages.flat().map((message) => ctx.db.delete(message._id))
  );
  await Promise.all(requests.map((request) => ctx.db.delete(request._id)));
}

async function scheduleInvoiceRegenerationForUser(
  ctx: MutationCtx,
  userId: Id<'users'>
) {
  const [transactionsAsBuyer, transactionsAsSeller] = await Promise.all([
    ctx.db
      .query('transactions')
      .withIndex('by_buyerId', (q) => q.eq('buyerId', userId))
      .collect(),
    ctx.db
      .query('transactions')
      .withIndex('by_sellerId', (q) => q.eq('sellerId', userId))
      .collect(),
  ]);

  await Promise.all(
    dedupeById([...transactionsAsBuyer, ...transactionsAsSeller]).map(
      (transaction) =>
        ctx.scheduler.runAfter(0, internal.invoices.generateForTransaction, {
          transactionId: transaction._id,
          notifyBuyer: false,
        })
    )
  );
}

export const removeUser = mutation({
  args: { _id: v.id('users') },
  handler: async (ctx, { _id }) => {
    await requireRole(ctx, 'admin');
    const caller = await getCurrentUserForMutationOrThrow(ctx);

    if (_id === caller._id)
      throw new ConvexError({ name: 'Invalid Input', message: 'You cannot remove your own account.' });

    const user = await ctx.db.get(_id);

    if (!user) {
      throw new ConvexError({
        name: 'Not Found',
        message: 'The user was not found.',
      });
    }

    if (isRemovedUser(user)) {
      throw new ConvexError({
        name: 'Invalid Input',
        message: 'This user has already been removed.',
      });
    }

    await deleteBetterAuthData(ctx, user);
    await deleteDisposableUserData(ctx, user._id);
    await ctx.db.patch('users', _id, buildRemovedUserPatch(caller._id));
    await scheduleInvoiceRegenerationForUser(ctx, user._id);
  },
});

export const setUserRole = mutation({
  args: {
    userId: v.id('users'),
    role: userRoleValidator,
  },
  handler: async (ctx, { userId, role }) => {
    await requireRole(ctx, 'admin');
    const user = await ctx.db.get(userId);
    if (!user || user.isRemoved === true) {
      throw new ConvexError({ name: 'Not Found', message: 'User not found.' });
    }
    await ctx.db.patch(userId, { role, type: role });
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

