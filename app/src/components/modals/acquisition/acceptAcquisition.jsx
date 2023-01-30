import axios from 'axios';
import { createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';
import apiUrl from '../../../apiUrl';
import useNotifications from '../../../hooks/notifications';
import useState from '../../../hooks/state';
import Paged from '../../paged/paged';

const AcceptAcquisitionRequestModal = ({ id }) => {
  const [authState, updateAuthState, clearAuthState] = useState('authState');
  const [userState, updateUserState, clearUserState] = useState('userState');
  const [notificationsState, addNotification, deleteNotification, clear] =
    useNotifications();

  const [reason, setReason] = createSignal('');

  const [addingTo, setAddingTo] = createSignal(undefined);
  const [selectedStock, setSelectedStock] = createSignal(undefined);

  const [stockPages, setStockPages] = createSignal(0);
  const [currentStockPage, setCurrentStockPage] = createSignal(1);
  const [pageData, setPageData] = createStore([], { name: 'page-data' });
  const [paged, setPaged] = createStore([], { name: 'paged-list' });

  const getStockPages = () => {
    axios
      .get(apiUrl + '/stock/pages?limit=10', {
        headers: {
          Authorization: 'Bearer ' + authState.token,
        },
      })
      .then((response) => {
        setPaged([]);
        setStockPages(response.data.pages);

        for (let i = 0; i < stockPages(); i++) {
          setPaged([...paged, i + 1]);
        }

        if (currentStockPage() > stockPages())
          setCurrentStockPage(stockPages());

        fetchStockPage();
      })
      .catch((error) => {});
  };

  const fetchStockPage = () => {
    axios
      .get(apiUrl + '/stock/page/' + currentStockPage() + '?limit=10', {
        headers: {
          Authorization: 'Bearer ' + authState.token,
        },
      })
      .then((response) => {
        setPageData([...response.data.pageData]);
        setLoading(false);
      })
      .catch((error) => {});
  };

  const acceptRequest = () => {
    axios
      .post(
        apiUrl + '/offers/acquire/accept/requester',
        { id, addingTo: addingTo() || 'new', selectedStock: selectedStock() },
        { headers: { Authorization: 'Bearer ' + authState.token } }
      )
      .then((response) => {
        if (response.data.error) {
          addNotification('Error', response.data.message);
          setAddingTo(undefined);
        } else {
          addNotification('Success', response.data.message);
        }
      })
      .catch((error) => {});
  };

  return (
    <div
      class="modal fade fixed top-0 left-0 hidden w-full h-full outline-none overflow-x-hidden overflow-y-auto"
      id="acceptAcquisitionRequestModal"
      tabindex="-1"
      aria-labelledby="acceptAcquisitionRequestModal"
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
              Accept Request
            </h5>
            <button
              type="button"
              class="btn-close box-content w-4 h-4 p-1 text-black border-none rounded-none opacity-50 focus:shadow-none focus:outline-none focus:opacity-100 hover:text-black hover:opacity-75 hover:no-underline"
              data-bs-dismiss="modal"
              aria-label="Close"
              onClick={() => {
                setAddingTo(undefined);
                setSelectedStock(undefined);
              }}
            ></button>
          </div>
          <div class="modal-body relative p-4 flex flex-col w-full h-full max-h-96">
            {!addingTo() && (
              <div class="flex flex-col space-y-3 w-full h-full overflow-y-auto">
                <div class="flex flex-col justify-start space-y-2">
                  <div
                    onClick={() => {
                      acceptRequest();
                    }}
                    class="flex items-center space-x-2 text-sm py-4 px-6 w-full h-12 bg-white border-l border-t border-r border-b border-neutral-300 cursor-pointer overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap rounded hover:text-emerald-500 hover:bg-emerald-50 transition duration-300 ease-in-out"
                  >
                    Create New Stock
                  </div>
                  <div
                    onClick={() => {
                      setAddingTo('existing');

                      getStockPages();
                    }}
                    class="flex items-center space-x-2 text-sm py-4 px-6 w-full h-12 bg-white border-l border-t border-r border-b border-neutral-300 cursor-pointer overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap rounded hover:text-emerald-500 hover:bg-emerald-50 transition duration-300 ease-in-out"
                  >
                    Add To Existing Stock
                  </div>
                </div>
              </div>
            )}

            {addingTo() === 'existing' && (
              <div class="flex flex-col space-y-3 w-full h-full overflow-y-auto">
                <div class="flex flex-col justify-start space-y-2">
                  <div>
                    Please choose what stock you want to add new stock to.
                  </div>
                  <div class="flex flex-col w-full h-auto">
                    <div class="flex flex-col w-full h-60 overflow-y-auto border-l border-t border-r border-b border-neutral-300 bg-neutral-200 p-3 rounded-t-lg">
                      {pageData.length > 0 &&
                        pageData.map((stock, i) => (
                          <div
                            class={`flex items-center justify-between cursor-pointer border-l border-t border-r border-b border-neutral-300 p-3 rounded-lg transition duration-300 ease-in-out hover:text-emerald-500 hover:bg-emerald-200 ${
                              stock._id === selectedStock()
                                ? 'bg-emerald-500 text-white'
                                : 'bg-neutral-100'
                            }`}
                            onClick={() => setSelectedStock(stock._id)}
                          >
                            <div class="">{stock.stockName}</div>
                            <div class="">{stock.stockWeight} kg</div>
                          </div>
                        ))}

                      {pageData.length === 0 && (
                        <div class="flex flex-col w-full h-full justify-center items-center">
                          You have no stock.
                        </div>
                      )}
                    </div>
                    <div class="flex justify-center items-center w-full border-l border-r border-b border-gray-300 bg-gray-100 p-3 rounded-b-lg">
                      <nav>
                        <ul class="flex list-style-none space-x-2">
                          <li class="page-item">
                            <div
                              class="page-link relative block py-2 px-2 rounded-md border-0 bg-transparent outline-none transition-all duration-300 text-gray-800 hover:text-gray-800 hover:bg-emerald-200 focus:shadow-none cursor-pointer"
                              onClick={() => {
                                if (currentStockPage() > 1) {
                                  setCurrentStockPage(currentStockPage() - 1);
                                  fetchStockPage();
                                }
                              }}
                              data-mdb-ripple="true"
                              data-mdb-ripple-color="#10b981"
                            >
                              <span aria-hidden="true">&laquo;</span>
                            </div>
                          </li>

                          {stockPages() > 0 && (
                            <Paged
                              paged={paged}
                              currentPage={currentStockPage}
                              onPageClick={(page) => {
                                setCurrentStockPage(page);
                                fetchStockPage();
                              }}
                            />
                          )}

                          <li class="page-item">
                            <div
                              class="page-link relative block py-2 px-2 rounded-md border-0 bg-transparent outline-none transition-all duration-300 text-gray-800 hover:text-gray-800 hover:bg-emerald-200 focus:shadow-none cursor-pointer"
                              aria-label="Next"
                              onClick={() => {
                                if (currentStockPage() < stockPages()) {
                                  setCurrentStockPage(currentStockPage() + 1);
                                  fetchStockPage();
                                }
                              }}
                              data-mdb-ripple="true"
                              data-mdb-ripple-color="#10b981"
                            >
                              <span aria-hidden="true">&raquo;</span>
                            </div>
                          </li>
                        </ul>
                      </nav>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          {addingTo() !== undefined && (
            <div class="modal-footer flex space-x-2 items-center justify-end p-4 border-t border-gray-200 rounded-b-md">
              <div
                class="flex items-center w-full justify-center px-3 py-1 bg-red-500 rounded-md cursor-pointer"
                data-bs-toggle="modal"
                data-data-bs-dismiss="modal"
                onClick={() => {
                  setAddingTo(undefined);
                  setSelectedStock(undefined);
                }}
              >
                Cancel
              </div>
              <div
                class="flex items-center w-full justify-center px-3 py-1 bg-emerald-500 rounded-md cursor-pointer"
                onClick={() => {
                  acceptRequest();
                }}
                data-bs-toggle="modal"
                data-data-bs-dismiss="modal"
              >
                Continue
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AcceptAcquisitionRequestModal;
