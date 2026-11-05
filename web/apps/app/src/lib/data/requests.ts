import type { ChatMessage, MarketRequest } from '@/lib/types';

// Each request is one conversation between Ubuntu Recycling (the buyer in
// the mock) and a store.
export const seedRequests: MarketRequest[] = [
  {
    id: 'REQ-1080',
    buyerId: 'ubuntu-recycling',
    sellerId: 'jozi-circular',
    status: 'Counter',
    createdAt: '2026-11-05T10:38:00+02:00',
    items: [
      { materialId: 'pet-clear', kg: '500', pricePerKg: '4.60' },
      { materialId: 'hdpe-natural', kg: '100', pricePerKg: '7.20' },
    ],
    collection: {
      area: 'Wynberg',
      window: 'Tomorrow, 6 November · 09:00–12:00 SAST',
    },
    offerPending: true,
    unread: 2,
    preview: 'I can do R 4.60/kg if you collect tomorrow.',
    lastAt: '10:42',
  },
  {
    id: 'REQ-1081',
    buyerId: 'ubuntu-recycling',
    sellerId: 'cape-paper',
    status: 'Accepted',
    createdAt: '2026-11-04T14:10:00+02:00',
    items: [{ materialId: 'cardboard', kg: '1000', pricePerKg: '1.65' }],
    collection: {
      area: 'Montague Gardens',
      window: 'Friday, 7 November · 08:00–11:00 SAST',
    },
    offerPending: false,
    unread: 1,
    preview: 'All agreed. See you tomorrow!',
    lastAt: 'Yesterday',
  },
  {
    id: 'REQ-1082',
    buyerId: 'ubuntu-recycling',
    sellerId: 'green-loop',
    status: 'Requested',
    createdAt: '2026-11-03T09:00:00+02:00',
    items: [{ materialId: 'aluminium', kg: '200', pricePerKg: '18.50' }],
    collection: {
      area: 'Durban North',
      window: 'Monday, 10 November · 09:00–12:00 SAST',
    },
    offerPending: false,
    unread: 0,
    preview: 'Is your transport arranged?',
    lastAt: 'Mon',
  },
  {
    id: 'REQ-1083',
    buyerId: 'ubuntu-recycling',
    sellerId: 'east-rand',
    status: 'Completed',
    createdAt: '2026-10-29T08:30:00+02:00',
    items: [{ materialId: 'steel', kg: '2000', pricePerKg: '3.40' }],
    collection: {
      area: 'Benoni',
      window: 'Wednesday, 29 October · 10:00–13:00 SAST',
    },
    offerPending: false,
    unread: 0,
    preview: 'Thanks for a smooth collection.',
    lastAt: '29 Oct',
  },
  {
    id: 'REQ-1090',
    buyerId: 'cape-paper',
    sellerId: 'ubuntu-recycling',
    status: 'Offer sent',
    createdAt: '2026-11-05T08:15:00+02:00',
    items: [{ materialId: 'cardboard', kg: '1500', pricePerKg: '1.70' }],
    collection: {
      area: 'Alexandra',
      window: 'Thursday, 6 November · 13:00–16:00 SAST',
    },
    offerPending: true,
    unread: 1,
    preview: 'Can you do R 1.60/kg for 1 500 kg?',
    lastAt: '08:20',
  },
  {
    id: 'REQ-1091',
    buyerId: 'green-loop',
    sellerId: 'ubuntu-recycling',
    status: 'Accepted',
    createdAt: '2026-11-02T11:00:00+02:00',
    items: [{ materialId: 'steel', kg: '600', pricePerKg: '3.50' }],
    collection: {
      area: 'Alexandra',
      window: 'Tuesday, 4 November · 09:00–12:00 SAST',
    },
    offerPending: false,
    unread: 0,
    preview: 'Invoice sent. Thank you!',
    lastAt: 'Tue',
  },
  {
    id: 'REQ-1092',
    buyerId: 'jozi-circular',
    sellerId: 'ubuntu-recycling',
    status: 'Completed',
    createdAt: '2026-10-25T09:00:00+02:00',
    items: [{ materialId: 'pet-clear', kg: '800', pricePerKg: '4.80' }],
    collection: {
      area: 'Alexandra',
      window: 'Saturday, 25 October · 09:00–12:00 SAST',
    },
    offerPending: false,
    unread: 0,
    preview: 'Collected. All good.',
    lastAt: '25 Oct',
  },
];

function chat(
  requestId: string,
  rows: [ChatMessage['from'], string, string][]
): ChatMessage[] {
  return rows.map(([from, text, time], index) => ({
    id: `${requestId}-m${index}`,
    requestId,
    from,
    text,
    sentAt: `2026-11-05T${time}:00+02:00`,
  }));
}

export const seedMessages: ChatMessage[] = [
  ...chat('REQ-1080', [
    ['them', 'Hi Lerato! The PET and HDPE are ready for collection.', '10:38'],
    ['me', 'Great. Can you do a better rate on 500 kg of PET?', '10:40'],
    ['system', 'Jozi Circular sent a counter offer: R 3 020.00', '10:42'],
    ['them', 'I can do R 4.60/kg if you collect tomorrow.', '10:42'],
  ]),
  ...chat('REQ-1081', [
    ['me', 'Hello, is the cardboard still available?', '09:12'],
    ['them', 'Yes, 1 000 kg baled and ready.', '09:20'],
    ['system', 'You accepted the offer: R 1 650.00', '09:31'],
    ['them', 'All agreed. See you tomorrow!', '09:35'],
  ]),
  ...chat('REQ-1082', [
    ['me', 'Hi, I would like 200 kg of aluminium cans.', '08:50'],
    ['them', 'Is your transport arranged?', '09:05'],
  ]),
  ...chat('REQ-1083', [
    ['me', 'Collection done, thank you.', '10:20'],
    ['them', 'Thanks for a smooth collection.', '10:25'],
  ]),
  ...chat('REQ-1090', [
    ['them', 'Hello! Can you do R 1.60/kg for 1 500 kg?', '08:15'],
    ['them', 'We can collect on Thursday afternoon.', '08:20'],
  ]),
  ...chat('REQ-1091', [
    ['them', 'We would like 600 kg of scrap steel.', '11:00'],
    ['me', 'Agreed at R 3.50/kg. Invoice sent.', '11:10'],
    ['them', 'Invoice sent. Thank you!', '11:20'],
  ]),
  ...chat('REQ-1092', [
    ['them', 'We are collecting 800 kg of PET today.', '09:00'],
    ['me', 'Collected. All good.', '12:10'],
  ]),
];

export const quickReplies = [
  'Is transport included?',
  'Can I collect tomorrow?',
  'Thanks, sounds good!',
];

/** Deal steps shown in the stepper under the chat head (design 04). */
export const dealSteps = [
  'Request',
  'Offer',
  'Counter',
  'Accepted',
  'Invoiced',
] as const;

/** Which step each status sits on. Closed requests stay on step 0. */
export const stepOf: Record<MarketRequest['status'], number> = {
  Requested: 0,
  'Offer sent': 1,
  Counter: 2,
  Accepted: 3,
  Invoiced: 4,
  Completed: 4,
  Rejected: 0,
  Cancelled: 0,
};
