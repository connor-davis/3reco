import { createSignal, onMount } from 'solid-js';

import Paged from '../../components/paged/paged';
import apiUrl from '../../apiUrl';
import axios from 'axios';
import { createStore } from 'solid-js/store';
import useState from '../../hooks/state';

const Dashboard = () => {
  const [authState] = useState('authState');

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
    }, 300);
  });

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
          <div class="flex items-center w-full h-full space-x-2 overflow-hidden">
            <div class="flex flex-col w-1/2 h-full border-l border-t border-r border-b border-gray-300 rounded-lg">
              <div class="flex justify-between items-center px-3 py-2">
                Your Stock
              </div>
              <div class="flex flex-col w-full h-full space-y-2 overflow-y-auto bg-gray-200 border-t border-b border-gray-300 p-2">
                {pageData.length > 0 &&
                  pageData.map((data) => (
                    <div class="flex flex-col w-full h-auto bg-gray-100 border-l border-t border-r border-b border-gray-300 rounded-md">
                      <div class="flex justify-between items-center border-b border-gray-300 p-3">
                        <div class="text-lg">{data.stockName}</div>
                        <div class="flex items-center justify-center px-3 py-1 bg-emerald-500 rounded-md cursor-pointer">
                          Offer
                        </div>
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
            <div class="flex flex-col w-1/2 h-full border-l border-t border-r border-b border-gray-300 rounded-lg">
              <div class="flex justify-between items-center px-3 py-2">
                Market
              </div>
              <div class="flex flex-col w-full h-full space-y-2 overflow-y-auto bg-gray-200 border-t border-b border-gray-300 p-2">
                {marketPageData.length > 0 &&
                  marketPageData.map((data) => (
                    <div class="flex flex-col w-full h-auto bg-gray-100 border-l border-t border-r border-b border-gray-300 rounded-md">
                      <div class="flex justify-between items-center border-b border-gray-300 p-3">
                        <div class="text-lg">{data.stockName}</div>
                        <div class="flex items-center justify-center px-3 py-1 bg-emerald-500 rounded-md cursor-pointer">
                          Acquire
                        </div>
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
