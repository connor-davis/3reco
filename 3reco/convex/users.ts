import { defineTable, paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';

/** Allowed user roles — mirror the roles configured in WorkOS. */
export const userRoleValidator = v.union(
  v.literal('admin'),
  v.literal('staff'),
  v.literal('business'),
  v.literal('collector'),
);

export default defineTable({
  /** WorkOS user ID — the JWT `sub` claim. */
  workosUserId: v.string(),
  name: v.optional(v.string()),
  image: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  /** Role synced from the WorkOS access token on every sign-in. */
  role: v.optional(userRoleValidator),
  profileComplete: v.optional(v.boolean()),
  agreedToTerms: v.optional(v.boolean()),
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  idNumber: v.optional(v.string()),
  businessName: v.optional(v.string()),
  businessRegistrationNumber: v.optional(v.string()),
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
      v.literal('Western Cape'),
    ),
  ),
})
  .index('workosUserId', ['workosUserId'])
  .index('email', ['email'])
  .index('phone', ['phone'])
  .index('role', ['role']);

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Resolve the authenticated caller's Convex user record.
 * Uses the WorkOS `sub` claim (identity.subject) as the lookup key.
 */
export async function getCallerUser(ctx: {
  auth: { getUserIdentity(): Promise<{ subject: string } | null> };
  db: { query(table: 'users'): any };
}) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return ctx.db
    .query('users')
    .withIndex('workosUserId', (q: any) =>
      q.eq('workosUserId', identity.subject),
    )
    .first();
}

// ─── Queries ────────────────────────────────────────────────────────────────

export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return ctx.db
      .query('users')
      .withIndex('workosUserId', (q) => q.eq('workosUserId', identity.subject))
      .first();
  },
});

export const findById = query({
  args: { _id: v.id('users') },
  handler: async (ctx, { _id }) => {
    return ctx.db.get('users', _id);
  },
});

export const listCollectors = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query('users')
      .withIndex('role', (q) => q.eq('role', 'collector'))
      .collect();
  },
});

export const listBusinesses = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query('users')
      .withIndex('role', (q) => q.eq('role', 'business'))
      .collect();
  },
});

export const listAll = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({
        name: 'Unauthorized',
        message: 'You are not authorized to access this resource.',
      });

    const caller = await ctx.db
      .query('users')
      .withIndex('workosUserId', (q) =>
        q.eq('workosUserId', identity.subject),
      )
      .first();
    if (!caller || caller.role !== 'admin')
      throw new ConvexError({
        name: 'Unauthorized',
        message: 'Only admins can list all users.',
      });

    return ctx.db.query('users').order('desc').paginate(paginationOpts);
  },
});

// ─── Mutations ───────────────────────────────────────────────────────────────

/**
 * Called by the frontend immediately after a successful WorkOS sign-in/up.
 * Creates or updates the Convex user record from the WorkOS identity.
 */
export const upsertFromWorkOS = mutation({
  args: {
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    /** Role slug as returned by WorkOS in the access token (`role` claim). */
    role: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({
        name: 'Unauthorized',
        message: 'You must be signed in.',
      });

    const workosUserId = identity.subject;
    const existing = await ctx.db
      .query('users')
      .withIndex('workosUserId', (q) => q.eq('workosUserId', workosUserId))
      .first();

    // Normalise role — only accept known values.
    const knownRoles = ['admin', 'staff', 'business', 'collector'] as const;
    const role = knownRoles.includes(args.role as any)
      ? (args.role as (typeof knownRoles)[number])
      : undefined;

    if (existing) {
      await ctx.db.patch('users', existing._id, {
        ...(args.email !== undefined && { email: args.email }),
        ...(args.phone !== undefined && { phone: args.phone }),
        ...(role !== undefined && { role }),
      });
      return existing._id;
    }

    return ctx.db.insert('users', {
      workosUserId,
      ...(args.email !== undefined && { email: args.email }),
      phone: args.phone,
      firstName: args.firstName,
      lastName: args.lastName,
      role,
      profileComplete: false,
      agreedToTerms: false,
    });
  },
});

export const update = mutation({
  args: {
    _id: v.id('users'),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    role: v.optional(userRoleValidator),
    profileComplete: v.optional(v.boolean()),
    agreedToTerms: v.optional(v.boolean()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    idNumber: v.optional(v.string()),
    businessName: v.optional(v.string()),
    businessRegistrationNumber: v.optional(v.string()),
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
        v.literal('Western Cape'),
      ),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch('users', args._id, { ...args, _id: undefined });
  },
});

export const setRole = mutation({
  args: {
    _id: v.id('users'),
    role: userRoleValidator,
  },
  handler: async (ctx, { _id, role }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({
        name: 'Unauthorized',
        message: 'You are not authorized to access this resource.',
      });

    const caller = await ctx.db
      .query('users')
      .withIndex('workosUserId', (q) =>
        q.eq('workosUserId', identity.subject),
      )
      .first();
    if (!caller || caller.role !== 'admin')
      throw new ConvexError({
        name: 'Unauthorized',
        message: 'Only admins can change user roles.',
      });

    if (_id === caller._id)
      throw new ConvexError({
        name: 'Invalid Input',
        message: 'You cannot change your own role.',
      });

    await ctx.db.patch('users', _id, { role });
  },
});

export const removeUser = mutation({
  args: { _id: v.id('users') },
  handler: async (ctx, { _id }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({
        name: 'Unauthorized',
        message: 'You are not authorized to access this resource.',
      });

    const caller = await ctx.db
      .query('users')
      .withIndex('workosUserId', (q) =>
        q.eq('workosUserId', identity.subject),
      )
      .first();
    if (!caller || caller.role !== 'admin')
      throw new ConvexError({
        name: 'Unauthorized',
        message: 'Only admins can remove users.',
      });

    if (_id === caller._id)
      throw new ConvexError({
        name: 'Invalid Input',
        message: 'You cannot remove your own account.',
      });

    await ctx.db.delete('users', _id);
  },
});
