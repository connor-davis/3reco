import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import './index.css';
import { routeTree } from './routeTree.gen';
import { RouteError } from './components/route-error';
import { ThemeProvider } from './components/providers/theme';
import { DirectionProvider } from './components/ui/direction';
import { MockProvider } from './lib/mock/provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './lib/auth/provider';

const queryClient = new QueryClient();

const router = createRouter({ routeTree, defaultErrorComponent: RouteError });

// Register the router instance for type safety.
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <DirectionProvider direction="ltr">
          <ThemeProvider defaultTheme="system" storageKey="three-theme">
            {/* ponytail: legacy mock state for chunks B, C, D until they are merged; removed with src/lib/mock. */}
            <MockProvider>
              <RouterProvider router={router} />
            </MockProvider>
          </ThemeProvider>
        </DirectionProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>
);
