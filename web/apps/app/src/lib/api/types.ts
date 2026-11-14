// Decimal values remain exact text throughout the client.
export type Decimal = string;
export type Role = 'guest' | 'admin' | 'staff' | 'business' | 'collector';
export type BusinessRole = 'owner' | 'manager' | 'member';
export type RequestStatus =
  'pending' | 'offered' | 'accepted' | 'rejected' | 'cancelled';
export interface Ok {
  ok: true;
}
export interface Created {
  id: string;
}
export interface AuthUser {
  id: string;
  active_business_id: string;
  business_role: BusinessRole | '';
  email: string | null;
  emailVerified: boolean;
  name: string;
  image: string | null;
  role: Role | null;
  profileComplete: boolean;
  agreedToTerms: boolean;
  firstName: string | null;
  lastName: string | null;
  businessName: string | null;
  business_verified: boolean;
}
export interface Session {
  id: string;
  userId: string;
  name: string;
  email: string | null;
  role: Role | null;
  current: boolean;
  createdAt: string;
}
export interface Profile {
  id: string;
  email: string;
  role: Role | '';
  name: string;
  image: string;
  avatar_url: string;
  phone: string;
  first_name: string;
  last_name: string;
  id_number: string;
  bank_account_holder_name: string;
  bank_name: string;
  bank_account_number: string;
  bank_branch_code: string;
  bank_account_type: string;
  street_address: string;
  city: string;
  province: string;
  area_code: number | null;
  profile_complete: boolean;
  agreed_to_terms: boolean;
}
/** Business name, bank and location. Returned by `/business`. */
export interface BusinessProfile {
  id: string;
  business_name: string;
  business_registration_number: string;
  bank_account_holder_name: string;
  bank_name: string;
  bank_account_number: string;
  bank_branch_code: string;
  bank_account_type: string;
  street_address: string;
  city: string;
  province: string;
  area_code: number | null;
  avatar_url: string;
  can_edit: boolean;
}
export type BusinessInput = Partial<
  Omit<BusinessProfile, 'id' | 'avatar_url' | 'can_edit'>
>;
export type ProfileInput = Partial<
  Omit<Profile, 'id' | 'email' | 'role' | 'avatar_url'>
>;
export interface PublicUser {
  id: string;
  name: string;
  image: string;
  avatar_url: string;
  business_name: string;
  role: Role | '';
  created_at: string;
}
export interface Store {
  id: string;
  name: string;
  business_verified: boolean;
  image: string;
  avatar_url: string;
  city: string;
  province: string;
  item_count: number;
  material_names: string[];
  average_rating: number | null;
  review_count: number;
  created_at: string;
}
export interface StockItem {
  image_url: string;
  id: string;
  owner_id: string;
  material_id: string;
  material_name: string;
  weight: Decimal;
  available_weight: Decimal;
  price: Decimal;
  base_price: Decimal;
  is_listed: boolean;
  created_at: string;
}
export interface StockInput {
  material_id: string;
  weight: Decimal;
  price: Decimal;
  is_listed: boolean;
}
export type StockPatch = Partial<Omit<StockInput, 'material_id'>>;
export interface Listing {
  image_url: string;
  seller_avatar_url: string;
  id: string;
  seller_id: string;
  seller_name: string;
  seller_verified: boolean;
  material_id: string;
  material_name: string;
  carbon_factor: Decimal;
  gw_code: string;
  weight: Decimal;
  price: Decimal;
  average_rating: number | null;
  review_count: number;
  created_at: string;
}
export interface CartItem {
  stock_id: string;
  material_id: string;
  material_name?: string;
  weight?: Decimal;
  price?: Decimal;
  // When this line's 48-hour stock hold ends (an ISO time); set by the server.
  reserved_until?: string;
}
export interface Cart {
  items: CartItem[];
}
export interface CartInput {
  items: { stock_id: string; material_id: string; weight: Decimal }[];
}
export interface Material {
  id: string;
  name: string;
  carbon_factor: Decimal;
  gw_code: string;
  price: Decimal;
  created_at: string;
}
export type MaterialInput = Omit<Material, 'id' | 'created_at'>;
export interface Collector {
  id: string;
  can_edit: boolean;
  can_view_payout: boolean;
  can_edit_payout: boolean;
  name: string;
  email?: string;
  phone?: string;
  image: string;
  bank_account_holder_name?: string;
  bank_name?: string;
  bank_account_number?: string;
  bank_branch_code?: string;
  bank_account_type?: string;
  payout_method?: string;
  ewallet_platform_name?: string;
  ewallet_payment_id?: string;
  street_address?: string;
  city: string;
  province: string;
  area_code?: number | null;
  created_at: string;
}
export type CollectorInput = Partial<
  Omit<
    Collector,
    'id' | 'created_at' | 'can_edit' | 'can_view_payout' | 'can_edit_payout'
  >
