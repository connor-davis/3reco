import { AdminRoutes, PublicRoutes, UserRoutes } from './routes';
import { Route, Routes, useNavigate, useRoutes } from '@solidjs/router';
import { createSignal, lazy, onMount } from 'solid-js';

import AdminDashboard from './pages/admin/dashboard/dashboard';
import AdminMaterials from './pages/admin/materials/materials';
import AdminRoot from './pages/admin/root/root';
import AdminUsers from './pages/admin/users/users';
import AuthGuard from './guards/authGuard';
import Authentication from './pages/authentication/authentication';
import Dashboard from './pages/dashboard/dashboard';
import Inbox from './pages/inbox/inbox';
import InboxView from './pages/inbox/[id]';
import Materials from './pages/materials/materials';
import Profile from './pages/profile/profile';
import Root from './pages/root/root';
import SetupProfile from './pages/profile/setup';
import Stock from './pages/stock/stock';
import apiUrl from './apiUrl';
import axios from 'axios';
import useNotifications from './hooks/notifications';
import useState from './hooks/state';
import useThemeToggler from './hooks/themeToggler';

function App() {
  const User = useRoutes(UserRoutes);
  const Public = useRoutes(PublicRoutes);
  const Admin = useRoutes(AdminRoutes);

  const [notificationsState, addNotification, deleteNotification, clear] =
    useNotifications();
  const [theme, toggleTheme] = useThemeToggler();
  const navigate = useNavigate();

  const [authState, updateAuthState, clearAuthState] = useState('authState');
  const [userState, updateUserState, clearUserState] = useState('userState');
  const [statusMessage, setStatusMessage] = createSignal(
    'Checking authentication.'
  );
  const [isLoading, setLoading] = createSignal(true);

  onMount(() => {
    setTimeout(() => {
      addNotification('Info', 'Welcome to 3rEco.');
    }, 5000);

    if (!window.location.href.includes('/resetPassword')) {
      setTimeout(() => {
        axios
          .get(apiUrl + '/auth/check', {
            headers: {
              authorization: 'Bearer ' + authState.token,
            },
          })
          .then((response) => {
            setStatusMessage('You are authenticated.');

            updateAuthState({
              authenticated: true,
              token: response.data.data.authenticationToken,
            });

            delete response.data.data.authenticationToken;

            updateUserState({
              ...response.data.data,
            });

            setTimeout(() => setLoading(false), 1000);
          })
          .catch((error) => {
            setStatusMessage('You are not authenticated.');

            setTimeout(() => setLoading(false), 1000);

            clearAuthState();
            clearUserState();

            navigate('/auth', { replace: true });
          });
      }, 1000);
    }
  });

  return (
    <div class={theme()}>
      <div class="w-screen h-screen bg-gray-100 dark:bg-gray-900 select-none">
        <div class="flex flex-col w-full h-full">
          {notificationsState.notifications && notificationsState.notifications.length > 0 && <div style="pointer-events: none;" class={`absolute w-96 flex flex-col space-y-2 h-auto top-0 right-0 p-5`}>
            {notificationsState.notifications.map((notification) => (
              <div
                class={`bg-white shadow-lg mx-auto w-96 max-w-full text-sm pointer-events-auto bg-clip-padding rounded-lg  ${notification.shown
                  ? 'animate-fade-in block'
                  : 'animate-fade-out hidden'
                  }`}
                id="static-example"
                role="alert"
                aria-live="assertive"
                aria-atomic="true"
                data-mdb-autohide="false"
              >
                <div class=" bg-white flex justify-between items-center py-2 px-3 bg-clip-padding border-b border-gray-200 rounded-t-lg">
                  <p class="font-bold text-gray-500">{notification.title}</p>
                  <div class="flex items-center">
                    {/* <p class="text-gray-600 text-xs">11 mins ago</p> */}
                    <button
                      type="button"
                      class=" btn-close box-content w-4 h-4 ml-2 text-black border-none rounded-none opacity-50 focus:shadow-none focus:outline-none focus:opacity-100 hover:text-black hover:opacity-75 hover:no-underline"
                      data-mdb-dismiss="toast"
                      aria-label="Close"
                      onClick={() => deleteNotification(notification.id)}
                    ></button>
                  </div>
                </div>
                <div class="p-3 bg-white rounded-b-lg break-words text-gray-700">
                  {notification.body}
                </div>
              </div>
            ))}
          </div>}
          <AuthGuard>
            <Routes>
              <Route path="/auth" element={Authentication} />

              {userState.userType === 'admin' && (
                <Route path="/" component={AdminRoot}>
                  <Route path="/" element={AdminDashboard} />
                  <Route path="/users" element={AdminUsers} />
                  <Route path="/materials" element={AdminMaterials} />
                </Route>
              )}

              {userState.userType !== 'admin' && (
                <>
                  <Route path="/" component={Root}>
                    <Route path="/" element={Dashboard} />
                    <Route path="/profile" element={Profile} />
                    <Route path="/stock" element={Stock} />
                    <Route path="/materials" element={Materials} />
                    <Route path="/inbox" element={Inbox} />
                    <Route path="/inbox/:id" element={InboxView} />
                  </Route>
                  <Route path="/setupProfile" element={SetupProfile} />
                </>
              )}
            </Routes>
          </AuthGuard>
        </div>
      </div>
    </div>
  );
}

export default App;
