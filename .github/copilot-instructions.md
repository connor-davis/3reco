# 3rEco Copilot Instructions

## Architecture

This is a transitional monorepo with three independent packages — no shared workspace tooling:

- **`/3reco`** — Modern React 19 + TypeScript frontend backed by **Convex** (the active direction)
- **`/app`** — Legacy SolidJS frontend (JavaScript, pnpm)
- **`/api`** — Legacy Express.js REST/Socket.IO backend with MongoDB (JavaScript, pnpm)

The `/3reco` package is a full-stack app where Convex acts as the backend-as-a-service, replacing the Express API. The `/api` and `/app` packages are legacy and remain for parallel operation.

## Commands

### `/3reco` (Bun + Vite + TypeScript)
```sh
bun run dev       # start dev server
bun run build     # tsc -b && vite build
bun run lint      # eslint .
bun run preview   # preview production build
```

### `/api` (Node.js + pnpm)
```sh
pnpm start        # node index.js
pnpm start:dev    # nodemon index.js (hot reload)
pnpm build:css    # compile Tailwind CSS
```

### `/app` (SolidJS + pnpm)
```sh
pnpm dev          # vite dev server
pnpm build        # vite build
pnpm serve        # vite preview
```

No test runner is configured in any package.

## Environment Setup

**`/api` requires a `.env` file:**
```
ROOT_PASSWORD=YourPassword
DEV_MODE=true
HTTP_PORT=80
HTTP_SECURE_PORT=443
```
An admin user is auto-created on first run using `ROOT_PASSWORD`. MongoDB connects to `mongodb://127.0.0.1:27017/threereco`.

**`/3reco` requires a `.env.local` file (Vite convention):**
```
VITE_CONVEX_URL=<your-convex-deployment-url>
```

## `/3reco` Conventions

- **Package manager:** Bun (use `bun add`, not `npm install` or `pnpm add`)
- **Routing:** TanStack Router with file-based routing under `src/routes/`; routes are auto-generated — do not manually edit `routeTree.gen.ts`
- **Data fetching:** Convex queries/mutations via `@convex-dev/react-query`. Use `useQuery`/`useMutation` from `@tanstack/react-query` with the Convex adapter
- **Backend logic:** Lives in `convex/` directory. Schema is defined in `convex/schema.ts`. Auth is configured in `convex/auth.ts` using the Password provider
- **Imports:** Use path alias `@/` for `src/`, e.g. `import { Button } from '@/components/ui/button'`
- **Components:** UI primitives come from shadcn/ui (`src/components/ui/`). Add new shadcn components with `bunx shadcn@latest add <component>`
- **Styling:** Tailwind CSS v4 via Vite plugin — no `tailwind.config.js`. Use utility classes directly

## `/api` Conventions

- **Route modules** live under `api/<resource>/` (e.g. `api/users/`, `api/stock/`)
- **Swagger docs** auto-generated from JSDoc in route files; available at `/api/v1/docs`
- **Models** are Mongoose schemas in `models/`
- **Auth** uses Passport.js JWT strategy (`strategies/jwt.js`)
- **Real-time** events are emitted via Socket.IO on the same HTTP server as Express

## Code Style

Prettier config (applies across all packages):
- Single quotes
- Semicolons
- 2-space indent
- Trailing commas (ES5 style)
