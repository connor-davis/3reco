import { createSignal, onMount } from 'solid-js';

import AcquireOfferModal from '../../components/modals/acquireOffer/acquireOffer';
import ComposeModal from '../../components/modals/compose/compose';
import DeleteOfferModal from '../../components/modals/deleteOffer/deleteOffer';
import Paged from '../../components/paged/paged';
import apiUrl from '../../apiUrl';
import axios from 'axios';
import { createStore } from 'solid-js/store';
import inboxTypes from '../../types/inbox.types';
import useNotifications from '../../hooks/notifications';
import useState from '../../hooks/state';

const Dashboard = () => {
  const [authState] = useState('authState');

  const [notificationsState, addNotification, deleteNotification, clear] =
    useNotifications();

  const [isLoading, setLoading] = createSignal(true);
  const [statusMessage, setStatusMessage] = createSignal('Loading dashboard.');

  const [stockPages, setStockPages] = createSignal(0);
  const [currentStockPage, setCurrentStockPage] = createSignal(1);
  const [pageData, setPageData] = createStore([], { name: 'page-data' });
  const [paged, setPaged] = createStore([], { name: 'paged-list' });

  const [marketPages, setMarketPages] = createSignal(0);
  const [currentMarketPage, setCurrentMarketPage] = createSignal(1);
  const [marketPageData, setMarketPageData] = createStore([], {
    name: 'market-page-data',
  });
  const [marketPaged, setMarketPaged] = createStore([], { name: 'paged-list' });

  onMount(() => {
    setTimeout(() => {
      getStockPages();
      getMarketPages();
    }, 300);
  });

  const getStockPages = () => {
    axios
      .get(apiUrl + '/stock/pages', {
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

        fetchStockPage();
      })
      .catch((error) => {});
  };

  const getMarketPages = () => {
    axios
      .get(apiUrl + '/offers/pages', {
        headers: {
          Authorization: 'Bearer ' + authState.token,
        },
      })
      .then((response) => {
        setPaged([]);
        setMarketPages(response.data.pages);

        for (let i = 0; i < marketPages(); i++) {
          setMarketPaged([...marketPaged, i + 1]);
        }

        fetchMarketPage();
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
      })
      .catch((error) => {});
  };

  const fetchMarketPage = () => {
    axios
      .get(apiUrl + '/offers/page/' + currentMarketPage() + '?limit=10', {
        headers: {
          Authorization: 'Bearer ' + authState.token,
        },
      })
      .then((response) => {
        setMarketPageData([...response.data.pageData]);
        setLoading(false);
      })
      .catch((error) => {});
  };

  const createOffer = (data) => {
    axios
      .post(apiUrl + '/offers', data, {
        headers: { Authorization: 'Bearer ' + authState.token },
      })
      .then((response) => {
        if (response.data.error) {
          addNotification('Error', response.data.message);
        } else {
          addNotification(
            'Success',
            'Your ' + data.stockName + ' has been put on offer.'
          );

          fetchStockPage();
        }
      })
      .catch((error) => {});
  };

  const removeOffer = (id) => {
    axios
      .delete(apiUrl + '/offers/' + id, {
        headers: { Authorization: 'Bearer ' + authState.token },
      })
      .then((response) => {
        if (response.data.error) {
          addNotification('Error', response.data.message);
        } else {
          getStockPages();
        }
      })
      .catch((error) => {});
  };

  const getUserImage = (user) => {
    if (!user.image) {
      if (user.userType === 'business') {
        if (user.businessName) {
          const businessNameSplit = user.businessName.split(' ');

          if (businessNameSplit.length > 1) {
            return (
              businessNameSplit[0].substring(0, 1) +
              businessNameSplit[businessNameSplit.length - 1].substring(0, 1)
            );
          } else {
            return userState.businessName.substring(0, 1);
          }
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
        <div class="flex flex-col w-full h-full space-y-2 animate-fade-in">
          <div class="text-xl">Dashboard</div>
          <div class="flex flex-col md:flex-row items-center w-full h-full space-y-2 md:space-y-0 md:space-x-2 overflow-hidden">
            <div class="flex flex-col w-full md:w-1/2 h-full border-l border-t border-r border-b border-gray-300 rounded-lg">
              <div class="flex justify-between items-center px-3 py-2">
                Your Stock
              </div>
              <div class="flex flex-col w-full h-full space-y-2 overflow-y-auto bg-gray-200 border-t border-b border-gray-300 p-2">
                {pageData.length > 0 &&
                  pageData.map((data) => (
                    <div class="flex flex-col w-full h-auto bg-gray-100 border-l border-t border-r border-b border-gray-300 rounded-md">
                      <div class="flex justify-between items-center border-b border-gray-300 p-3">
                        <div class="text-lg">{data.stockName}</div>
                        {data.isOffered ? (
                          <>
                            <DeleteOfferModal
                              id={`deleteOfferModal-${data._id}`}
                              onDelete={() => removeOffer(data._id)}
                            />

                            <div
                              class="flex items-center space-x-2 text-sm py-2 px-3 rounded-md overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap hover:text-red-500 hover:bg-red-100 transition duration-300 ease-in-out cursor-pointer"
                              data-mdb-ripple="true"
                              data-mdb-ripple-color="#ef4444"
                              data-bs-toggle="modal"
                              data-bs-target={`#deleteOfferModal-${data._id}`}
                            >
                              Remove Offer
                            </div>
                          </>
                        ) : (
                          <div
                            class="flex items-center space-x-2 text-sm py-2 px-3 rounded-md overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap hover:text-emerald-500 hover:bg-emerald-100 transition duration-300 ease-in-out cursor-pointer"
                            data-mdb-ripple="true"
                            data-mdb-ripple-color="#10b981"
                            onClick={() => createOffer(data)}
                          >
                            Offer
                          </div>
                        )}
                      </div>
                      <div class="flex flex-col w-full h-auto p-3">
                        {data.stockDescription}
                      </div>
                      <div class="flex justify-between items-center border-t border-gray-300 p-3">
                        <div></div>
                        <div class="flex space-x-2 items-center">
                          <span class="text-xs inline-block py-1 px-2.5 leading-none text-center whitespace-nowrap align-baseline font-bold bg-emerald-500 rounded-full">
                            {data.stockType}
                          </span>
                          <span class="text-xs inline-block py-1 px-2.5 leading-none text-center whitespace-nowrap align-baseline font-bold bg-emerald-500 rounded-full">
                            {data.stockWeight} kg
                          </span>
                          <span class="text-xs inline-block py-1 px-2.5 leading-none text-center whitespace-nowrap align-baseline font-bold bg-emerald-500 rounded-full">
                            R {data.stockValue}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}

                {pageData.length === 0 && (
                  <div class="flex flex-col w-full h-full justify-center items-center">
                    You have no stock.
                  </div>
                )}
              </div>
              <div class="flex justify-center items-center px-3 py-2">
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
            <div class="flex flex-col w-full md:w-1/2 h-full border-l border-t border-r border-b border-gray-300 rounded-lg">
              <div class="flex justify-between items-center px-3 py-2">
                Market
              </div>
              <div class="flex flex-col w-full h-full space-y-2 overflow-y-auto bg-gray-200 border-t border-b border-gray-300 p-2">
                {marketPageData.length > 0 &&
                  marketPageData.map((data) => (
                    <>
                      <ComposeModal
                        id={`composeModal-${data._id}`}
                        data={{
                          title: 'Your ' + data.stock.stockName + ' Offer',
                          phoneNumber: data.user.phoneNumber,
                          _id: data._id,
                          attachments: [
                            {
                              type: inboxTypes.OFFER,
                              offerId: data._id,
                            },
                          ],
                        }}
                      />

                      <AcquireOfferModal data={data} />

                      <div class="flex flex-col w-full h-auto bg-gray-100 border-l border-t border-r border-b border-gray-300 rounded-md">
                        <div class="flex justify-between items-center border-b border-gray-300 p-3">
                          <div class="text-lg">{data.stock.stockName}</div>
                          <div class="flex items-center space-x-2">
                            <div
                              class="flex items-center space-x-2 text-sm py-2 px-3 rounded-md overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap hover:text-emerald-500 hover:bg-emerald-100 transition duration-300 ease-in-out cursor-pointer"
                              data-mdb-ripple="true"
                              data-mdb-ripple-color="#10b981"
                              data-bs-toggle="modal"
                              data-bs-target={`#acquireOfferModal-${data._id}`}
                            >
                              Acquire
                            </div>
                            <div
                              class="flex items-center space-x-2 text-sm py-2 px-3 rounded-md overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap hover:text-emerald-500 hover:bg-emerald-100 transition duration-300 ease-in-out cursor-pointer"
                              data-mdb-ripple="true"
                              data-mdb-ripple-color="#10b981"
                              data-bs-toggle="modal"
                              data-bs-target={`#composeModal-${data._id}`}
                              onClick={() => {}}
                              title="Contact"
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
                                  d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
                                />
                              </svg>
                            </div>
                          </div>
                        </div>
                        <div class="flex flex-col w-full h-auto p-3">
                          {data.stock.stockDescription}
                        </div>
                        <div class="flex justify-between items-center border-t border-gray-300 p-3">
                          <div class="flex items-center space-x-2">
                            <div class="shrink-0">
                              {getUserImage(data.user).length > 2 && (
                                <img
                                  src={getUserImage(data.user)}
                                  class="rounded-full w-10 h-10 bg-gray-200 object-cover"
                                />
                              )}

                              {getUserImage(data.user).length <= 2 && (
                                <div class="flex flex-col justify-center items-center rounded-full w-10 h-10 bg-emerald-500">
                                  {getUserImage(data.user)}
                                </div>
                              )}
                            </div>
                            <div class="text-lg font-semibold">
                              {data.user.userType === 'standard'
                                ? data.user.firstName + ' ' + data.user.lastName
                                : data.user.businessName}
                            </div>
                          </div>
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
                    </>
                  ))}

                {marketPageData.length === 0 && (
                  <div class="flex flex-col w-full h-full justify-center items-center">
                    There are no offers.
                  </div>
                )}
              </div>
              <div class="flex justify-center items-center px-3 py-2">
                <nav>
                  <ul class="flex list-style-none space-x-2">
                    <li class="page-item">
                      <div
                        class="page-link relative block py-2 px-2 rounded-md border-0 bg-transparent outline-none transition-all duration-300 text-gray-800 hover:text-gray-800 hover:bg-emerald-200 focus:shadow-none cursor-pointer"
                        onClick={() => {
                          if (currentMarketPage() > 1) {
                            setCurrentMarketPage(currentMarketPage() - 1);
                            fetchMarketPage();
                          }
                        }}
                        data-mdb-ripple="true"
                        data-mdb-ripple-color="#10b981"
                      >
                        <span aria-hidden="true">&laquo;</span>
                      </div>
                    </li>
                    {marketPages() > 0 && (
                      <Paged
                        paged={marketPaged}
                        currentPage={currentMarketPage}
                        onPageClick={(page) => {
                          setCurrentMarketPage(page);
                          fetchMarketPage();
                        }}
                      />
                    )}
                    <li class="page-item">
                      <div
                        class="page-link relative block py-2 px-2 rounded-md border-0 bg-transparent outline-none transition-all duration-300 text-gray-800 hover:text-gray-800 hover:bg-emerald-200 focus:shadow-none cursor-pointer"
                        aria-label="Next"
                        onClick={() => {
                          if (currentMarketPage() < marketPages()) {
                            setCurrentMarketPage(currentMarketPage() + 1);
                            fetchMarketPage();
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
  );
};

export default Dashboard;
