import type {
  Collector,
  Notice,
  Profile,
  ProfileRole,
  Review,
  UserRecord,
} from '@/lib/types';

export const provinces = [
  'Gauteng',
  'Western Cape',
  'KwaZulu-Natal',
  'Eastern Cape',
  'Free State',
  'Limpopo',
  'Mpumalanga',
  'North West',
  'Northern Cape',
];

export const banks = [
  'FNB',
  'Capitec',
  'Standard Bank',
  'ABSA',
  'Nedbank',
  'African Bank',
];

export const walletProviders = [
  'FNB eWallet',
  'Standard Bank Instant Money',
  'ABSA CashSend',
];

// Fake numbers only. None of these are real accounts or phone lines.
export const seedCollectors: Collector[] = [
  {
    id: 'thandi-nkosi',
    name: 'Thandi Nkosi',
    phone: '082 555 0148',
    email: 'thandi.nkosi@example.co.za',
    street: '12 Main Road',
    city: 'Alexandra',
    postal: '2090',
    province: 'Gauteng',
    payout: {
      method: 'ewallet',
      walletProvider: 'FNB eWallet',
      walletPhone: '082 555 0148',
    },
  },
  {
    id: 'sipho-mahlangu',
    name: 'Sipho Mahlangu',
    phone: '083 555 0192',
    email: 'sipho.m@example.co.za',
    street: '4 Vilakazi Street',
    city: 'Soweto',
    postal: '1804',
    province: 'Gauteng',
    payout: {
      method: 'bank',
      bank: 'Capitec',
      accountType: 'Savings',
      accountNumber: '1234567890',
      branchCode: '470010',
    },
  },
  {
    id: 'naledi-khumalo',
    name: 'Naledi Khumalo',
    phone: '071 555 0117',
    email: 'naledi.k@example.co.za',
    street: '88 Beach Road',
    city: 'Durban North',
    postal: '4051',
    province: 'KwaZulu-Natal',
    payout: {
      method: 'bank',
      bank: 'FNB',
      accountType: 'Cheque',
      accountNumber: '1029384756',
      branchCode: '250655',
    },
  },
  {
    id: 'ruan-botha',
    name: 'Ruan Botha',
    phone: '084 555 0166',
    email: 'ruan.b@example.co.za',
    street: '21 Voortrekker Road',
    city: 'Bellville',
    postal: '7530',
    province: 'Western Cape',
    payout: {
      method: 'ewallet',
      walletProvider: 'ABSA CashSend',
      walletPhone: '084 555 0166',
    },
  },
];

export const seedUsers: UserRecord[] = [
  {
    id: 'u-1',
    name: 'Lerato Molefe',
    email: 'lerato@ubunturecycling.co.za',
    role: 'business',
    profile: 'Complete',
    joined: '2026-03-12',
  },
  {
    id: 'u-2',
    name: 'Thandi Nkosi',
    email: 'thandi.nkosi@example.co.za',
    role: 'collector',
    profile: 'Complete',
    joined: '2026-04-02',
  },
  {
    id: 'u-3',
    name: 'Bongani Dlamini',
    email: 'bongani@jozicircular.co.za',
    role: 'business',
    profile: 'Complete',
    joined: '2026-05-19',
  },
  {
    id: 'u-4',
    name: 'Zanele Petersen',
    email: 'zanele@capepaper.co.za',
    role: 'business',
    profile: 'Incomplete',
    joined: '2026-08-07',
  },
  {
    id: 'u-5',
    name: 'Amina Jacobs',
    email: 'amina@3reco.co.za',
    role: 'staff',
    profile: 'Complete',
    joined: '2026-02-01',
  },
  {
    id: 'u-6',
    name: 'Connor Davis',
    email: 'connor@3reco.co.za',
    role: 'admin',
    profile: 'Complete',
    joined: '2026-01-15',
  },
  {
    id: 'u-7',
    name: 'Sipho Mahlangu',
    email: 'sipho.m@example.co.za',
    role: 'collector',
    profile: 'Incomplete',
    joined: '2026-09-23',
  },
];

export const seedNotices: Notice[] = [
  {
    id: 0,
    title: 'A new offer from Jozi Circular',
    text: 'Bongani offered R 4.60/kg for your clear PET request.',
    time: '2 min ago',
    unread: true,
    to: '/market/REQ-1080',
    roles: ['business'],
  },
  {
    id: 1,
    title: 'Invoice INV-2026-2048 is ready',
    text: 'Your purchase from Jozi Circular has an invoice.',
    time: '1 hour ago',
    unread: true,
    to: '/transactions/purchases',
    roles: ['business'],
  },
  {
    id: 2,
    title: 'Collection recorded',
    text: 'Thandi Nkosi: 64 kg of clear PET, R 307.20.',
    time: 'Yesterday',
    unread: false,
    to: '/collections',
    roles: ['admin', 'staff', 'business'],
  },
  {
    id: 3,
    title: 'You were paid',
    text: 'Ubuntu Recycling paid R 307.20 for 64 kg of clear PET.',
    time: '3 hours ago',
    unread: true,
    to: '/transactions/sales',
    roles: ['collector'],
  },
  {
    id: 4,
    title: 'A collector needs a profile check',
    text: 'Sipho Mahlangu has not finished their profile.',
    time: 'Today',
    unread: true,
    to: '/admin/users',
    roles: ['admin'],
  },
];

