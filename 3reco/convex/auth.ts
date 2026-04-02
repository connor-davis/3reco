/// <reference types="node" />

import { createClient, type GenericCtx } from '@convex-dev/better-auth';
import { convex, crossDomain } from '@convex-dev/better-auth/plugins';
import { betterAuth } from 'better-auth/minimal';
import { Resend } from 'resend';
import { components } from './_generated/api';
import type { DataModel } from './_generated/dataModel';
import authConfig from './auth.config';

const siteUrl = process.env.SITE_URL!;

export const authComponent = createClient<DataModel>(components.betterAuth);
export const { getAuthUser } = authComponent.clientApi();

function renderEmailShell(title: string, body: string, ctaLabel: string, url: string) {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="margin-bottom: 12px;">${title}</h2>
      <p style="margin-bottom: 20px;">${body}</p>
      <p style="margin-bottom: 20px;">
        <a href="${url}" style="display: inline-block; padding: 12px 18px; border-radius: 9999px; background: #0f766e; color: #ffffff; text-decoration: none; font-weight: 600;">
          ${ctaLabel}
        </a>
      </p>
      <p style="color: #6b7280; font-size: 14px;">If the button does not work, copy and paste this URL into your browser:</p>
      <p style="color: #0f766e; font-size: 14px; word-break: break-all;">${url}</p>
    </div>
  `;
}

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error('Missing RESEND_API_KEY environment variable.');
  }

  return new Resend(apiKey);
}

function getFromEmail() {
  const fromEmail = process.env.AUTH_FROM_EMAIL;

  if (!fromEmail) {
    throw new Error('Missing AUTH_FROM_EMAIL environment variable.');
  }

  return fromEmail;
}

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    trustedOrigins: [siteUrl],
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      sendResetPassword: async ({ user, url }) => {
        await getResendClient().emails.send({
          from: getFromEmail(),
          to: user.email,
          subject: 'Reset your 3rEco password',
          html: renderEmailShell(
            'Reset your 3rEco password',
            'We received a request to reset your password. Click below to choose a new one.',
            'Reset password',
            url
          ),
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url }) => {
        await getResendClient().emails.send({
          from: getFromEmail(),
          to: user.email,
          subject: 'Verify your 3rEco email address',
          html: renderEmailShell(
            'Verify your email address',
            'Click below to verify your email address and finish setting up your 3rEco account.',
            'Verify email',
            url
          ),
        });
      },
    },
    plugins: [
      crossDomain({ siteUrl }),
      convex({
        authConfig,
      }),
    ],
  });
