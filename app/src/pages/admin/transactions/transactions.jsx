import useState from '../../../hooks/state';
import useNotifications from '../../../hooks/notifications';
import { createSignal, onMount } from 'solid-js';
import { createStore } from 'solid-js/store';
import axios from 'axios';
import apiUrl from '../../../apiUrl';

const AdminTransactions = () => {
  const [authState] = useState('authState');
  const [notifications, addNotification, deleteNotification, clear] =
    useNotifications();

  const [isLoading, setLoading] = createSignal(true);
  const [statusMessage, setStatusMessage] = createSignal(
    'Loading transactions.'
  );

  const [transactionsPages, setTransactionsPages] = createSignal(0);
  const [currentTransactionsPage, setCurrentTransactionsPage] = createSignal(1);
  const [pageData, setPageData] = createStore([], { name: 'page-data' });
  const [paged, setPaged] = createStore([], { name: 'paged-list' });

  onMount(() => {
    setTimeout(() => {
      getTransactionsPages();
    }, 300);
  });

  const getTransactionsPages = () => {
    axios
      .get(apiUrl + '/admin/transactions/pages?limit=10', {
        headers: {
          Authorization: 'Bearer ' + authState.token,
        },
      })
      .then((response) => {
        setPaged([]);
        setTransactionsPages(response.data.pages);

        for (let i = 0; i < transactionsPages(); i++) {
          setPaged([...paged, i + 1]);
        }

        if (currentTransactionsPage() > transactionsPages())
          setCurrentTransactionsPage(transactionsPages());

        getTransactionsPage();
      })
      .catch((error) => {});
  };

  const getTransactionsPage = () => {
    axios
      .get(
        apiUrl +
          '/admin/transactions/page/' +
          currentTransactionsPage() +
          '?limit=10',
        {
          headers: {
            Authorization: 'Bearer ' + authState.token,
          },
        }
      )
      .then((response) => {
        setPageData([...response.data.pageData]);

        setLoading(false);
      })
      .catch((error) => {});
  };

  const exportTransactions = () => {
    axios
      .get(apiUrl + '/admin/transactions/users', {
        responseType: 'blob',
        headers: { Authorization: 'Bearer ' + authState.token },
      })
      .then((response) => {
        if (response.data.error) return console.log(response.data);
        else {
          if (response.status === 200) {
            saveAs(response.data, `transactions.xlsx`);

            return addNotification(
              'Transactions',
              'The file will be downloaded now.'
            );
          }
        }
      });
  };

  return (
    <div class="flex flex-col w-full h-full overflow-y-auto">
      {isLoading() && (
        <div class="flex flex-col w-full h-full justify-center items-center bg-gray-100">
          <div class="flex space-x-3 justify-center items-center w-auto h-auto rounded-md md:rounded-2xl shadow-2xl p-1 md:p-3 bg-gray-100 border-1 border-l border-t border-r border-b border-gray-300">
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
          <div class="flex justify-between items-center">
            <div class="text-xl">Users</div>
            <div
              class="flex items-center space-x-0 md:space-x-2 justify-center px-3 py-1 rounded-md hover:text-emerald-500 hover:bg-emerald-100 transition duration-300 ease-in-out cursor-pointer"
              data-mdb-ripple="true"
              data-mdb-ripple-color="#10b981"
              onClick={() => exportTransactions()}
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
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                />
              </svg>
              <div class="hidden md:block">Export</div>
            </div>
          </div>

          <div class="flex flex-col w-full h-full overflow-hidden border-l border-t border-r border-b border-gray-300 rounded-lg">
            <div class="flex flex-col w-full h-full overflow-auto bg-gray-200">
              {pageData.length > 0 && (
                <table>
                  <thead class="bg-gray-100 border-b border-gray-300">
                    <tr>
                      <th
                        scope="col"
                        class="text-sm font-medium text-gray-900 px-2 md:px-6 py-2 md:py-4 text-left"
                      >
                        Date
                      </th>
                      <th
                        scope="col"
                        class="text-sm font-medium text-gray-900 px-2 md:px-6 py-2 md:py-4 text-left"
                      >
                        Seller
                      </th>
                      <th
                        scope="col"
                        class="text-sm font-medium text-gray-900 px-2 md:px-6 py-2 md:py-4 text-left"
                      >
                        Seller Phone Number
                      </th>
                      <th
                        scope="col"
                        class="text-sm font-medium text-gray-900 px-2 md:px-6 py-2 md:py-4 text-left"
                      >
                        Buyer
                      </th>
                      <th
                        scope="col"
                        class="text-sm font-medium text-gray-900 px-2 md:px-6 py-2 md:py-4 text-left"
                      >
                        Buyer Phone Number
                      </th>
                      <th
                        scope="col"
                        class="text-sm font-medium text-gray-900 px-2 md:px-6 py-2 md:py-4 text-left"
                      >
                        Stock Type
                      </th>
                      <th
                        scope="col"
                        class="text-sm font-medium text-gray-900 px-2 md:px-6 py-2 md:py-4 text-left"
                      >
                        Weight
                      </th>
                      <th
                        scope="col"
                        class="text-sm font-medium text-gray-900 px-2 md:px-6 py-2 md:py-4 text-left"
                      >
                        Value
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.length > 0 &&
                      pageData.map((transaction, i) => (
                        <>
                          <tr
                            class={`bg-gray-100 border-b border-gray-300 transition duration-300 ease-in-out hover:bg-gray-200`}
                          >
                            <td class="text-sm text-gray-900 font-light px-2 md:px-6 py-2 md:py-4 whitespace-nowrap">
                              {transaction.date}
                            </td>
                            <td class="text-sm text-gray-900 font-light px-2 md:px-6 py-2 md:py-4 max-w-xs truncate">
                              {transaction.seller}
                            </td>
                            <td class="text-sm text-gray-900 font-light px-2 md:px-6 py-2 md:py-4 max-w-xs truncate">
                              {transaction.sellerPhoneNumber}
                            </td>
                            <td class="text-sm text-gray-900 font-light px-2 md:px-6 py-2 md:py-4 max-w-xs truncate">
                              {transaction.buyer}
                            </td>
                            <td class="text-sm text-gray-900 font-light px-2 md:px-6 py-2 md:py-4 max-w-xs truncate">
                              {transaction.buyerPhoneNumber}
                            </td>
                            <td class="text-sm text-gray-900 font-light px-2 md:px-6 py-2 md:py-4 max-w-xs truncate">
                              {transaction.stockType}
                            </td>
                            <td class="text-sm text-gray-900 font-light px-2 md:px-6 py-2 md:py-4 max-w-xs truncate">
                              {transaction.weight} kg
                            </td>
                            <td class="text-sm text-gray-900 font-light px-2 md:px-6 py-2 md:py-4 max-w-xs truncate">
                              R {transaction.value}
                            </td>
                          </tr>
                        </>
                      ))}
                  </tbody>
                </table>
              )}

              {pageData.length === 0 && (
                <div class="flex flex-col w-full h-full justify-center items-center">
                  You have no transactions.
                </div>
              )}
            </div>

            <div class="flex justify-center items-center w-full border-t border-gray-300 bg-gray-100 p-1 md:p-3">
              <nav>
                <ul class="flex list-style-none space-x-2">
                  <li class="page-item">
                    <div
                      class="page-link relative block py-2 px-2 rounded-md border-0 bg-transparent outline-none transition-all duration-300 text-gray-800 hover:text-gray-800 hover:bg-emerald-200 focus:shadow-none cursor-pointer"
                      onClick={() => {
                        if (currentTransactionsPage() > 1) {
                          setCurrentTransactionsPage(
                            currentTransactionsPage() - 1
                          );
                          getTransactionsPage();
                        }
                      }}
                      data-mdb-ripple="true"
                      data-mdb-ripple-color="#10b981"
                    >
                      <span aria-hidden="true">&laquo;</span>
                    </div>
                  </li>

                  {transactionsPages() < 6 ? (
                    paged.map((paged) => (
                      <div
                        class={`flex flex-col justify-center items-center py-1.5 px-3 rounded-md border-0 ${
                          currentTransactionsPage() === paged
                            ? 'bg-emerald-400'
                            : 'bg-transparent'
                        } outline-none transition-all duration-300 text-gray-800 hover:text-emerald-500 hover:bg-emerald-100 focus:shadow-none cursor-pointer`}
                        onClick={() => setCurrentTransactionsPage(paged)}
                        data-mdb-ripple="true"
                        data-mdb-ripple-color="#10b981"
                      >
                        {paged}
                      </div>
                    ))
                  ) : (
                    <div class="flex items-center space-x-2">
                      {currentTransactionsPage() > 1 && (
                        <div
                          class={`flex flex-col justify-center items-center py-1.5 px-3 rounded-md border-0 outline-none transition-all duration-300 text-gray-800 hover:text-emerald-500 hover:bg-emerald-100 focus:shadow-none cursor-pointer`}
                          onClick={() => {
                            setCurrentTransactionsPage(1);
                          }}
                          data-mdb-ripple="true"
                          data-mdb-ripple-color="#10b981"
                        >
                          1
                        </div>
                      )}
                      {currentTransactionsPage() > 2 && (
                        <div class="flex items-center space-x-2">
                          <div>...</div>
                        </div>
                      )}
                      {currentTransactionsPage() < paged.length - 3 &&
                        paged
                          .slice(
                            currentTransactionsPage() - 1,
                            currentTransactionsPage() + 3
                          )
                          .map((paged, index) => (
                            <div
                              class={`flex flex-col justify-center items-center py-1.5 px-3 rounded-md border-0 ${
                                currentTransactionsPage() === paged
                                  ? 'bg-emerald-400'
                                  : 'bg-transparent'
                              } outline-none transition-all duration-300 text-gray-800 hover:text-emerald-500 hover:bg-emerald-100 focus:shadow-none cursor-pointer`}
                              onClick={() => {
                                setCurrentTransactionsPage(paged);
                              }}
                              data-mdb-ripple="true"
                              data-mdb-ripple-color="#10b981"
                            >
                              {paged}
                            </div>
                          ))}
                      {currentTransactionsPage() > paged.length - 4 && (
                        <div class="flex items-center space-x-2">
                          <div class="flex items-center space-x-2">
                            <div
                              class={`flex flex-col justify-center items-center py-1.5 px-3 rounded-md border-0 ${
                                currentTransactionsPage() === paged.length - 3
                                  ? 'bg-emerald-400'
                                  : 'bg-transparent'
                              } outline-none transition-all duration-300 text-gray-800 hover:text-emerald-500 hover:bg-emerald-100 focus:shadow-none cursor-pointer`}
                              onClick={() => {
                                setCurrentTransactionsPage(paged.length - 3);
                              }}
                              data-mdb-ripple="true"
                              data-mdb-ripple-color="#10b981"
                            >
                              {paged.length - 3}
                            </div>
                            <div
                              class={`flex flex-col justify-center items-center py-1.5 px-3 rounded-md border-0 ${
                                currentTransactionsPage() === paged.length - 2
                                  ? 'bg-emerald-400'
                                  : 'bg-transparent'
                              } outline-none transition-all duration-300 text-gray-800 hover:text-emerald-500 hover:bg-emerald-100 focus:shadow-none cursor-pointer`}
                              onClick={() => {
                                setCurrentTransactionsPage(paged.length - 2);
                              }}
                              data-mdb-ripple="true"
                              data-mdb-ripple-color="#10b981"
                            >
                              {paged.length - 2}
                            </div>
                            <div
                              class={`flex flex-col justify-center items-center py-1.5 px-3 rounded-md border-0 ${
                                currentTransactionsPage() === paged.length - 1
                                  ? 'bg-emerald-400'
                                  : 'bg-transparent'
                              } outline-none transition-all duration-300 text-gray-800 hover:text-emerald-500 hover:bg-emerald-100 focus:shadow-none cursor-pointer`}
                              onClick={() => {
                                setCurrentTransactionsPage(paged.length - 1);
                              }}
                              data-mdb-ripple="true"
                              data-mdb-ripple-color="#10b981"
                            >
                              {paged.length - 1}
                            </div>
                            <div
                              class={`flex flex-col justify-center items-center py-1.5 px-3 rounded-md border-0 ${
                                currentTransactionsPage() === paged.length
                                  ? 'bg-emerald-400'
                                  : 'bg-transparent'
                              } outline-none transition-all duration-300 text-gray-800 hover:text-emerald-500 hover:bg-emerald-100 focus:shadow-none cursor-pointer`}
                              onClick={() => {
                                setCurrentTransactionsPage(paged.length);
                              }}
                              data-mdb-ripple="true"
                              data-mdb-ripple-color="#10b981"
                            >
                              {paged.length}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <li class="page-item">
                    <div
                      class="page-link relative block py-2 px-2 rounded-md border-0 bg-transparent outline-none transition-all duration-300 text-gray-800 hover:text-gray-800 hover:bg-emerald-200 focus:shadow-none cursor-pointer"
                      aria-label="Next"
                      onClick={() => {
                        if (currentTransactionsPage() < transactionsPages()) {
                          setCurrentTransactionsPage(
                            currentTransactionsPage() + 1
                          );
                          getTransactionsPage();
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
      )}
    </div>
  );
};

export default AdminTransactions;
