import { Link, Outlet } from '@solidjs/router';

import Logo from '../../../assets/3rEco-x512.png';
import { createSignal, onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import useState from '../../../hooks/state';
import useNotifications from "../../../hooks/notifications";

const AdminRoot = ({ children }) => {
    const [notificationsState, addNotification, deleteNotification, clear] =
        useNotifications();

    const [userState, updateUserState, clearUserState] = useState('userState');
    const [authState, updateAuthState, clearAuthState] = useState('authState');

    const [navbarShown, setNavbarShown] = createSignal(false);

    const logoutAdmin = () => {
        clearUserState();
        clearAuthState();

        addNotification("Info", "You will be logged out in 3 seconds.");

        setTimeout(() => {
            window.location.href = "/";
        }, 3000);
    }

    return (
        <>
            <div class="flex flex-col lg:hidden w-full h-full overflow-hidden">
                <div class="flex justify-between items-center bg-neutral-100 border-b border-neutral-300 p-3">
                    <div class="flex items-center">
                        <div class="shrink-0">
                            <img
                                src={Logo}
                                class="rounded-full w-10 h-10 object-cover"
                            />
                        </div>
                    </div>

                    <div
                        class="flex items-center cursor-pointer p-3 space-x-2 text-sm overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap rounded hover:text-emerald-500 hover:bg-emerald-50 transition duration-300 ease-in-out"
                        data-mdb-ripple="true"
                        data-mdb-ripple-color="#10b981"
                        data-bs-toggle="tooltip"
                        data-bs-placement="right"
                        title="Menu"
                        onClick={() => setNavbarShown(true)}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                        </svg>
                    </div>
                </div>

                {navbarShown() &&
                    <div class={navbarShown() && "absolute top-0 left-0 w-screen h-screen bg-neutral-100 p-3 flex flex-col space-y-5 z-50"}>
                        <div class="flex justify-between items-center w-full">
                            <div class="text-2xl">
                                <img src={Logo} class="w-10 h-10" />
                            </div>
                            <div
                                class="flex items-center cursor-pointer p-3 space-x-2 text-sm overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap rounded hover:text-emerald-500 hover:bg-emerald-50 transition duration-300 ease-in-out"
                                data-mdb-ripple="true"
                                data-mdb-ripple-color="#10b981"
                                data-bs-toggle="tooltip"
                                data-bs-placement="right"
                                title="Menu"
                                onClick={() => setNavbarShown(false)}>
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </div>
                        </div>
                        <ul class="flex flex-col space-y-2 items-center w-full h-full">
                            <li class="relative w-full flex flex-col space-y-2">
                                <Link
                                    class="flex items-center space-x-2 text-sm py-4 px-6 w-full h-12 bg-white border-l border-t border-r border-b border-neutral-300 overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap rounded hover:text-emerald-500 hover:bg-emerald-50 transition duration-300 ease-in-out"
                                    href="/"
                                    data-mdb-ripple="true"
                                    data-mdb-ripple-color="#10b981"
                                    data-bs-toggle="tooltip"
                                    data-bs-placement="right"
                                    title="Dashboard"
                                    onClick={() => setNavbarShown(false)}
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke-width="1.5"
                                        stroke="currentColor"
                                        class="w-6 h-6"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
                                        />
                                    </svg>
                                    <div>Dashboard</div>
                                </Link>
                                <Link
                                    class="flex items-center space-x-2 text-sm py-4 px-6 w-full h-12 bg-white border-l border-t border-r border-b border-neutral-300 overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap rounded hover:text-emerald-500 hover:bg-emerald-50 transition duration-300 ease-in-out"
                                    href="/users"
                                    data-mdb-ripple="true"
                                    data-mdb-ripple-color="#10b981"
                                    data-bs-toggle="tooltip"
                                    data-bs-placement="right"
                                    title="Users"
                                    onClick={() => setNavbarShown(false)}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                                        stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                                        <path stroke-linecap="round" stroke-linejoin="round"
                                            d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                                    </svg>
                                    <div>Users</div>
                                </Link>
                                <Link
                                    class="flex items-center space-x-2 text-sm py-4 px-6 w-full h-12 bg-white border-l border-t border-r border-b border-neutral-300 overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap rounded hover:text-emerald-500 hover:bg-emerald-50 transition duration-300 ease-in-out"
                                    href="/materials"
                                    data-mdb-ripple="true"
                                    data-mdb-ripple-color="#10b981"
                                    data-bs-toggle="tooltip"
                                    data-bs-placement="right"
                                    title="Materials"
                                    onClick={() => setNavbarShown(false)}
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke-width="1.5"
                                        stroke="currentColor"
                                        class="w-6 h-6"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"
                                        />
                                    </svg>
                                    <div>Materials</div>
                                </Link>
                                <div
                                    class="flex items-center mb-2 cursor-pointer space-x-2 text-sm py-4 px-6 w-full h-12 bg-white border-l border-t border-r border-b border-neutral-300 overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap rounded hover:text-red-500 hover:bg-red-50 transition duration-300 ease-in-out"
                                    data-mdb-ripple="true"
                                    data-mdb-ripple-color="#ef4444"
                                    data-bs-toggle="tooltip"
                                    data-bs-placement="right"
                                    title="Logout"
                                    onClick={() => {
                                        setNavbarShown(false);
                                        logoutAdmin();
                                    }}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
                                        stroke="currentColor" class="w-6 h-6">
                                        <path stroke-linecap="round" stroke-linejoin="round"
                                            d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                                    </svg>
                                    <div>Logout</div>
                                </div>
                            </li>
                        </ul>
                    </div>
                }

                <div class="flex flex-col w-full h-full px-2 pt-2 bg-gray-200">
                    <div class="flex flex-col w-full h-full bg-gray-100 rounded-t-2xl border-l border-t border-r border-gray-300 p-4">
                        <Outlet />
                    </div>
                </div>
            </div>
            <div class="hidden lg:flex w-full h-full overflow-hidden">
                <div
                    class="flex flex-col items-center w-24 h-full border-r border-gray-300 bg-gray-100 dark:bg-gray-900">
                    <div class="pt-4 pb-2 px-6">
                        <div class="flex items-center">
                            <div class="shrink-0">
                                <img
                                    src={Logo}
                                    class="rounded-full w-10 h-10 object-cover"
                                />
                            </div>
                        </div>
                    </div>
                    <ul class="flex flex-col items-center w-full h-full">
                        <li class="relative">
                            <Link
                                class="flex items-center space-x-2 text-sm py-4 px-6 h-12 overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap rounded hover:text-emerald-500 hover:bg-emerald-50 transition duration-300 ease-in-out"
                                href="/"
                                data-mdb-ripple="true"
                                data-mdb-ripple-color="#10b981"
                                data-bs-toggle="tooltip"
                                data-bs-placement="right"
                                title="Dashboard"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke-width="1.5"
                                    stroke="currentColor"
                                    class="w-6 h-6"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
                                    />
                                </svg>
                            </Link>
                            <Link
                                class="flex items-center space-x-2 text-sm py-4 px-6 h-12 overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap rounded hover:text-emerald-500 hover:bg-emerald-50 transition duration-300 ease-in-out"
                                href="/users"
                                data-mdb-ripple="true"
                                data-mdb-ripple-color="#10b981"
                                data-bs-toggle="tooltip"
                                data-bs-placement="right"
                                title="Users"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                                    stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                                    <path stroke-linecap="round" stroke-linejoin="round"
                                        d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                                </svg>
                            </Link>
                            <Link
                                class="flex items-center space-x-2 text-sm py-4 px-6 h-12 overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap rounded hover:text-emerald-500 hover:bg-emerald-50 transition duration-300 ease-in-out"
                                href="/materials"
                                data-mdb-ripple="true"
                                data-mdb-ripple-color="#10b981"
                                data-bs-toggle="tooltip"
                                data-bs-placement="right"
                                title="Materials"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke-width="1.5"
                                    stroke="currentColor"
                                    class="w-6 h-6"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"
                                    />
                                </svg>
                            </Link>
                        </li>
                    </ul>
                    <div
                        class="flex items-center mb-2 cursor-pointer space-x-2 text-sm py-4 px-6 h-12 overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap rounded hover:text-red-500 hover:bg-red-50 transition duration-300 ease-in-out"
                        data-mdb-ripple="true"
                        data-mdb-ripple-color="#ef4444"
                        data-bs-toggle="tooltip"
                        data-bs-placement="right"
                        title="Logout"
                        onClick={() => logoutAdmin()}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
                            stroke="currentColor" class="w-6 h-6">
                            <path stroke-linecap="round" stroke-linejoin="round"
                                d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                        </svg>
                    </div>
                </div>
                <div class="flex flex-col w-full h-full px-2 pt-2 bg-gray-200">
                    <div
                        class="flex flex-col w-full h-full bg-gray-100 rounded-t-2xl border-l border-t border-r border-gray-300 p-4">
                        <Outlet />
                    </div>
                </div>
            </div>
        </>
    );
};

export default AdminRoot;
