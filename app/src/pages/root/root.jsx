import { Link, Outlet } from '@solidjs/router';

import Logo from '../../assets/3rEco-x512.png';
import { onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import useState from '../../hooks/state';

const Root = ({ children }) => {
  const [notificationsState, updateNotificationsState] =
    useState('notificationsState');

  const navigate = useNavigate();

  const [userState] = useState('userState');

  const getUserImage = () => {
    if (!userState.image) {
      if (userState.userType === 'business') {
        if (userState.businessName) {
          const businessNameSplit = userState.businessName.split(' ');

          return (
            businessNameSplit[0] + businessNameSplit[businessNameSplit.length]
          );
        } else return 'B';
      } else if (userState.userType === 'standard') {
        if (userState.firstName && userState.lastName) {
          const firstNameSplit = userState.firstName.split('');
          const lastNameSplit = userState.lastName.split('');

          return firstNameSplit[0] + lastNameSplit[0];
        } else return 'S';
      } else {
        return 'A';
      }
    } else return userState.image;
  };

  onMount(() => {
    setTimeout(() => {
      updateNotificationsState({ notifications: [] });
      
      if (!userState.completedProfile) navigate('/setupProfile');
    }, 300);
  });

  return (
    <>
      <div class="flex flex-col lg:hidden w-full h-full overflow-hidden">
        <div class="flex flex-col space-y-10 w-full h-full justify-center items-center">
          <div class="text-2xl">
            <img src={Logo} class="w-32 h-32" />
          </div>

          <div class="flex flex-col space-y-4 max-w-96 h-auto rounded-2xl shadow-2xl p-3 bg-gray-100 border-1 border-l border-t border-r border-b border-gray-300">
            This part of the app is under development.
          </div>
        </div>
      </div>
      <div class="hidden lg:flex w-full h-full overflow-hidden">
        <div class="flex flex-col items-center w-24 h-full border-r border-gray-300 bg-gray-100 dark:bg-gray-900">
          <div class="pt-4 pb-2 px-6">
            <Link href="/profile">
              <div class="flex items-center">
                <div class="shrink-0">
                  {getUserImage().length > 2 && (
                    <img
                      src={getUserImage()}
                      class="rounded-full w-10 h-10 bg-emerald-500 object-cover"
                    />
                  )}

                  {getUserImage().length <= 2 && (
                    <div class="flex flex-col justify-center items-center rounded-full w-10 h-10 bg-emerald-500">
                      {getUserImage()}
                    </div>
                  )}
                </div>
              </div>
            </Link>
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
                href="/stock"
                data-mdb-ripple="true"
                data-mdb-ripple-color="#10b981"
                data-bs-toggle="tooltip"
                data-bs-placement="right"
                title="Stock"
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
                    d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"
                  />
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
              <Link
                class="flex items-center space-x-2 text-sm py-4 px-6 h-12 overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap rounded hover:text-emerald-500 hover:bg-emerald-50 transition duration-300 ease-in-out"
                href="/"
                data-mdb-ripple="true"
                data-mdb-ripple-color="#10b981"
                data-bs-toggle="tooltip"
                data-bs-placement="right"
                title="Inbox"
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
                    d="M21.75 9v.906a2.25 2.25 0 01-1.183 1.981l-6.478 3.488M2.25 9v.906a2.25 2.25 0 001.183 1.981l6.478 3.488m8.839 2.51l-4.66-2.51m0 0l-1.023-.55a2.25 2.25 0 00-2.134 0l-1.022.55m0 0l-4.661 2.51m16.5 1.615a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V8.844a2.25 2.25 0 011.183-1.98l7.5-4.04a2.25 2.25 0 012.134 0l7.5 4.04a2.25 2.25 0 011.183 1.98V19.5z"
                  />
                </svg>
              </Link>
            </li>
          </ul>
        </div>
        <div class="flex flex-col w-full h-full px-2 pt-2 bg-gray-200">
          <div class="flex flex-col w-full h-full bg-gray-100 rounded-t-2xl border-l border-t border-r border-gray-300 p-4">
            <Outlet />
          </div>
        </div>
      </div>
    </>
  );
};

export default Root;
