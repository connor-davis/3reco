# 3rEco

## Development

This app uses React, Vite, TypeScript, Convex, and Better Auth.

Create a local `.env.local` file with:

```env
VITE_CONVEX_URL=
VITE_CONVEX_SITE_URL=
```

Convex also needs these server-side Better Auth variables:

- `CONVEX_SITE_URL`
- `BETTER_AUTH_SECRET`
- `SITE_URL`
- `RESEND_API_KEY`
- `AUTH_FROM_EMAIL`
- optional `JWKS` only if you intentionally supply Better Auth's expected static
  JWKS format

For local development, set `SITE_URL` to the frontend origin (for example
`http://127.0.0.1:5173`) and `VITE_CONVEX_SITE_URL` to the Convex site origin that
serves the Better Auth HTTP routes.

Do not pass a public `{"keys":[...]}` JWKS object to Better Auth's Convex
helpers. If you set `JWKS`, it must use the format expected by
`@convex-dev/better-auth`; otherwise, leave it unset and use the dynamic keys
endpoint instead.

Password reset and verification emails are sent through Resend. Reset links
return to `/auth/reset-password`, where Better Auth passes the reset token back
to the SPA in the query string.
