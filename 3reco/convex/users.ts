import { defineTable, paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Id } from './_generated/dataModel';

export default defineTable({
  name: v.optional(v.string()),
  image: v.optional(v.string()),
  email: v.optional(v.string()),
  emailVerificationTime: v.optional(v.number()),
  phone: v.optional(v.string()),
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
  // MFA fields
  mfaEnabled: v.optional(v.boolean()),
  totpSecret: v.optional(v.string()),
  mfaSuggestionShown: v.optional(v.boolean()),
  mfaSuggestionSkipped: v.optional(v.boolean()),
  // Admin-managed fields
  requirePasswordReset: v.optional(v.boolean()),
})
  .index('email', ['email'])
  .index('phone', ['phone'])
  .index('type', ['type']);

export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity)
      throw new ConvexError({
        name: 'Unauthorized',
        message: 'You are not authorized to access this resource.',
      });

    const [userId] = identity.subject.split('|');
    const user = await ctx.db.get('users', userId as Id<'users'>);

    if (!user)
      throw new ConvexError({
        name: 'Not Found',
        message: 'The user was not found.',
      });

    return user;
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
    await ctx.db.patch('users', args._id, { ...args, _id: undefined });
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({ name: 'Unauthorized', message: 'You are not authorized to access this resource.' });

    const [userId] = identity.subject.split('|');
    const caller = await ctx.db.get('users', userId as Id<'users'>);
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({ name: 'Unauthorized', message: 'You are not authorized to access this resource.' });

    const [userId] = identity.subject.split('|');
    const caller = await ctx.db.get('users', userId as Id<'users'>);
    if (!caller || caller.type !== 'admin')
      throw new ConvexError({ name: 'Unauthorized', message: 'Only admins can change user types.' });

    if (_id === (userId as Id<'users'>))
      throw new ConvexError({ name: 'Invalid Input', message: 'You cannot change your own type.' });

    await ctx.db.patch('users', _id, { type });
  },
});

export const removeUser = mutation({
  args: { _id: v.id('users') },
  handler: async (ctx, { _id }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({ name: 'Unauthorized', message: 'You are not authorized to access this resource.' });

    const [userId] = identity.subject.split('|');
    const caller = await ctx.db.get('users', userId as Id<'users'>);
    if (!caller || caller.type !== 'admin')
      throw new ConvexError({ name: 'Unauthorized', message: 'Only admins can remove users.' });

    if (_id === (userId as Id<'users'>))
      throw new ConvexError({ name: 'Invalid Input', message: 'You cannot remove your own account.' });

    await ctx.db.delete('users', _id);
  },
});

// Admin/Staff can create users manually (requires MFA)
export const createUser = mutation({
  args: {
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    password: v.string(),
    type: v.union(
      v.literal('admin'),
      v.literal('staff'),
      v.literal('business'),
      v.literal('collector')
    ),
    requirePasswordReset: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({ name: 'Unauthorized', message: 'You are not authorized to access this resource.' });

    const [userId] = identity.subject.split('|');
    const caller = await ctx.db.get('users', userId as Id<'users'>);

    // Only admin or staff can create users
    if (!caller || (caller.type !== 'admin' && caller.type !== 'staff'))
      throw new ConvexError({ name: 'Unauthorized', message: 'Only admins and staff can create users.' });

    // Require MFA to be enabled for admin/staff creating users
    if (!caller.mfaEnabled)
      throw new ConvexError({
        name: 'MFA Required',
        message: 'You must enable MFA before creating users.'
      });

    // Validate that either email or phone is provided
    if (!args.email && !args.phone)
      throw new ConvexError({
        name: 'Invalid Input',
        message: 'Either email or phone number must be provided.'
      });

    // This is a placeholder - actual user creation with password would need to be
    // integrated with the Convex Auth system. For now, we'll throw an error
    // directing to use the standard signup flow
    throw new ConvexError({
      name: 'Not Implemented',
      message: 'User creation must be done through the Convex Auth system. This feature will be implemented with custom auth endpoints.'
    });
  },
});

// Toggle password reset requirement for a user
export const togglePasswordReset = mutation({
  args: {
    _id: v.id('users'),
    requirePasswordReset: v.boolean(),
  },
  handler: async (ctx, { _id, requirePasswordReset }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({ name: 'Unauthorized', message: 'You are not authorized to access this resource.' });

    const [userId] = identity.subject.split('|');
    const caller = await ctx.db.get('users', userId as Id<'users'>);

    // Only admin or staff can toggle password reset
    if (!caller || (caller.type !== 'admin' && caller.type !== 'staff'))
      throw new ConvexError({ name: 'Unauthorized', message: 'Only admins and staff can require password resets.' });

    // Require MFA to be enabled
    if (!caller.mfaEnabled)
      throw new ConvexError({
        name: 'MFA Required',
        message: 'You must enable MFA before managing user password resets.'
      });

    if (_id === (userId as Id<'users'>))
      throw new ConvexError({ name: 'Invalid Input', message: 'You cannot require a password reset for your own account.' });

    await ctx.db.patch('users', _id, { requirePasswordReset });
  },
});
