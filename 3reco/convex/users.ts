import { defineTable } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { Id } from './_generated/dataModel';

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
  province: v.optional(v.string()),
})
  .index('email', ['email'])
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
