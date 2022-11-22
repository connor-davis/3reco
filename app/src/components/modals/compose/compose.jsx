import apiUrl from '../../../apiUrl';
import axios from 'axios';
import { createSignal } from 'solid-js';
import useNotifications from '../../../hooks/notifications';
import useState from '../../../hooks/state';

const ComposeModal = () => {
  const [authState, updateAuthState, clearAuthState] = useState('authState');
  const [notificationsState, addNotification, deleteNotification, clear] =
    useNotifications();

  const [phoneNumber, setPhoneNumber] = createSignal('');
  const [title, setTitle] = createSignal('');
  const [content, setContent] = createSignal('');

  const sendMessage = () => {
    axios
      .post(
        apiUrl + '/inbox/compose',
        {
          phoneNumber: phoneNumber(),
          title: title(),
          content: content(),
        },
        { headers: { Authorization: 'Bearer ' + authState.token } }
      )
      .then((response) => {
        if (response.data.error) {
          addNotification('Error', response.data.message);
        } else {
          addNotification('Success', 'Your message has been sent.');
        }
      })
      .catch((error) => {});
  };

  return (
    <div
      class="modal fade fixed top-0 left-0 hidden w-full h-full outline-none overflow-x-hidden overflow-y-auto"
      id="composeModal"
      tabindex="-1"
      aria-labelledby="composeModal"
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
              Compose Message
            </h5>
            <button
              type="button"
              class="btn-close box-content w-4 h-4 p-1 text-black border-none rounded-none opacity-50 focus:shadow-none focus:outline-none focus:opacity-100 hover:text-black hover:opacity-75 hover:no-underline"
              data-bs-dismiss="modal"
              aria-label="Close"
            ></button>
          </div>
          <div class="modal-body relative flex flex-col w-full h-full max-h-96">
            <div class="flex flex-col space-y-3 p-4 w-full h-full overflow-y-auto">
              <div class="flex flex-col justify-start space-y-2">
                <div>
                  Phone Number <span class="text-red-500">*</span>
                </div>
                <input
                  type="text"
                  placeholder="Phone Number"
                  value={phoneNumber()}
                  onKeyUp={(event) => setPhoneNumber(event.target.value)}
                  class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
                />
                <div class="text-sm text-gray-500">
                  What is their phone number?
                </div>
              </div>
              <div class="flex flex-col justify-start space-y-2">
                <div>
                  Title <span class="text-red-500">*</span>
                </div>
                <input
                  type="text"
                  placeholder="Title"
                  value={title()}
                  onKeyUp={(event) => setTitle(event.target.value)}
                  class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
                />
              </div>
              <div class="flex flex-col justify-start space-y-2">
                <div>
                  Content <span class="text-red-500">*</span>
                </div>
                <textarea
                  type="text"
                  placeholder="Content"
                  value={content()}
                  onKeyUp={(event) => setContent(event.target.value)}
                  class="w-full h-40 overflow-y-auto px-3 py-3 rounded-lg bg-gray-200 outline-none"
                  style="resize: none;"
                ></textarea>
                <div class="text-sm text-gray-500">
                  What would you like to say?
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
              class={`flex items-center w-full justify-center px-3 py-1 bg-emerald-500 rounded-md ${
                phoneNumber() !== '' && content() !== '' && title() !== ''
                  ? 'cursor-pointer'
                  : 'cursor-no-drop'
              }`}
              onClick={() => {
                if (
                  phoneNumber() !== '' &&
                  content() !== '' &&
                  title() !== ''
                ) {
                  sendMessage();

                  setPhoneNumber('');
                  setTitle('');
                  setContent('');
                }
              }}
              data-bs-toggle={
                phoneNumber() !== '' && content() !== '' && title() !== ''
                  ? 'modal'
                  : ''
              }
              data-data-bs-dismiss={
                phoneNumber() !== '' && content() !== '' && title() !== ''
                  ? 'modal'
                  : ''
              }
            >
              Send
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ComposeModal;
