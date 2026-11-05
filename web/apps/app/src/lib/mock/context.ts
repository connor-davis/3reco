import { createContext } from 'react';
import {
  seedCollectors,
  seedNotices,
  seedProfiles,
  seedReviews,
  seedSessions,
  seedUsers,
} from '@/lib/data/people';
import { seedStock, seedListings } from '@/lib/data/listings';
import { seedMessages, seedRequests } from '@/lib/data/requests';
import { seedTransactions } from '@/lib/data/ledger';
import { materials } from '@/lib/data/materials';
import type {
  CartLine,
  ChatMessage,
  Collector,
  Listing,
  MarketRequest,
  Material,
  Notice,
  PageState,
  Profile,
  ProfileRole,
  Review,
  Role,
  Transaction,
  UserRecord,
} from '@/lib/types';

export type Session = (typeof seedSessions)[number];

/** Every list the mock app can change. All of it lives in memory. */
export type MockData = {
  materials: Material[];
  listings: Listing[];
  stock: Listing[];
  collectors: Collector[];
  users: UserRecord[];
  transactions: Transaction[];
  requests: MarketRequest[];
  messages: ChatMessage[];
  notices: Notice[];
  reviews: Review[];
  sessions: Session[];
  profiles: Record<ProfileRole, Profile>;
};

export const seedData: MockData = {
  materials,
  listings: seedListings,
  stock: seedStock,
  collectors: seedCollectors,
  users: seedUsers,
  transactions: seedTransactions,
  requests: seedRequests,
  messages: seedMessages,
  notices: seedNotices,
  reviews: seedReviews,
  sessions: seedSessions,
  profiles: seedProfiles,
};

export type MockContextValue = {
  role: Role;
  setRole: (role: Role) => void;
  pageState: PageState;
  setPageState: (state: PageState) => void;
  cart: CartLine[];
  setCart: (cart: CartLine[]) => void;
  data: MockData;
  setData: (update: (data: MockData) => MockData) => void;
  // Set when a deal closes, so the impact dialog can celebrate it.
  celebrate: { kg: number; co2: number } | null;
  setCelebrate: (value: { kg: number; co2: number } | null) => void;
};

export const MockContext = createContext<MockContextValue | null>(null);
