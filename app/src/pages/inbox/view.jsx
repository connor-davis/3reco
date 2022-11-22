import { createSignal, onMount } from 'solid-js';
import { useNavigate, useParams } from '@solidjs/router';

import apiUrl from '../../apiUrl';
import axios from 'axios';
import { createStore } from 'solid-js/store';
import useNotifications from '../../hooks/notifications';
import useState from '../../hooks/state';

const InboxView = () => {
  const params = useParams();
  const navigate = useNavigate();

  const [authState, updateAuthState, clearAuthState] = useState('authState');
  const [userState, updateUserState, clearUserState] = useState('userState');
  const [notificationsState, addNotification, deleteNotification, clear] =
    useNotifications();

  const [isLoading, setLoading] = createSignal(true);
  const [statusMessage, setStatusMessage] = createSignal('Loading message.');

  const [pageData, setPageData] = createStore({}, { name: 'page-data' });

  onMount(() => {
    setTimeout(() => {
      axios
        .get(apiUrl + '/inbox/' + params.id, {
          headers: { Authorization: 'Bearer ' + authState.token },
        })
        .then((response) => {
          setPageData({
            ...response.data.data,
          });

          setLoading(false);
        })
        .catch((error) => {});
    }, 300);
  });

  const deleteInbox = (id) => {
    axios
      .delete(apiUrl + '/inbox/' + id, {
        headers: { Authorization: 'Bearer ' + authState.token },
      })
      .then((response) => {
        if (response.data.error) {
          addNotification('Error', response.data.message);
        } else {
          navigate('/inbox', { replace: true });
        }
      })
      .catch((error) => {});
  };

  const getUserImage = (user) => {
    if (!user.image) {
      if (user.userType === 'business') {
        if (user.businessName) {
          const businessNameSplit = user.businessName.split(' ');

          return (
            businessNameSplit[0] + businessNameSplit[businessNameSplit.length]
          );
        } else return 'B';
      } else if (user.userType === 'standard') {
        if (user.firstName && user.lastName) {
          const firstNameSplit = user.firstName.split('');
          const lastNameSplit = user.lastName.split('');

          return firstNameSplit[0] + lastNameSplit[0];
        } else return 'S';
      } else {
        return 'A';
      }
    } else return user.image;
  };

  return (
    <div class="flex flex-col w-full h-full overflow-y-auto">
      {isLoading() && (
        <div class="flex flex-col w-full h-full justify-center items-center bg-gray-100">
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
        <div class="flex flex-col w-full h-full space-y-2 animate-fade-in overflow-hidden">
          <div class="flex justify-between items-center">
            <div
              class="flex items-center space-x-2 text-sm py-3 px-3 rounded-full overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap hover:text-emerald-500 hover:bg-emerald-100 transition duration-300 ease-in-out cursor-pointer"
              data-mdb-ripple="true"
              data-mdb-ripple-color="#10b981"
              onClick={() => navigate('/inbox', { replace: true })}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1.5"
                stroke="currentColor"
                class="w-4 h-4"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
                />
              </svg>
            </div>

            <div
              class="flex items-center space-x-2 text-sm py-3 px-3 rounded-full overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap hover:text-red-500 hover:bg-red-100 transition duration-300 ease-in-out cursor-pointer"
              data-mdb-ripple="true"
              data-mdb-ripple-color="#ef4444"
              onClick={() => deleteInbox(params.id)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1.5"
                stroke="currentColor"
                class="w-4 h-4"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                />
              </svg>
            </div>
          </div>
          <div class="flex flex-col w-full h-full overflow-y-auto border-l border-t border-r border-b border-gray-300 bg-gray-200 rounded-lg p-3 px-96 space-y-2">
            <div class="flex flex-col w-full h-auto bg-gray-100 border-l border-t border-r border-b border-gray-300 rounded-md p-3 text-2xl">
              {pageData.title}
            </div>
            <div class="flex space-x-3 w-full h-auto bg-gray-100 border-l border-t border-r border-b border-gray-300 rounded-md p-3">
              <div class="flex items-center">
                <div class="shrink-0">
                  {getUserImage(pageData.sender).length > 2 && (
                    <img
                      src={getUserImage(pageData.sender)}
                      class="rounded-full w-10 h-10 bg-emerald-500 object-cover"
                    />
                  )}

                  {getUserImage(pageData.sender).length <= 2 && (
                    <div class="flex flex-col justify-center items-center rounded-full w-10 h-10 bg-emerald-500">
                      {getUserImage(pageData.sender)}
                    </div>
                  )}
                </div>
              </div>
              <div class="flex flex-col w-full">
                {pageData.sender.userType === 'standard' ? (
                  <div>
                    {`${pageData.sender.firstName} ${pageData.sender.lastName}`}{' '}
                    <span class="text-gray-400">{`<${pageData.sender.phoneNumber}>`}</span>
                  </div>
                ) : (
                  <div>
                    {pageData.sender.businessName}{' '}
                    <span class="text-gray-400">{`<${pageData.sender.phoneNumber}>`}</span>
                  </div>
                )}
                <div class="text-gray-400">to me</div>
              </div>
            </div>
            <div class="flex flex-col w-full h-auto bg-gray-100 border-l border-t border-r border-b border-gray-300 rounded-md p-3">
              {pageData.content.split('\n').map((content) => (
                <>
                  <p>{content || <br />}</p>
                </>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InboxView;
