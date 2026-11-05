// Decimal values remain exact text throughout the client.
export type Decimal = string;
export type Role = 'admin' | 'staff' | 'business' | 'collector';
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
  profile_complete: boolean;
  agreed_to_terms: boolean;
}
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
  id: string;
  seller_id: string;
  seller_name: string;
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
export type CollectorInput = Partial<Omit<Collector, 'id' | 'created_at'>>;
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
  }[];
}
export interface Party {
  id: string;
  name: string;
}
export interface RequestItem {
  material_id: string;
  material_name: string;
  stock_id: string | null;
  offer_weight: Decimal | null;
  offer_price: Decimal | null;
  available_weight: Decimal | null;
}
export interface TradeRequest {
  id: string;
  seller: Party;
  buyer: Party;
  status: RequestStatus;
  items: RequestItem[];
  created_at: string;
  updated_at: string;
}
export interface RequestInput {
  seller_id: string;
  items: { material_id: string; stock_id: string }[];
}
export interface SaleItem {
  material_id: string;
  weight: Decimal;
  price: Decimal;
}
export interface Message {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
}
export interface Thread {
  request_id: string;
  status: RequestStatus;
  other: Party;
  latest_message: Message | null;
  unread_count: number;
  activity_at: string;
}
export interface Receipt {
  id: string;
  file_name: string;
  content_type: string;
  size: number;
  uploaded_at: string;
}
export interface Transaction {
  id: string;
  type: 'c2b' | 'b2b';
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
  counterparties: { id: string; name: string; count: number; value: Decimal }[];
  users?: { role: string; count: number }[];
  collector_linked?: boolean;
}
export interface PrivacyEvent {
  id: string;
  actor_id: string;
  subject_id: string | null;
  kind: string;
  created_at: string;
}
export interface Notice {
  version: string;
  accepted: boolean;
}
export interface Stats {
  total_kg: Decimal;
  co2_kg: Decimal;
  deals: number;
  top_stores: { id: string; name: string; kg: Decimal }[];
}
export interface PublicNotice {
  version: string;
  terms: string;
  privacy: string;
}
