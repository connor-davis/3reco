import apiUrl from '../../../apiUrl';
import axios from 'axios';
import { createSignal } from 'solid-js';
import inboxTypes from '../../../types/inbox.types';
import useNotifications from '../../../hooks/notifications';
import useState from '../../../hooks/state';

const AcquireOfferModal = ({ data = {} }) => {
  const [authState] = useState('authState');

  const [notificationsState, addNotification, deleteNotification, clear] =
    useNotifications();

  const [acquisitionWeight, setAcquisitionWeight] = createSignal(1);

  const acquireOffer = () => {
    axios
      .post(
        apiUrl + '/offers/acquire/request',
        {
          offererId: data.user._id,
          attachments: [
            {
              type: inboxTypes.OFFER,
              offerId: data._id,
            },
          ],
          stockId: data.stock._id,
          stockName: data.stock.stockName,
          stockType: data.stock.stockType,
          weight: acquisitionWeight(),
        },
        { headers: { Authorization: 'Bearer ' + authState.token } }
      )
      .then((response) => {
        if (response.data.error) {
          addNotification('Error', response.data.message);
        } else {
          addNotification('Success', response.data.message);

          setAcquisitionWeight(1);
        }
      })
      .catch((error) => {});
  };

  return (
    <div
      class="modal fade fixed top-0 left-0 hidden w-full h-full outline-none overflow-x-hidden overflow-y-auto"
      id={`acquireOfferModal-${data._id}`}
      tabindex="-1"
      aria-labelledby={`acquireOfferModal-${data._id}`}
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
              Acquire Offer
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
              <div>
                How much of the{' '}
                <span class="font-semibold">{data.stock.stockName}</span> stock,
                in kg, would you like to acquire from the user?
              </div>

              <input
                type="range"
                class="form-range appearance-none w-full h-6 p-0 bg-transparent focus:outline-none focus:ring-0 focus:shadow-none"
                min="1"
                max={`${data.stock.stockWeight}`}
                id="acquisitionWeightRange"
                value={acquisitionWeight()}
                onInput={(event) => {
                  setAcquisitionWeight(event.target.valueAsNumber);
                }}
              />

              <div>
                <span class="text-md font-semibold">Acquisition Weight:</span>{' '}
                {acquisitionWeight()} kg
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
              onClick={() => acquireOffer()}
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

export default AcquireOfferModal;
