import { createSignal, onMount } from 'solid-js';

import AddMaterialModal from '../../components/modals/materials/add';
import EditMaterialModal from '../../components/modals/materials/edit';
import Paged from '../../components/paged/paged';
import apiUrl from '../../apiUrl';
import axios from 'axios';
import { createStore } from 'solid-js/store';
import useNotifications from '../../hooks/notifications';
import useState from '../../hooks/state';
import moment from 'moment';

const Transactions = () => {
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
      .get(apiUrl + '/transactions/pages?limit=10', {
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

        fetchTransactionsPage();
      })
      .catch((error) => {});
  };

  const fetchTransactionsPage = () => {
    axios
      .get(
        apiUrl +
          '/transactions/page/' +
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
      .get(apiUrl + '/transactions/export', {
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
            <div class="text-xl">Your Transactions</div>
            <div
              class="flex items-center justify-center px-3 py-1 rounded-md hover:text-emerald-500 hover:bg-emerald-100 transition duration-300 ease-in-out cursor-pointer"
              data-mdb-ripple="true"
              data-mdb-ripple-color="#10b981"
              onClick={() => exportTransactions()}
            >
              Export
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
                        <tr
                          class={`bg-gray-100 border-b border-gray-300 transition duration-300 ease-in-out hover:bg-gray-200`}
                        >
                          <td class="text-sm text-gray-900 font-light px-2 md:px-6 py-2 md:py-4 whitespace-nowrap">
                            {moment(transaction.date).format(
                              'DD/MM/YYY HH:MM A'
                            )}
                          </td>
                          <td class="text-sm text-gray-900 font-light px-2 md:px-6 py-2 md:py-4 whitespace-nowrap">
                            {transaction.seller}
                          </td>
                          <td class="text-sm text-gray-900 font-light px-2 md:px-6 py-2 md:py-4 whitespace-nowrap">
                            {transaction.sellerPhoneNumber}
                          </td>
                          <td class="text-sm text-gray-900 font-light px-2 md:px-6 py-2 md:py-4 whitespace-nowrap">
                            {transaction.buyer}
                          </td>
                          <td class="text-sm text-gray-900 font-light px-2 md:px-6 py-2 md:py-4 whitespace-nowrap">
                            {transaction.buyerPhoneNumber}
                          </td>
                          <td class="text-sm text-gray-900 font-light px-2 md:px-6 py-2 md:py-4 whitespace-nowrap">
                            {transaction.stockType}
                          </td>
                          <td class="text-sm text-gray-900 font-light px-2 md:px-6 py-2 md:py-4 whitespace-nowrap">
                            {transaction.weight} kg
                          </td>
                          <td class="text-sm text-gray-900 font-light px-2 md:px-6 py-2 md:py-4 whitespace-nowrap">
                            R {transaction.value}
                          </td>
                        </tr>
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
                          fetchTransactionsPage();
                        }
                      }}
                      data-mdb-ripple="true"
                      data-mdb-ripple-color="#10b981"
                    >
                      <span aria-hidden="true">&laquo;</span>
                    </div>
                  </li>

                  {transactionsPages() > 0 && (
                    <Paged
                      paged={paged}
                      currentPage={currentTransactionsPage}
                      onPageClick={(page) => {
                        setCurrentTransactionsPage(page);
                        fetchTransactionsPage();
                      }}
                    />
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
                          fetchTransactionsPage();
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

export default Transactions;
