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
- **Phone-to-Email Conversion**: Phone numbers are converted to email format (`{normalized_phone}@3reco.co.za`) for Convex Auth compatibility
  - Example: `0821234567` → `27821234567@3reco.co.za`
  - Example: `+27821234567` → `27821234567@3reco.co.za`
- The actual phone number is stored in the user record for display and communication purposes
- This approach works with Convex Auth's Password provider without requiring custom auth handlers

### 3. Responsive Drawer
- PageHeaderDrawer now adapts to screen size
- Bottom drawer on mobile (< 768px)
- Right drawer on desktop (>= 768px)

### 4. PWA Support
- Service worker for offline support (`public/sw.js`)
- Updated web manifest with app details
- Service worker registration in `main.tsx`
- App is now installable on mobile devices

### 5. Admin Features
- `togglePasswordReset` mutation for admin/staff to require users to reset their password
- `createUser` mutation is a placeholder - **Convex Auth does not support programmatic user creation in mutations**
- Both mutations require MFA to be enabled for the admin/staff user
- **Recommended approach for user creation**: Implement an invitation system
  1. Admin creates an invitation record with desired user type
  2. Send invitation link/code to user
  3. User signs up using the invitation code
  4. Post-signup mutation checks invitation and sets user type/permissions
- For phone-based invitations, use the same phone-to-email conversion: `{phone}@3reco.co.za`

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

## Technical Details

### Phone Number Authentication Implementation

The phone authentication feature uses a **phone-to-email conversion approach** to work with Convex Auth's Password provider:

1. **Helper Function** (`phoneToEmail` in `authentication.tsx`):
   - Normalizes South African phone numbers to international format
   - Removes leading `0` and adds `27` prefix
   - Appends `@3reco.co.za` domain
   - Example: `0821234567` → `27821234567@3reco.co.za`

2. **Sign Up Flow**:
   - User enters phone number and password
   - Phone is converted to email format for Convex Auth
   - Original phone number is stored in `phone` field
   - User authenticates with converted email

3. **Sign In Flow**:
   - User enters phone number and password
   - Phone is converted to the same email format
   - Authentication happens with the converted email
   - User's actual phone number is preserved in their profile

4. **Why This Approach?**:
   - Convex Auth's Password provider requires an email
   - Phone numbers cannot be used directly as authentication identifiers
   - This conversion allows phone-based auth without custom auth handlers
   - The `@3reco.co.za` domain ensures no conflicts with real email addresses

### Convex Auth Limitations

- **User creation in mutations is not supported** - Auth operations must happen at the HTTP layer
- **signIn/signUp can only be called from the frontend** using `useAuthActions()` hook
- **Password hashing is handled internally** by the Password provider
- For admin user creation, implement an invitation system instead of direct creation

## Notes

- The `createUser` mutation documents the recommended invitation system approach
- MFA uses TOTP (Time-based One-Time Passwords) via the `otpauth` library
- QR codes are generated using the `qrcode` library
- Phone numbers are stored in the user record for display and SMS communication
