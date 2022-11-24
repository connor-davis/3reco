import { createSignal, onMount } from 'solid-js';

import AddStockModal from '../../components/modals/stock/add';
import EditStockModal from '../../components/modals/stock/edit';
import Paged from '../../components/paged/paged';
import apiUrl from '../../apiUrl';
import axios from 'axios';
import { createStore } from 'solid-js/store';
import useState from '../../hooks/state';

const Stock = () => {
  const [authState] = useState('authState');

  const [isLoading, setLoading] = createSignal(true);
  const [statusMessage, setStatusMessage] = createSignal('Loading stock.');

  const [stockPages, setStockPages] = createSignal(0);
  const [currentStockPage, setCurrentStockPage] = createSignal(1);
  const [pageData, setPageData] = createStore([], { name: 'page-data' });
  const [paged, setPaged] = createStore([], { name: 'paged-list' });

  const [materials, setMaterials] = createStore([], { name: 'materials-list' });

  onMount(() => {
    setTimeout(() => {
      getStockPages();
      fetchMaterials();
    }, 300);
  });

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

  const fetchMaterials = () => {
    axios
      .get(apiUrl + '/materials', {
        headers: {
          Authorization: 'Bearer ' + authState.token,
        },
      })
      .then((response) => {
        response.data.data.map((material) => {
          setMaterials([...materials, material]);
        });
      })
      .catch((error) => {});
  };

  const addStock = (data) => {
    axios
      .post(
        apiUrl + '/stock',
        {
          stockName: data.name,
          stockDescription: data.description,
          stockWeight: data.weight,
          stockType: data.type,
          stockValue: data.value,
        },
        {
          headers: {
            Authorization: 'Bearer ' + authState.token,
          },
        }
      )
      .then((response) => {
        getStockPages();
      })
      .catch((error) => {});
  };

  const editStock = (id, data) => {
    axios
      .put(
        apiUrl + '/stock/',
        {
          _id: id,
          stockName: data.name,
          stockDescription: data.description,
          stockWeight: data.weight,
          stockType: data.type,
          stockValue: data.value,
        },
        { headers: { Authorization: 'Bearer ' + authState.token } }
      )
      .then((response) => {
        getStockPages();
      })
      .catch((error) => {});
  };

  const deleteStock = (id) => {
    axios
      .delete(apiUrl + '/stock/' + id, {
        headers: {
          Authorization: 'Bearer ' + authState.token,
        },
      })
      .then((_) => {
        getStockPages();
      })
      .catch((error) => {});
  };

  return (
    <div class="flex flex-col w-full h-full overflow-y-auto">
      <AddStockModal materials={materials} onAdd={(data) => addStock(data)} />

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
          <div class="flex justify-between items-center">
            <div class="text-xl">Your Stock</div>
            <div
              class="flex items-center justify-center px-3 py-1 rounded-md hover:text-emerald-500 hover:bg-emerald-100 transition duration-300 ease-in-out cursor-pointer"
              data-mdb-ripple="true"
              data-mdb-ripple-color="#10b981"
              data-bs-toggle="modal"
              data-bs-target="#addStockModal"
            >
              Add
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
                        class="text-sm font-medium text-gray-900 px-6 py-4 text-left"
                      >
                        Name
                      </th>
                      <th
                        scope="col"
                        class="text-sm font-medium text-gray-900 px-6 py-4 text-left"
                      >
                        Description
                      </th>
                      <th
                        scope="col"
                        class="text-sm font-medium text-gray-900 px-6 py-4 text-left"
                      >
                        Weight
                      </th>
                      <th
                        scope="col"
                        class="text-sm font-medium text-gray-900 px-6 py-4 text-left"
                      >
                        Value
                      </th>
                      <th
                        scope="col"
                        class="text-sm font-medium text-gray-900 px-6 py-4 text-left"
                      >
                        Type
                      </th>
                      <th
                        scope="col"
                        class="text-sm font-medium text-gray-900 px-6 py-4 text-left"
                      ></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.length > 0 &&
                      pageData.map((stock, i) => (
                        <>
                          <EditStockModal
                            data={stock}
                            materials={materials}
                            onEdit={(data) => editStock(stock._id, data)}
                          />

                          <tr
                            class={`bg-gray-100 border-b border-gray-300 transition duration-300 ease-in-out hover:bg-gray-200`}
                          >
                            <td class="text-sm text-gray-900 font-light px-6 py-4 whitespace-nowrap">
                              {stock.stockName}
                            </td>
                            <td class="text-sm text-gray-900 font-light px-6 py-4 max-w-xs truncate">
                              {stock.stockDescription}
                            </td>
                            <td class="text-sm text-gray-900 font-light px-6 py-4 whitespace-nowrap">
                              {stock.stockWeight} kg
                            </td>
                            <td class="text-sm text-gray-900 font-light px-6 py-4 whitespace-nowrap">
                              R {stock.stockValue}
                            </td>
                            <td class="text-sm text-gray-900 font-light px-6 py-4 whitespace-nowrap">
                              {stock.stockType}
                            </td>
                            <td class="flex justify-end space-x-2 text-sm text-gray-900 font-light px-6 py-4 whitespace-nowrap">
                              <div
                                class="flex items-center justify-center px-3 py-1 bg-emerald-500 rounded-md cursor-pointer"
                                data-bs-toggle="modal"
                                data-bs-target={`#editStockModal-${stock._id}`}
                              >
                                Edit
                              </div>
                              <div
                                class="flex items-center justify-center px-3 py-1 bg-red-500 rounded-md cursor-pointer"
                                onClick={() => deleteStock(stock._id)}
                              >
                                Delete
                              </div>
                            </td>
                          </tr>
                        </>
                      ))}
                  </tbody>
                </table>
              )}

              {pageData.length === 0 && (
                <div class="flex flex-col w-full h-full justify-center items-center">
                  You have no stock.
                </div>
              )}
            </div>
            <div class="flex justify-center items-center w-full border-t border-gray-300 bg-gray-100 p-3">
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
      )}
    </div>
  );
};

export default Stock;