>;
export interface CollectorStats {
  collector: Collector;
  totals: {
    total_revenue: Decimal;
    total_volume: Decimal;
    transaction_count: number;
  };
  carbon_savings: Decimal;
  latest_transactions: {
    id: string;
    type: string;
    created_at: string;
    collection_day: string | null;
    collection_date: string | null;
    material_name: string;
    weight: Decimal;
    price: Decimal;
    buyer_name: string;
    buyer_verified: boolean;
  }[];
}
export interface Party {
  id: string;
  name: string;
  // True for a business 3REco has verified.
  business_verified: boolean;
}
export interface RequestItem {
  material_id: string;
  material_name: string;
  stock_id: string | null;
  requested_weight: Decimal | null;
  requested_price: Decimal | null;
  offer_weight: Decimal | null;
  offer_price: Decimal | null;
  available_weight: Decimal | null;
}
export interface TradeRequest {
  id: string;
  seller: Party;
  buyer: Party;
  status: RequestStatus;
  offer_by: string | null;
  offer_version: number;
  buyer_confirmed_version: number | null;
  seller_confirmed_version: number | null;
  items: RequestItem[];
  created_at: string;
  updated_at: string;
}
export interface RequestInput {
  from_cart?: boolean;
  seller_id: string;
  items: { material_id: string; stock_id: string; weight: Decimal }[];
}
export interface SaleItem {
  material_id: string;
  weight: Decimal;
  price: Decimal;
}
export interface Message {
  system: boolean;
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
}
export interface Thread {
  buyer: Party;
  seller: Party;
  offer_by: string | null;
  offer_version: number;
  buyer_confirmed_version: number | null;
  seller_confirmed_version: number | null;

  request_id: string;
  status: RequestStatus;
  other: Party;
  latest_message: Message | null;
  unread_count: number;
  activity_at: string;
}
export interface AdminThread {
  buyer: Party;
  seller: Party;
  offer_by: string | null;
  offer_version: number;
  buyer_confirmed_version: number | null;
  seller_confirmed_version: number | null;
  request_id: string;
  status: RequestStatus;
  latest_message: Message | null;
  activity_at: string;
}
export interface Receipt {
  id: string;
  uploaded_by?: string | null;
  file_name: string;
  content_type: string;
  size: number;
  uploaded_at: string;
}
/** Totals over a whole filtered transaction list. Weight is kg; value is rand. */
export interface TransactionTotals {
  count: number;
  weight: string;
  value: string;
}
export interface Transaction {
  can_remove_receipts: boolean;
  status: 'pending' | 'complete' | 'cancelled';
  request_id: string | null;
  id: string;
  type: 'c2b' | 'b2b';
  // Live state of the business that decides the trade: false shows "Unverified".
  business_verified: boolean;
  seller: Party;
  buyer: Party;
  total_price: Decimal;
  collection_day: string | null;
  collection_date: string | null;
  effective_at: string;
  created_at: string;
  invoice_number: string;
  items: (SaleItem & { material_name: string })[];
  receipts: Receipt[];
}
export interface SaleInput {
  business_id: string;
  items: SaleItem[];
}
export interface CollectionInput {
  collector_id: string;
  business_id?: string;
  items: SaleItem[];
  collection_day?: string;
}
export interface TransactionCreated {
  transaction_id: string;
}
export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  created_at: string;
}
export interface Review {
  id: string;
  rating: number;
  comment: string | null;
  reviewer_name: string;
  materials: string;
  created_at: string;
}
export interface ReviewSummary {
  average: number | null;
  count: number;
}
export interface Reviewable {
  transaction_id: string;
  total_price: Decimal;
  created_at: string;
}
export interface AdminUser {
  id: string;
  name: string;
  email: string | null;
  role: Role | null;
  profile_complete: boolean;
  created_at: string;
  business_verified: boolean;
  business_verified_at: string | null;
}
export interface DashboardTotals {
  count: number;
  value: Decimal;
  weight: Decimal;
  carbon_savings: Decimal;
}
export interface Dashboard {
  from: string;
  to: string;
  totals: DashboardTotals;
  series: (DashboardTotals & { day: string })[];
  counterparties: {
    id: string;
    name: string;
    business_verified: boolean;
    count: number;
    value: Decimal;
  }[];
  users?: { role: string; count: number }[];
  by_type?: { type: 'c2b' | 'b2b'; count: number; weight: Decimal }[];
  collector_linked?: boolean;
}
/** One line of the admin activity feed. Values are masked by the server. */
export interface ActivityLine {
  source: 'audit' | 'privacy';
  id: string;
  at: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  table: string;
  action: string;
  row_key: Record<string, unknown>;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  subject_name: string | null;
}

export interface PrivacyEvent {
  details: {
    export_kind?: string;
    filters?: Record<string, string>;
    invoice_number?: string;
  };
  id: string;
  actor_id: string;
  subject_id: string | null;
  kind: string;
  created_at: string;
  actor_name: string | null;
  actor_role: string | null;
  subject_name: string | null;
  subject_role: string | null;
}
export interface Notice {
  version: string;
  accepted: boolean;
}
export interface Stats {
  total_kg: Decimal;
  co2_kg: Decimal;
  deals: number;
  top_stores: {
    id: string;
    name: string;
    business_verified: boolean;
    kg: Decimal;
  }[];
}
export interface PublicNotice {
  version: string;
  terms: string;
  privacy: string;
}
