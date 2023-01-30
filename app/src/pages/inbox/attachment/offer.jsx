import { createSignal, onMount } from 'solid-js';

import apiUrl from '../../../apiUrl';
import axios from 'axios';
import { createStore } from 'solid-js/store';
import useNotifications from '../../../hooks/notifications';
import useState from '../../../hooks/state';

const OfferAttachment = ({ id }) => {
  const [authState, updateAuthState, clearAuthState] = useState('authState');
  const [userState, updateUserState, clearUserState] = useState('userState');
  const [notificationsState, addNotification, deleteNotification, clear] =
    useNotifications();

  const [loading, setLoading] = createSignal(true);
  const [data, setData] = createStore({}, { name: id + '-data' });

  onMount(() => {
    setTimeout(() => {
      axios
        .get(apiUrl + '/offers/' + id, {
          headers: { Authorization: 'Bearer ' + authState.token },
        })
        .then((response) => {
          if (response.data.error) {
            addNotification('Error', response.data.message);
            setLoading(false);
          } else {
            setData({ ...response.data.data });
            setLoading(false);
          }
        })
        .catch((error) => {});
    }, 300);
  });

  return (
    <>
      {loading() && (
        <div class="flex space-x-3 justify-center items-center w-auto h-auto rounded-md p-1 md:p-3 bg-gray-100 border-1 border-l border-t border-r border-b border-gray-300">
          <div>Loading offer attachment.</div>
          <div
            class="spinner-border animate-spin text-emerald-500 inline-block w-4 h-4 border-2 rounded-full"
            role="status"
          ></div>
        </div>
      )}

      {!loading() && (
        <div class="flex flex-col w-full h-auto bg-gray-100 border-l border-t border-r border-b border-gray-300 rounded-md">
          <div class="flex justify-between items-center border-b border-gray-300 p-1 md:p-3">
            <div class="text-lg">{data.stock.stockName}</div>
          </div>
          <div class="flex flex-col w-full h-auto p-1 md:p-3">
            {data.stock.stockDescription}
          </div>
          <div class="flex justify-between items-center border-t border-gray-300 p-1 md:p-3">
            <div></div>
            <div class="flex space-x-2 items-center">
              <span class="text-xs inline-block py-1 px-2.5 leading-none text-center whitespace-nowrap align-baseline font-bold bg-emerald-500 rounded-full">
                {data.stock.stockType}
              </span>
              <span class="text-xs inline-block py-1 px-2.5 leading-none text-center whitespace-nowrap align-baseline font-bold bg-emerald-500 rounded-full">
                {data.stock.stockWeight} kg
              </span>
              <span class="text-xs inline-block py-1 px-2.5 leading-none text-center whitespace-nowrap align-baseline font-bold bg-emerald-500 rounded-full">
                R {data.stock.stockValue}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default OfferAttachment;
