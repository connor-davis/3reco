import { httpRouter } from 'convex/server';
import {
  mfaVerify,
  phoneSignIn,
  phoneSignUp,
  refreshToken,
  signIn,
  signOut,
  signUp,
  totpEnrollBegin,
  totpEnrollComplete,
} from './workosAuth';

const http = httpRouter();

// ── WorkOS Authentication ──────────────────────────────────────────────────
http.route({ path: '/auth/sign-in',              method: 'POST', handler: signIn });
http.route({ path: '/auth/sign-up',              method: 'POST', handler: signUp });
http.route({ path: '/auth/phone/sign-in',        method: 'POST', handler: phoneSignIn });
http.route({ path: '/auth/phone/sign-up',        method: 'POST', handler: phoneSignUp });
http.route({ path: '/auth/sign-out',             method: 'POST', handler: signOut });
http.route({ path: '/auth/refresh',              method: 'POST', handler: refreshToken });
http.route({ path: '/auth/mfa/verify',           method: 'POST', handler: mfaVerify });
http.route({ path: '/auth/mfa/enroll/totp',      method: 'POST', handler: totpEnrollBegin });
http.route({ path: '/auth/mfa/complete/totp',    method: 'POST', handler: totpEnrollComplete });

export default http;
