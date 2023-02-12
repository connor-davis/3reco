import { createSignal, onMount } from 'solid-js';

import RejectAcquisitionRequestModal from '../../../components/modals/acquisition/rejectAcquisition';
import apiUrl from '../../../apiUrl';
import axios from 'axios';
import { createStore } from 'solid-js/store';
import useNotifications from '../../../hooks/notifications';
import useState from '../../../hooks/state';
import AcceptAcquisitionRequestModal from '../../../components/modals/acquisition/acceptAcquisition';

const AcquisitionRequestAttachment = ({ id, offerer = false }) => {
  const [authState, updateAuthState, clearAuthState] = useState('authState');
  const [userState, updateUserState, clearUserState] = useState('userState');
  const [notificationsState, addNotification, deleteNotification, clear] =
    useNotifications();

  const [loading, setLoading] = createSignal(true);
  const [data, setData] = createStore({}, { name: id + '-data' });

  onMount(() => {
    setLoading(false);
  });

  const acceptRequest = () => {
    const type = offerer ? 'offerer' : 'requester';

    axios
      .post(
        apiUrl + '/offers/acquire/accept/' + type,
        { id },
        { headers: { Authorization: 'Bearer ' + authState.token } }
      )
      .then((response) => {
        if (response.data.error) {
          addNotification('Error', response.data.message);
        } else {
          addNotification('Success', response.data.message);
        }
      });
  };

  return (
    <>
      <RejectAcquisitionRequestModal
        id={id}
        type={offerer ? 'offerer' : 'requester'}
      />

      <AcceptAcquisitionRequestModal id={id} />

      {loading() && (
        <div class="flex space-x-3 justify-center items-center w-auto h-auto rounded-md p-1 md:p-3 bg-gray-100 border-1 border-l border-t border-r border-b border-gray-300">
          <div>Loading acquisition request attachment.</div>
          <div
            class="spinner-border animate-spin text-emerald-500 inline-block w-4 h-4 border-2 rounded-full"
            role="status"
          ></div>
        </div>
      )}

      {!loading() && (
        <div class="flex items-center space-x-3 w-full h-auto bg-gray-100 border-l border-t border-r border-b border-gray-300 rounded-md p-1 md:p-3">
          <div
            class="flex items-center w-full justify-center px-3 py-1 bg-red-500 rounded-md cursor-pointer"
            data-bs-toggle="modal"
            data-bs-target="#rejectAcquisitionRequestModal"
          >
            Reject
          </div>
          {offerer ? (
            <div
              class="flex items-center w-full justify-center px-3 py-1 bg-emerald-500 rounded-md cursor-pointer"
              onClick={() => acceptRequest()}
            >
              Accept
            </div>
          ) : (
            <div
              class="flex items-center w-full justify-center px-3 py-1 bg-emerald-500 rounded-md cursor-pointer"
              data-bs-toggle="modal"
              data-bs-target="#acceptAcquisitionRequestModal"
            >
              Accept
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default AcquisitionRequestAttachment;
