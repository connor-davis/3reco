import useState from "../../../hooks/state";
import useNotifications from "../../../hooks/notifications";
import {createSignal, onMount} from "solid-js";
import {createStore} from "solid-js/store";
import axios from "axios";
import apiUrl from "../../../apiUrl";
import Paged from "../../../components/paged/paged";

const AdminMaterials = () => {
    const [authState] = useState('authState');
    const [notifications, addNotification, deleteNotification, clear] =
        useNotifications();

    const [isLoading, setLoading] = createSignal(true);
    const [statusMessage, setStatusMessage] = createSignal('Loading materials.');

    const [materialsPages, setMaterialsPages] = createSignal(0);
    const [currentMaterialsPage, setCurrentMaterialsPage] = createSignal(1);
    const [pageData, setPageData] = createStore([], {name: 'page-data'});
    const [paged, setPaged] = createStore([], {name: 'paged-list'});

    onMount(() => {
        setTimeout(() => {
            getMaterialsPages();
        }, 300);
    });

    const getMaterialsPages = () => {
        axios
            .get(apiUrl + '/admin/materials/pages?limit=10', {
                headers: {
                    Authorization: 'Bearer ' + authState.token,
                },
            })
            .then((response) => {
                setPaged([]);
                setMaterialsPages(response.data.pages);

                for (let i = 0; i < materialsPages(); i++) {
                    setPaged([...paged, i + 1]);
                }

                if (currentMaterialsPage() > materialsPages())
                    setCurrentMaterialsPage(materialsPages());

                fetchMaterialsPage();
            })
            .catch((error) => {
            });
    };

    const fetchMaterialsPage = () => {
        axios
            .get(apiUrl + '/admin/materials/page/' + currentMaterialsPage() + '?limit=10', {
                headers: {
                    Authorization: 'Bearer ' + authState.token,
                },
            })
            .then((response) => {
                setPageData([...response.data.pageData]);

                setLoading(false);
            })
            .catch((error) => {
            });
    };

    return (
        <div class="flex flex-col w-full h-full overflow-y-auto">
            {isLoading() && (
                <div class="flex flex-col w-full h-full justify-center items-center bg-gray-100">
                    <div
                        class="flex space-x-3 justify-center items-center w-auto h-auto rounded-2xl shadow-2xl p-3 bg-gray-100 border-1 border-l border-t border-r border-b border-gray-300">
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
                        <div class="text-xl">Materials</div>
                    </div>

                    <div
                        class="flex flex-col w-full h-full overflow-hidden border-l border-t border-r border-b border-gray-300 rounded-lg">
                        <div class="flex flex-col w-full h-full overflow-auto bg-gray-200">
                            {pageData.length > 0 && (
                                <table>
                                    <thead class="bg-gray-100 border-b border-gray-300">
                                    <tr>
                                        <th
                                            scope="col"
                                            class="text-sm font-medium text-gray-900 px-6 py-4 text-left"
                                        >
                                            Type
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
                                            Owner
                                        </th
>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {pageData.length > 0 &&
                                        pageData.map((material, i) => (
                                            <>
                                                <tr
                                                    class={`bg-gray-100 border-b border-gray-300 transition duration-300 ease-in-out hover:bg-gray-200`}
                                                >
                                                    <td class="text-sm text-gray-900 font-light px-6 py-4 whitespace-nowrap">
                                                        {material.type}
                                                    </td>
                                                    <td class="text-sm text-gray-900 font-light px-6 py-4 max-w-xs truncate">
                                                        R {material.value}/kg
                                                    </td>
                                                    <td class="text-sm text-gray-900 font-light px-6 py-4 max-w-xs truncate">
                                                        {material.owner}
                                                    </td>
                                                </tr>
                                            </>
                                        ))}
                                    </tbody>
                                </table>
                            )}

                            {pageData.length === 0 && (
                                <div class="flex flex-col w-full h-full justify-center items-center">
                                    You have no materials.
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
                                                if (currentMaterialsPage() > 1) {
                                                    setCurrentMaterialsPage(currentMaterialsPage() - 1);
                                                    fetchMaterialsPage();
                                                }
                                            }}
                                            data-mdb-ripple="true"
                                            data-mdb-ripple-color="#10b981"
                                        >
                                            <span aria-hidden="true">&laquo;</span>
                                        </div>
                                    </li>

                                    {materialsPages() > 0 && (
                                        <Paged
                                            paged={paged}
                                            currentPage={currentMaterialsPage}
                                            onPageClick={(page) => {
                                                setCurrentMaterialsPage(page);
                                                fetchMaterialsPage();
                                            }}
                                        />
                                    )}

                                    <li class="page-item">
                                        <div
                                            class="page-link relative block py-2 px-2 rounded-md border-0 bg-transparent outline-none transition-all duration-300 text-gray-800 hover:text-gray-800 hover:bg-emerald-200 focus:shadow-none cursor-pointer"
                                            aria-label="Next"
                                            onClick={() => {
                                                if (currentMaterialsPage() < materialsPages()) {
                                                    setCurrentMaterialsPage(currentMaterialsPage() + 1);
                                                    fetchMaterialsPage();
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

export default AdminMaterials;