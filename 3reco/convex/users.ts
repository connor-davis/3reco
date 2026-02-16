import { defineTable } from 'convex/server';
import { v } from 'convex/values';

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
