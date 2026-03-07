import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { TOTP, Secret } from 'otpauth';

// Generate a new TOTP secret for a user
export const setupTOTP = mutation({
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
        message: 'User not found.',
      });

    // Generate a new secret
    const secret = new Secret({ size: 20 });
    const secretBase32 = secret.base32;

    // Create TOTP instance
    const totp = new TOTP({
      issuer: '3rEco',
      label: user.email || user.phone || 'User',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: secretBase32,
    });

    // Store the secret (not yet enabled)
    await ctx.db.patch('users', userId as Id<'users'>, {
      totpSecret: secretBase32,
      mfaEnabled: false,
    });

    // Return the otpauth URL for QR code generation
    return {
      secret: secretBase32,
      qrCode: totp.toString(),
    };
  },
});

// Verify TOTP code and enable MFA
export const verifyAndEnableTOTP = mutation({
  args: {
    code: v.string(),
  },
  handler: async (ctx, { code }) => {
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
        message: 'User not found.',
      });

    if (!user.totpSecret)
      throw new ConvexError({
        name: 'Bad Request',
        message: 'No TOTP secret found. Please set up TOTP first.',
      });

    // Verify the code
    const totp = new TOTP({
      issuer: '3rEco',
      label: user.email || user.phone || 'User',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: user.totpSecret,
    });

    const delta = totp.validate({ token: code, window: 1 });

    if (delta === null) {
      throw new ConvexError({
        name: 'Invalid Code',
        message: 'The verification code is invalid or expired.',
      });
    }

    // Enable MFA
    await ctx.db.patch('users', userId as Id<'users'>, {
      mfaEnabled: true,
    });

    return { success: true };
  },
});

// Verify TOTP code during login (for future use)
export const verifyTOTP = query({
  args: {
    userId: v.id('users'),
    code: v.string(),
  },
  handler: async (ctx, { userId, code }) => {
    const user = await ctx.db.get('users', userId);

    if (!user)
      throw new ConvexError({
        name: 'Not Found',
        message: 'User not found.',
      });

    if (!user.mfaEnabled || !user.totpSecret) {
      return { valid: false };
    }

    const totp = new TOTP({
      issuer: '3rEco',
      label: user.email || user.phone || 'User',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: user.totpSecret,
    });

    const delta = totp.validate({ token: code, window: 1 });
    return { valid: delta !== null };
  },
});

// Disable MFA
export const disableTOTP = mutation({
  args: {
    code: v.string(),
  },
  handler: async (ctx, { code }) => {
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
        message: 'User not found.',
      });

    if (!user.mfaEnabled || !user.totpSecret) {
      throw new ConvexError({
        name: 'Bad Request',
        message: 'MFA is not enabled.',
      });
    }

    // Verify the code before disabling
    const totp = new TOTP({
      issuer: '3rEco',
      label: user.email || user.phone || 'User',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: user.totpSecret,
    });

    const delta = totp.validate({ token: code, window: 1 });

    if (delta === null) {
      throw new ConvexError({
        name: 'Invalid Code',
        message: 'The verification code is invalid or expired.',
      });
    }

    // Disable MFA and remove secret
    await ctx.db.patch('users', userId as Id<'users'>, {
      mfaEnabled: false,
      totpSecret: undefined,
    });

    return { success: true };
  },
});

// Mark MFA suggestion as shown
export const markMfaSuggestionShown = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({
        name: 'Unauthorized',
        message: 'You are not authorized to access this resource.',
      });

    const [userId] = identity.subject.split('|');
    await ctx.db.patch('users', userId as Id<'users'>, {
      mfaSuggestionShown: true,
    });
  },
});

// Skip MFA suggestion
export const skipMfaSuggestion = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({
        name: 'Unauthorized',
        message: 'You are not authorized to access this resource.',
      });

    const [userId] = identity.subject.split('|');
    await ctx.db.patch('users', userId as Id<'users'>, {
      mfaSuggestionShown: true,
      mfaSuggestionSkipped: true,
    });
  },
});

// Check if user should see MFA suggestion
export const shouldShowMfaSuggestion = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;

    const [userId] = identity.subject.split('|');
    const user = await ctx.db.get('users', userId as Id<'users'>);

    if (!user) return false;

    // Don't show if already enabled, already shown, or user skipped
    if (user.mfaEnabled) return false;
    if (user.mfaSuggestionShown) return false;
    if (user.mfaSuggestionSkipped) return false;

    // Show suggestion if profile is complete
    return user.profileComplete === true;
  },
});
