import type { Store } from '@/lib/types';

// The signed-in business in the mock is Ubuntu Recycling (Lerato Molefe).
export const myStoreId = 'ubuntu-recycling';

export const stores: Store[] = [
  {
    id: 'jozi-circular',
    name: 'Jozi Circular',
    suburb: 'Wynberg',
    city: 'Johannesburg',
    province: 'Gauteng',
    verified: true,
    rating: 4.9,
    reviewCount: 28,
    memberSince: 'February 2024',
    online: true,
    phone: '011 482 7030',
    contact: 'Bongani Dlamini',
    hours: 'Mon–Fri 08:00–16:30 SAST',
    coords: { x: 64, y: 34 },
  },
  {
    id: 'cape-paper',
    name: 'Cape Paper Co.',
    suburb: 'Montague Gardens',
    city: 'Cape Town',
    province: 'Western Cape',
    verified: true,
    rating: 4.7,
    reviewCount: 19,
    memberSince: 'May 2024',
    online: false,
    phone: '021 555 0142',
    contact: 'Zanele Petersen',
    hours: 'Mon–Fri 07:30–16:00 SAST',
    coords: { x: 20, y: 82 },
  },
  {
    id: 'green-loop',
    name: 'Green Loop SA',
    suburb: 'Durban North',
    city: 'Durban',
    province: 'KwaZulu-Natal',
    verified: true,
    rating: 4.6,
    reviewCount: 12,
    memberSince: 'August 2024',
    online: true,
    phone: '031 555 0143',
    contact: 'Sipho Naidoo',
    hours: 'Mon–Sat 08:00–15:00 SAST',
    coords: { x: 80, y: 64 },
  },
  {
    id: 'east-rand',
    name: 'East Rand Metals',
    suburb: 'Benoni',
    city: 'Pretoria',
    province: 'Gauteng',
    verified: false,
    rating: 4.2,
    reviewCount: 6,
    memberSince: 'January 2025',
    online: false,
    phone: '012 555 0144',
    contact: 'Pieter van Wyk',
    hours: 'Mon–Fri 08:00–17:00 SAST',
    coords: { x: 74, y: 15 },
  },
  {
    id: 'ubuntu-recycling',
    name: 'Ubuntu Recycling',
    suburb: 'Alexandra',
    city: 'Johannesburg',
    province: 'Gauteng',
    verified: true,
    rating: 4.8,
    reviewCount: 41,
    memberSince: 'November 2023',
    online: true,
    phone: '011 555 0145',
    contact: 'Lerato Molefe',
    hours: 'Mon–Fri 08:00–16:30 SAST',
    coords: { x: 40, y: 46 },
  },
];

export const cities = ['Johannesburg', 'Cape Town', 'Durban', 'Pretoria'];

export function storeById(id: string): Store {
  return stores.find((store) => store.id === id) ?? stores[0];
}
