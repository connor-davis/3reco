import { AuthKit, type AuthFunctions } from '@convex-dev/workos-authkit';
import { components, internal } from './_generated/api';
import type { DataModel } from './_generated/dataModel';

const authFunctions: AuthFunctions = internal.auth;

export const authKit = new AuthKit<DataModel>(components.workOSAuthKit, {
  authFunctions,
});

function formatName(
  firstName?: string | null,
  lastName?: string | null,
  fallbackEmail?: string
) {
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  return name || fallbackEmail;
}

export const { authKitEvent } = authKit.events({
  'user.created': async (ctx, event) => {
    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_authId', (q) => q.eq('authId', event.data.id))
      .unique();

    const patch = {
      authId: event.data.id,
      authSubject: event.data.id,
      email: event.data.email,
      name: formatName(event.data.firstName, event.data.lastName, event.data.email),
      firstName: event.data.firstName ?? undefined,
      lastName: event.data.lastName ?? undefined,
      image: event.data.profilePictureUrl ?? undefined,
      emailVerificationTime: event.data.emailVerified ? Date.now() : undefined,
    };

    if (existingUser) {
      await ctx.db.patch('users', existingUser._id, patch);
      return;
    }

    await ctx.db.insert('users', {
      ...patch,
      profileComplete: false,
      agreedToTerms: false,
    });
  },
  'user.updated': async (ctx, event) => {
    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_authId', (q) => q.eq('authId', event.data.id))
      .unique();

    const patch = {
      authId: event.data.id,
      authSubject: event.data.id,
      email: event.data.email,
      name: formatName(event.data.firstName, event.data.lastName, event.data.email),
      firstName: event.data.firstName ?? undefined,
      lastName: event.data.lastName ?? undefined,
      image: event.data.profilePictureUrl ?? undefined,
      emailVerificationTime: event.data.emailVerified
        ? (existingUser?.emailVerificationTime ?? Date.now())
        : undefined,
    };

    if (!existingUser) {
      await ctx.db.insert('users', {
        ...patch,
        profileComplete: false,
        agreedToTerms: false,
      });
      return;
    }

    await ctx.db.patch('users', existingUser._id, patch);
  },
  'user.deleted': async (ctx, event) => {
    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_authId', (q) => q.eq('authId', event.data.id))
      .unique();

    if (!existingUser) {
      return;
    }

    await ctx.db.delete('users', existingUser._id);
  },
});

export const { authKitAction } = authKit.actions({
  authentication: async (_ctx, _action, response) => {
    return response.allow();
  },
  userRegistration: async (_ctx, _action, response) => {
    return response.allow();
  },
});
