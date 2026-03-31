# 3rEco

## Development

This app uses React, Vite, TypeScript, Convex, and WorkOS AuthKit.

Create a local `.env.local` file with:

```env
VITE_CONVEX_URL=
VITE_WORKOS_CLIENT_ID=
VITE_WORKOS_REDIRECT_URI=http://127.0.0.1:5173/callback
```

Convex also needs these server-side WorkOS variables:

- `WORKOS_CLIENT_ID`
- `WORKOS_API_KEY`
- `WORKOS_WEBHOOK_SECRET`
- `WORKOS_ACTION_SECRET` if you enable WorkOS actions

For local AuthKit provisioning, keep the frontend origin and `VITE_WORKOS_REDIRECT_URI`
on the same host. This repo now allows both `http://localhost:5173` and
`http://127.0.0.1:5173`, but the sign-in flow must start and finish on the same
origin.
