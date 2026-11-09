# 3rEco web app

React 19, Vite, TypeScript, TanStack Router and Query, Tailwind 4 and shadcn.
It talks to the Go API under `/api` and gets live data over the WebSocket.

## Development

From the repo root: `task up`, then `task dev` (API on :8180, this app on
http://localhost:5173). Vite proxies `/api` to the API, so the app needs no
environment variables.

```
npm run dev     # Vite alone
npm run build   # tsc -b && vite build, output in dist/
npm run lint    # tsc -b && eslint . && prettier --check .
npm test
```

In production the Go binary serves `dist/` (see `docs/operate.md`).
