import { createSignal, onMount } from 'solid-js';

import Authentication from '../pages/authentication/authentication';
import apiUrl from '../apiUrl';
import axios from 'axios';
import { useNavigate } from '@solidjs/router';
import useState from '../hooks/state';

const AuthGuard = ({ children }) => {
  const navigate = useNavigate();

  const [authState, updateAuthState, clearAuthState] = useState('authState');
  const [userState, updateUserState, clearUserState] = useState('userState');
  const [statusMessage, setStatusMessage] = createSignal(
    'Checking authentication.'
  );
  const [isLoading, setLoading] = createSignal(true);

  onMount(() => {
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

          navigate("/auth");
        });
    }, 1000);
  });

  return (
    <div class="flex flex-col w-full h-full overflow-y-auto">
      {isLoading() && (
        <div class="flex flex-col w-full h-full justify-center items-center">
          <div class="flex space-x-3 justify-center items-center w-auto h-auto rounded-2xl shadow-2xl p-3 bg-gray-100 border-1 border-l border-t border-r border-b border-gray-300">
            <div>{statusMessage()}</div>
            <div
              class="spinner-border animate-spin text-emerald-500 inline-block w-4 h-4 border-2 rounded-full"
              role="status"
            ></div>
          </div>
        </div>
      )}

      {!isLoading() && (
        <div class="flex flex-col w-full h-full animate-fade-in">
          {!authState.authenticated ? (
            <div class="flex flex-col w-full h-full justify-center items-center animate-fade-in">
              <Authentication></Authentication>
            </div>
          ) : (
            <div class="flex flex-col w-full h-full animate-fade-in">
              {children}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AuthGuard;
