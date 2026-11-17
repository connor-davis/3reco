// The demo site's one-click sign-ins. The password is public on purpose: the
// demo holds made-up data and resets every night. internal/services/demo/data.go
// holds the same values, and a Go test keeps the two in step.
export const demoPassword = 'Demo-Passw0rd!';

export const demoLogins = [
  { role: 'Buyer', email: 'buyer@demo.test', note: 'A business that buys' },
  {
    role: 'Seller',
    email: 'seller@demo.test',
    note: 'A business with listed stock',
  },
  {
    role: 'Collector',
    email: 'collector@demo.test',
    note: 'A waste collector',
  },
] as const;
