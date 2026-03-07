// WorkOS User Management — Convex JWT verification
// WorkOS issues access tokens with:
//   iss: "https://api.workos.com"
//   aud: [WORKOS_CLIENT_ID]
// Convex fetches the JWKS from https://api.workos.com/.well-known/jwks.json
export default {
  providers: [
    {
      domain: 'https://api.workos.com',
      applicationID: process.env.WORKOS_CLIENT_ID ?? '',
    },
  ],
};