export const seedReviews: Review[] = [
  {
    id: 'rev-1',
    storeId: 'jozi-circular',
    reviewer: 'Lerato · Ubuntu Recycling',
    rating: 5,
    comment: 'Reliable quality and easy collection.',
    date: '2026-11-03',
    mine: true,
  },
  {
    id: 'rev-2',
    storeId: 'jozi-circular',
    reviewer: 'Zanele · Cape Paper Co.',
    rating: 5,
    comment: 'Clean bales, exactly as described.',
    date: '2026-10-21',
    mine: false,
  },
  {
    id: 'rev-3',
    storeId: 'jozi-circular',
    reviewer: 'Sipho · Green Loop SA',
    rating: 4,
    comment: 'Good prices. Replies are quick.',
    date: '2026-10-02',
    mine: false,
  },
];

export const seedSessions = [
  {
    id: 's-1',
    device: 'Chrome · Windows',
    city: 'Johannesburg',
    email: 'lerato@ubunturecycling.co.za',
  },
  {
    id: 's-2',
    device: 'Safari · iPhone',
    city: 'Johannesburg',
    email: 'thandi.nkosi@example.co.za',
  },
  {
    id: 's-3',
    device: 'Chrome · macOS',
    city: 'Johannesburg',
    email: 'connor@3reco.co.za',
  },
  {
    id: 's-4',
    device: 'Edge · Windows',
    city: 'Johannesburg',
    email: 'amina@3reco.co.za',
  },
  {
    id: 's-5',
    device: 'Safari · iPad',
    city: 'Midrand',
    email: 'lerato@ubunturecycling.co.za',
  },
];

/** Which role an account email signs in as (for "Accounts in this browser"). */
export function roleForEmail(email: string): ProfileRole | undefined {
  return (Object.keys(personEmails) as ProfileRole[]).find(
    (role) => personEmails[role] === email
  );
}

/** Sign-in emails by role. Names come from each person's profile. */
export const personEmails: Record<ProfileRole, string> = {
  admin: 'connor@3reco.co.za',
  staff: 'amina@3reco.co.za',
  business: 'lerato@ubunturecycling.co.za',
  collector: 'thandi.nkosi@example.co.za',
};

const blankProfile: Profile = {
  firstName: '',
  lastName: '',
  idNumber: '',
  phone: '',
  businessName: '',
  registration: '',
  payoutMethod: 'bank',
  holder: '',
  bank: '',
  accountType: '',
  accountNumber: '',
  branchCode: '',
  walletProvider: '',
  walletPhone: '',
  street: '',
  city: '',
  postal: '',
  province: '',
};

/** One profile per signed-in role. Saving a form writes back to this record. */
export const seedProfiles: Record<ProfileRole, Profile> = {
  admin: {
    ...blankProfile,
    firstName: 'Connor',
    lastName: 'Davis',
    idNumber: '8806125084083',
    phone: '010 555 0101',
    businessName: '3REco',
    registration: '2024/000111/07',
    holder: '3REco',
    bank: 'FNB',
    accountType: 'Business',
    accountNumber: '62000011122',
    branchCode: '250655',
    street: '1 Rissik Street',
    city: 'Johannesburg',
    postal: '2001',
    province: 'Gauteng',
  },
  staff: {
    ...blankProfile,
    firstName: 'Amina',
    lastName: 'Jacobs',
    idNumber: '9203040123086',
    phone: '010 555 0102',
    businessName: '3REco',
    registration: '2024/000111/07',
    holder: 'Amina Jacobs',
    bank: 'Capitec',
    accountType: 'Savings',
    accountNumber: '1500022233',
    branchCode: '470010',
    street: '1 Rissik Street',
    city: 'Johannesburg',
    postal: '2001',
    province: 'Gauteng',
  },
  business: {
    ...blankProfile,
    firstName: 'Lerato',
    lastName: 'Molefe',
    idNumber: '9001015800087',
    phone: '011 555 0145',
    businessName: 'Ubuntu Recycling',
    registration: '2019/123456/07',
    holder: 'Ubuntu Recycling',
    bank: 'FNB',
    accountType: 'Business',
    accountNumber: '62012345678',
    branchCode: '250655',
    street: '27 Roosevelt Street',
    city: 'Alexandra',
    postal: '2090',
    province: 'Gauteng',
  },
  collector: {
    ...blankProfile,
    firstName: 'Thandi',
    lastName: 'Nkosi',
    idNumber: '9505050123084',
    phone: '082 555 0148',
    payoutMethod: 'ewallet',
    walletProvider: 'FNB eWallet',
    walletPhone: '082 555 0148',
    street: '12 Main Road',
    city: 'Alexandra',
    postal: '2090',
    province: 'Gauteng',
  },
};
