# 3rEco Convex Rewrite

This directory contains the complete rewrite of the 3rEco application using modern technologies:

## Stack

### Frontend
- **React 18** - UI library
- **TanStack Router** - Type-safe routing
- **shadcn/ui** - High-quality, unstyled components
- **Base UI** - Composable components library
- **Tailwind CSS** - Utility-first CSS framework
- **Vite** - Lightning-fast build tool

### Backend
- **Convex** - Real-time backend-as-a-service
- **Convex Auth** - Built-in authentication
- **TypeScript** - Type safety

## Project Structure

```
rewrite/
├── frontend/
│   ├── src/
│   │   ├── components/    # shadcn/ui based components
│   │   ├── pages/         # Page components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── lib/           # Utility functions
│   │   ├── types/         # TypeScript types
│   │   └── App.tsx
│   ├── package.json
│   └── vite.config.ts
└── convex/
    ├── functions/         # Convex action/query functions
    ├── schema.ts         # Database schema
    └── package.json
```

## Getting Started

### Prerequisites
- Node.js 18+
- npm or pnpm

### Installation

1. Install dependencies:
```bash
# Frontend
cd rewrite/frontend
npm install

# Convex backend
cd ../convex
npm install
```

2. Set up environment variables:
```bash
# rewrite/frontend/.env.local
VITE_CONVEX_URL=your_convex_url_here
```

3. Start development:
```bash
# Terminal 1: Convex backend
cd convex
npm run dev

# Terminal 2: Frontend
cd frontend
npm run dev
```

## Features Being Migrated

### Authentication
- User registration/login with Convex Auth
- Password reset functionality
- JWT token management
- Session handling

### User Management
- User profiles
- User types (Admin, Regular user)
- Profile completion status

### Materials Management
- Material CRUD operations
- Stock tracking
- Transaction history

### Dashboard
- Real-time data updates
- User statistics
- Material overview
- Transaction summaries

### Admin Features
- User management
- Material management
- Transaction oversight
- System statistics

### Messaging (Inbox)
- Real-time messaging
- Message history
- Notification system

### Stock Management
- Stock levels tracking
- Stock adjustments
- Stock history

## Migration Guide

See [MIGRATION.md](./MIGRATION.md) for detailed migration guides and examples.

## Key Improvements

1. **Type Safety**: Full end-to-end TypeScript
2. **Real-time**: Convex subscriptions replace Socket.io
3. **Authentication**: Simplified with Convex Auth
4. **Performance**: Optimized queries and reduced network calls
5. **Developer Experience**: Improved API and better tooling
6. **Modern UI**: shadcn/ui provides polished, accessible components

## Development Notes

- Convex handles all backend concerns (database, auth, real-time sync)
- No need to manage servers, databases, or authentication middleware
- All data is automatically synchronized across clients in real-time
- Type safety is enforced from frontend to backend

## Next Steps

1. Set up Convex project at https://dashboard.convex.dev
2. Copy your Convex deployment URL to environment variables
3. Begin migrating database schema to Convex format
4. Migrate API endpoints to Convex functions
5. Update frontend components to use Convex hooks
