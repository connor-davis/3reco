import {lazy} from "solid-js";

export const AdminRoutes = [
    {
        path: "/",
        component: lazy(() => import("./pages/admin/root/root")),
        children: [
            {path: "/", component: lazy(() => import("./pages/admin/dashboard/dashboard"))},
            {path: "/materials", component: lazy(() => import("./pages/admin/materials/materials"))},
            {path: "/users", component: lazy(() => import("./pages/admin/users/users"))},
        ]
    }
];
export const UserRoutes = [
    {
        path: "/",
        component: lazy(() => import("./pages/root/root")),
        children: [
            {path: "/", component: lazy(() => import("./pages/dashboard/dashboard"))},
            {path: "/profile", component: lazy(() => import("./pages/profile/profile"))},
            {path: "/stock", component: lazy(() => import("./pages/stock/stock"))},
            {path: "/materials", component: lazy(() => import("./pages/materials/materials"))},
            {path: "/inbox", component: lazy(() => import("./pages/inbox/inbox"))},
            {path: "/inbox/:id", component: lazy(() => import("./pages/inbox/[id]"))},
        ]
    }
];
export const PublicRoutes = [
    {
        path: "/auth",
        component: lazy(() => import("./pages/authentication/authentication"))
    }
];