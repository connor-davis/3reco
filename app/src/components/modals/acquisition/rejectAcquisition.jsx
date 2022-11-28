import apiUrl from '../../../apiUrl';
import axios from 'axios';
import { createSignal } from 'solid-js';
import useNotifications from '../../../hooks/notifications';
import useState from '../../../hooks/state';

const RejectAcquisitionRequestModal = ({ id, type }) => {
  const [authState, updateAuthState, clearAuthState] = useState('authState');
  const [userState, updateUserState, clearUserState] = useState('userState');
  const [notificationsState, addNotification, deleteNotification, clear] =
    useNotifications();

  const [reason, setReason] = createSignal('');

  const rejectRequest = () => {
    if (reason() === '' || reason() === undefined)
      setReason('No reason given.');

    axios
      .post(
        apiUrl + '/offers/acquire/reject/' + type,
        { id, reason: reason() },
        { headers: { Authorization: 'Bearer ' + authState.token } }
      )
      .then((response) => {
        if (response.data.error) {
          addNotification('Error', response.data.message);
        } else {
          addNotification('Success', response.data.message);
        }
      })
      .catch((error) => {});
  };

  return (
    <div
      class="modal fade fixed top-0 left-0 hidden w-full h-full outline-none overflow-x-hidden overflow-y-auto"
      id="rejectAcquisitionRequestModal"
      tabindex="-1"
      aria-labelledby="rejectAcquisitionRequestModal"
      aria-modal="true"
      role="dialog"
    >
      <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable relative w-auto pointer-events-none">
        <div class="modal-content border-none shadow-lg relative flex flex-col w-full pointer-events-auto bg-white bg-clip-padding rounded-md outline-none text-current">
          <div class="modal-header flex flex-shrink-0 items-center justify-between p-4 border-b border-gray-200 rounded-t-md">
            <h5
              class="text-xl font-medium leading-normal text-gray-800"
              id="exampleModalCenteredScrollableLabel"
            >
              Reject Request
            </h5>
            <button
              type="button"
              class="btn-close box-content w-4 h-4 p-1 text-black border-none rounded-none opacity-50 focus:shadow-none focus:outline-none focus:opacity-100 hover:text-black hover:opacity-75 hover:no-underline"
              data-bs-dismiss="modal"
              aria-label="Close"
            ></button>
          </div>
          <div class="modal-body relative p-4 flex flex-col w-full h-full max-h-96">
            <div class="flex flex-col space-y-3 w-full h-full overflow-y-auto">
              <div class="flex flex-col justify-start space-y-2">
                <div>
                  Reason <span class="text-red-500">*</span>
                </div>
                <textarea
                  type="text"
                  placeholder="Reason"
                  value={reason()}
                  onKeyUp={(event) => setReason(event.target.value)}
                  class="w-full h-40 overflow-y-auto px-3 py-3 rounded-lg bg-gray-200 outline-none"
                  style="resize: none;"
                />
                <div class="text-sm text-gray-500">
                  What reason are you rejecting the request for?
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer flex space-x-2 items-center justify-end p-4 border-t border-gray-200 rounded-b-md">
            <div
              class="flex items-center w-full justify-center px-3 py-1 bg-red-500 rounded-md cursor-pointer"
              data-bs-toggle="modal"
              data-data-bs-dismiss="modal"
            >
              Cancel
            </div>
            <div
              class="flex items-center w-full justify-center px-3 py-1 bg-emerald-500 rounded-md cursor-pointer"
              onClick={() => {
                rejectRequest();
              }}
              data-bs-toggle="modal"
              data-data-bs-dismiss="modal"
            >
              Continue
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RejectAcquisitionRequestModal;
