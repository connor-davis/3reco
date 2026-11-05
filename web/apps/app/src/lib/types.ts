export type Role = 'admin' | 'staff' | 'business' | 'collector' | 'signed-out';

export type PageState = 'ready' | 'loading' | 'empty' | 'error';

export type RequestStatus =
  | 'Requested'
  | 'Offer sent'
  | 'Counter'
  | 'Accepted'
  | 'Invoiced'
  | 'Completed'
  | 'Rejected'
  | 'Cancelled';

export type TxType = 'B2B' | 'C2B';
export type TxStatus = 'Paid' | 'Pending' | 'Completed';

export type Store = {
  id: string;
  name: string;
  suburb: string;
  city: string;
  province: string;
  verified: boolean;
  rating: number;
  reviewCount: number;
  memberSince: string;
  online: boolean;
  phone: string;
  contact: string;
  hours: string;
  // Position on the mock map, as a percentage of its width and height.
  coords: { x: number; y: number };
};

export type Material = {
  id: string;
  name: string;
  gwCode: string;
  category: 'Plastic' | 'Paper' | 'Metal' | 'Glass';
  tag: string;
  carbonFactor: string;
  referencePrice: string;
};

export type PriceBreak = { fromKg: string; pricePerKg: string };

export type Listing = {
  id: string;
  storeId: string;
  materialId: string;
  title: string;
  availableKg: string;
  minKg: string;
  listed: boolean;
  priceBreaks: PriceBreak[];
};

export type RequestLine = {
  materialId: string;
  kg: string;
  pricePerKg: string;
};

export type MarketRequest = {
  id: string;
  buyerId: string;
  sellerId: string;
  status: RequestStatus;
  createdAt: string;
  items: RequestLine[];
  collection: { area: string; window: string };
  offerPending: boolean;
  unread: number;
  preview: string;
  lastAt: string;
};

export type ChatMessage = {
  id: string;
  requestId: string;
  from: 'me' | 'them' | 'system';
  text: string;
  sentAt: string;
};

export type Transaction = {
  id: string;
  type: TxType;
  requestId?: string;
  seller: string;
  buyer: string;
  // Collector buys point at the collector by id, so renaming never breaks the link.
  collectorId?: string;
  materialId: string;
  kg: string;
  pricePerKg: string;
  status: TxStatus;
  date: string;
  receipts: number;
  invoiceNo?: string;
};

export type BankPayout = {
  method: 'bank';
  bank: string;
  accountType: string;
  accountNumber: string;
  branchCode: string;
};

export type WalletPayout = {
  method: 'ewallet';
  walletProvider: string;
  walletPhone: string;
};

export type Collector = {
  id: string;
  name: string;
  phone: string;
  email: string;
  street: string;
  city: string;
  postal: string;
  province: string;
  payout: BankPayout | WalletPayout;
};

export type UserRecord = {
  id: string;
  name: string;
  email: string;
  role: Exclude<Role, 'signed-out'>;
  profile: 'Complete' | 'Incomplete';
  // The day they signed up, as YYYY-MM-DD.
  joined: string;
};

export type Notice = {
  id: number;
  title: string;
  text: string;
  time: string;
  unread: boolean;
  to: string;
  // Who the notice is for. Its link must be a page those roles can open.
  roles: Role[];
};

export type Review = {
  id: string;
  storeId: string;
  reviewer: string;
  rating: number;
  comment: string;
  date: string;
  mine: boolean;
};

export type ProfileRole = Exclude<Role, 'signed-out'>;

/** Everything a person fills in on their profile, in one flat record. */
export type Profile = {
  firstName: string;
  lastName: string;
  idNumber: string;
  phone: string;
  businessName: string;
  registration: string;
  payoutMethod: 'bank' | 'ewallet';
  holder: string;
  bank: string;
  accountType: string;
  accountNumber: string;
  branchCode: string;
  walletProvider: string;
  walletPhone: string;
  street: string;
  city: string;
  postal: string;
  province: string;
};

export type CartLine = { listingId: string; kg: string };
