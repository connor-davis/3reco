import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  Outlet,
} from '@tanstack/react-router'
import { DocsLayout } from './components/layout/docs-layout'

// ── MDX content imports ────────────────────────────────────
import Introduction from './content/introduction.mdx'
import Setup from './content/setup.mdx'
import Environment from './content/environment.mdx'
import Architecture from './content/architecture.mdx'
import Schema from './content/schema.mdx'
import Auth from './content/auth.mdx'
import RolesAdmin from './content/roles/admin.mdx'
import RolesBusiness from './content/roles/business.mdx'
import RolesCollector from './content/roles/collector.mdx'
import FeaturesDashboard from './content/features/dashboard.mdx'
import FeaturesMarketplace from './content/features/marketplace.mdx'
import FeaturesTransactions from './content/features/transactions.mdx'
import FeaturesNotifications from './content/features/notifications.mdx'
import FeaturesInvoices from './content/features/invoices.mdx'
import FeaturesExports from './content/features/exports.mdx'
import ApiUsers from './content/api/users.mdx'
import ApiMaterials from './content/api/materials.mdx'
import ApiStock from './content/api/stock.mdx'
import ApiTransactions from './content/api/transactions.mdx'
import ApiTransactionRequests from './content/api/transaction-requests.mdx'
import UserGettingStarted from './content/user/getting-started.mdx'
import UserDashboard from './content/user/dashboard.mdx'
import UserRoles from './content/user/roles.mdx'
import UserStock from './content/user/stock.mdx'
import UserMarketplace from './content/user/marketplace.mdx'
import UserNegotiations from './content/user/negotiations.mdx'
import UserTransactions from './content/user/transactions.mdx'
import UserNotifications from './content/user/notifications.mdx'
import UserProfile from './content/user/profile.mdx'
import DevFrontend from './content/dev/frontend.mdx'
import DevConvexFunctions from './content/dev/convex-functions.mdx'
import DevAggregates from './content/dev/aggregates.mdx'
import DevErrorHandling from './content/dev/error-handling.mdx'
import DevNotifications from './content/dev/notifications.mdx'
import DevInternalActions from './content/dev/internal-actions.mdx'
import DevDeployment from './content/dev/deployment.mdx'

// ── Root ───────────────────────────────────────────────────
const rootRoute = createRootRoute({ component: () => <Outlet /> })

// ── Index redirect ─────────────────────────────────────────
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/docs/introduction' })
  },
})

// ── Docs layout route ──────────────────────────────────────
const docsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/docs',
  component: DocsLayout,
})

// ── Content routes (relative to /docs) ────────────────────
const introductionRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'introduction',
  component: () => <Introduction />,
})
const setupRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'setup',
  component: () => <Setup />,
})
const environmentRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'environment',
  component: () => <Environment />,
})
const architectureRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'architecture',
  component: () => <Architecture />,
})
const schemaRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'schema',
  component: () => <Schema />,
})
const authRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'auth',
  component: () => <Auth />,
})
const rolesAdminRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'roles/admin',
  component: () => <RolesAdmin />,
})
const rolesBusinessRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'roles/business',
  component: () => <RolesBusiness />,
})
const rolesCollectorRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'roles/collector',
  component: () => <RolesCollector />,
})
const featuresDashboardRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'features/dashboard',
  component: () => <FeaturesDashboard />,
})
const featuresMarketplaceRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'features/marketplace',
  component: () => <FeaturesMarketplace />,
})
const featuresTransactionsRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'features/transactions',
  component: () => <FeaturesTransactions />,
})
const featuresNotificationsRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'features/notifications',
  component: () => <FeaturesNotifications />,
})
const featuresInvoicesRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'features/invoices',
  component: () => <FeaturesInvoices />,
})
const featuresExportsRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'features/exports',
  component: () => <FeaturesExports />,
})
const apiUsersRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'api/users',
  component: () => <ApiUsers />,
})
const apiMaterialsRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'api/materials',
  component: () => <ApiMaterials />,
})
const apiStockRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'api/stock',
  component: () => <ApiStock />,
})
const apiTransactionsRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'api/transactions',
  component: () => <ApiTransactions />,
})
const apiTransactionRequestsRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'api/transaction-requests',
  component: () => <ApiTransactionRequests />,
})
const userGettingStartedRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'user/getting-started',
  component: () => <UserGettingStarted />,
})
const userDashboardRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'user/dashboard',
  component: () => <UserDashboard />,
})
const userRolesRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'user/roles',
  component: () => <UserRoles />,
})
const userStockRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'user/stock',
  component: () => <UserStock />,
})
const userMarketplaceRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'user/marketplace',
  component: () => <UserMarketplace />,
})
const userNegotiationsRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'user/negotiations',
  component: () => <UserNegotiations />,
})
const userTransactionsRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'user/transactions',
  component: () => <UserTransactions />,
})
const userNotificationsRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'user/notifications',
  component: () => <UserNotifications />,
})
const userProfileRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'user/profile',
  component: () => <UserProfile />,
})
const devFrontendRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'dev/frontend',
  component: () => <DevFrontend />,
})
const devConvexFunctionsRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'dev/convex-functions',
  component: () => <DevConvexFunctions />,
})
const devAggregatesRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'dev/aggregates',
  component: () => <DevAggregates />,
})
const devErrorHandlingRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'dev/error-handling',
  component: () => <DevErrorHandling />,
})
const devNotificationsRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'dev/notifications',
  component: () => <DevNotifications />,
})
const devInternalActionsRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'dev/internal-actions',
  component: () => <DevInternalActions />,
})
const devDeploymentRoute = createRoute({
  getParentRoute: () => docsRoute,
  path: 'dev/deployment',
  component: () => <DevDeployment />,
})

// ── Route tree ─────────────────────────────────────────────
const routeTree = rootRoute.addChildren([
  indexRoute,
  docsRoute.addChildren([
    introductionRoute,
    setupRoute,
    environmentRoute,
    architectureRoute,
    schemaRoute,
    authRoute,
    rolesAdminRoute,
    rolesBusinessRoute,
    rolesCollectorRoute,
    featuresDashboardRoute,
    featuresMarketplaceRoute,
    featuresTransactionsRoute,
    featuresNotificationsRoute,
    featuresInvoicesRoute,
    featuresExportsRoute,
    apiUsersRoute,
    apiMaterialsRoute,
    apiStockRoute,
    apiTransactionsRoute,
    apiTransactionRequestsRoute,
    userGettingStartedRoute,
    userDashboardRoute,
    userRolesRoute,
    userStockRoute,
    userMarketplaceRoute,
    userNegotiationsRoute,
    userTransactionsRoute,
    userNotificationsRoute,
    userProfileRoute,
    devFrontendRoute,
    devConvexFunctionsRoute,
    devAggregatesRoute,
    devErrorHandlingRoute,
    devNotificationsRoute,
    devInternalActionsRoute,
    devDeploymentRoute,
  ]),
])

// ── Router ─────────────────────────────────────────────────
export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
