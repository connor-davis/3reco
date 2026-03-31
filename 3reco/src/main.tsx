import { StrictMode } from 'react';

import './index.css';
import { routeTree } from './routeTree.gen';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import ReactDOM from 'react-dom/client';

import { ConvexQueryClient } from '@convex-dev/react-query';
import { ConvexProviderWithAuthKit } from '@convex-dev/workos';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthKitProvider, useAuth } from '@workos-inc/authkit-react';
import { ConvexReactClient } from 'convex/react';
import { DirectionProvider } from './components/ui/direction';
import { ThemeProvider } from './components/providers/theme';

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);
const convexQueryClient = new ConvexQueryClient(convex);
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryKeyHashFn: convexQueryClient.hashFn(),
      queryFn: convexQueryClient.queryFn(),
    },
  },
});
convexQueryClient.connect(queryClient);

// Create a new router instance
const router = createRouter({ routeTree });

const configuredRedirectUri = import.meta.env.VITE_WORKOS_REDIRECT_URI;
const redirectPathname = configuredRedirectUri
  ? new URL(configuredRedirectUri).pathname
  : '/callback';
const redirectUri = `${window.location.origin}${redirectPathname}`;
const configuredAuthDomain = import.meta.env.VITE_CONVEX_AUTH_DOMAIN;
const authDomainUrl = configuredAuthDomain
  ? new URL(configuredAuthDomain)
  : null;
const authApiHostname = authDomainUrl?.hostname;
const authApiHttps = authDomainUrl?.protocol === 'https:';
const authApiPort = authDomainUrl?.port
  ? Number.parseInt(authDomainUrl.port, 10)
  : undefined;

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// Render the app
const rootElement = document.getElementById('root')!;
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <AuthKitProvider
        clientId={import.meta.env.VITE_WORKOS_CLIENT_ID}
        apiHostname={authApiHostname}
        https={authDomainUrl ? authApiHttps : undefined}
        port={authApiPort}
        redirectUri={redirectUri}
        onRedirectCallback={({ state }) => {
          const returnTo =
            typeof state?.returnTo === 'string' && state.returnTo.length > 0
              ? state.returnTo
              : '/';

          window.location.replace(returnTo);
        }}
      >
        <DirectionProvider direction="ltr">
          <ConvexProviderWithAuthKit client={convex} useAuth={useAuth}>
            <QueryClientProvider client={queryClient}>
              <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
                <RouterProvider router={router} />
              </ThemeProvider>
            </QueryClientProvider>
          </ConvexProviderWithAuthKit>
        </DirectionProvider>
      </AuthKitProvider>
    </StrictMode>
  );
}
