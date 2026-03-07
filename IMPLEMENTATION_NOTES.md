# Setup Instructions After Implementation

## Important: Generate Convex Types

After pulling this branch, you MUST run the following command to generate Convex API types:

```bash
convex dev
```

This will:
1. Connect to your Convex deployment
2. Generate TypeScript types for all Convex functions including the new MFA endpoints
3. Update the `convex/_generated/api.ts` file

Without running this command, the TypeScript compiler will show errors for `api.mfa.*` references.

## New Features Implemented

### 1. MFA (Multi-Factor Authentication) with TOTP
- User schema updated with MFA fields
- TOTP setup and verification endpoints in `convex/mfa.ts`
- MFA suggestion dialog shows once after profile completion
- MFA management section in profile page
- Skip MFA option with preference storage

### 2. Phone Number Authentication
- Users can now sign up and log in with phone number instead of email
- Phone number validation for South African format (+27 or 0...)
- Updated authentication guard UI with phone/email options

### 3. Responsive Drawer
- PageHeaderDrawer now adapts to screen size
- Bottom drawer on mobile (< 768px)
- Right drawer on desktop (>= 768px)

### 4. PWA Support
- Service worker for offline support (`public/sw.js`)
- Updated web manifest with app details
- Service worker registration in `main.tsx`
- App is now installable on mobile devices

### 5. Admin Features (Partial)
- `togglePasswordReset` mutation for admin/staff
- `createUser` mutation (placeholder - needs Convex Auth integration)
- Both require MFA to be enabled for the admin/staff user

### 6. Volume Statistics
- Dashboard already shows current system totals via `materialVolume`
- Displays current stock in the system per material

## Development Workflow

```bash
# Install dependencies
bun install

# Start Convex dev server (generates types)
convex dev

# In another terminal, start the frontend dev server
bun run dev

# Build for production
bun run build
```

## Notes

- The `createUser` mutation is a placeholder and needs proper integration with the Convex Auth system
- MFA uses TOTP (Time-based One-Time Passwords) via the `otpauth` library
- QR codes are generated using the `qrcode` library
- Phone authentication requires backend support in Convex Auth Password provider
