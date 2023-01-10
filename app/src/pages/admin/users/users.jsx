import useState from "../../../hooks/state";
import useNotifications from "../../../hooks/notifications";
import {createSignal, onMount} from "solid-js";
import {createStore} from "solid-js/store";
import axios from "axios";
import apiUrl from "../../../apiUrl";

const AdminUsers = () => {
    const [authState] = useState('authState');
    const [notifications, addNotification, deleteNotification, clear] =
        useNotifications();

    const [isLoading, setLoading] = createSignal(true);
    const [statusMessage, setStatusMessage] = createSignal('Loading users.');

    const [usersPages, setUsersPages] = createSignal(0);
    const [currentUsersPage, setCurrentUsersPage] = createSignal(1);
    const [pageData, setPageData] = createStore([], {name: 'page-data'});
    const [paged, setPaged] = createStore([], {name: 'paged-list'});

    onMount(() => {
        setTimeout(() => {
            getUsersPages();
        }, 300);
    });

    const getUsersPages = () => {
        axios
            .get(apiUrl + '/admin/users/pages?limit=10', {
                headers: {
                    Authorization: 'Bearer ' + authState.token,
                },
            })
            .then((response) => {
                setPaged([]);
                setUsersPages(response.data.pages);

                for (let i = 0; i < usersPages(); i++) {
                    setPaged([...paged, i + 1]);
                }

                if (currentUsersPage() > usersPages())
                    setCurrentUsersPage(usersPages());

                getUsersPage();
            })
            .catch((error) => {
            });
    };

    const getUsersPage = () => {
        axios
            .get(apiUrl + '/admin/users/page/' + currentUsersPage() + '?limit=10', {
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

    const resetPassword = (id) => {
        axios
            .get(apiUrl + '/admin/passwordReset/' + id,
                {
                    headers: {
                        Authorization: 'Bearer ' + authState.token
                    }
                }
            )
            .then((response) => {
                if (response.data.error) {
                    addNotification('Error', response.data.message);
                } else {
                    addNotification('Success', 'The password reset link has been copied to your clipboard. You can send it to the user.');

                    navigator.clipboard.writeText(response.data.link);
                }
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
                        <div class="text-xl">Users</div>
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
                                            First Name
                                        </th>
                                        <th
                                            scope="col"
                                            class="text-sm font-medium text-gray-900 px-6 py-4 text-left"
                                        >
                                            Last Name
                                        </th>
                                        <th
                                            scope="col"
                                            class="text-sm font-medium text-gray-900 px-6 py-4 text-left"
                                        >
                                            Phone Number
                                        </th
                                        >
                                        <th
                                            scope="col"
                                            class="text-sm font-medium text-gray-900 px-6 py-4 text-left"
                                        >
                                        </th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {pageData.length > 0 &&
                                        pageData.map((user, i) => (
                                            <>
                                                <tr
                                                    class={`bg-gray-100 border-b border-gray-300 transition duration-300 ease-in-out hover:bg-gray-200`}
                                                >
                                                    <td class="text-sm text-gray-900 font-light px-6 py-4 whitespace-nowrap">
                                                        {user.firstName}
                                                    </td>
                                                    <td class="text-sm text-gray-900 font-light px-6 py-4 max-w-xs truncate">
                                                        {user.lastName}
                                                    </td>
                                                    <td class="text-sm text-gray-900 font-light px-6 py-4 max-w-xs truncate">
                                                        {user.phoneNumber}
                                                    </td>
                                                    <td class="flex justify-end space-x-2 text-sm text-gray-900 font-light px-6 py-4 whitespace-nowrap">
                                                        <div
                                                            class="flex items-center justify-center px-3 py-1 rounded-md hover:text-emerald-500 hover:bg-emerald-100 transition duration-300 ease-in-out cursor-pointer"
                                                            data-mdb-ripple="true"
                                                            data-mdb-ripple-color="#10b981"
                                                            onClick={() => resetPassword(user._id)}
                                                        >
                                                            Reset Password
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
                                    You have no users.
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
                                                if (currentUsersPage() > 1) {
                                                    setCurrentUsersPage(currentUsersPage() - 1);
                                                    getUsersPage();
                                                }
                                            }}
                                            data-mdb-ripple="true"
                                            data-mdb-ripple-color="#10b981"
                                        >
                                            <span aria-hidden="true">&laquo;</span>
                                        </div>
                                    </li>

                                    {usersPages() > 0 &&
                                        paged.map((paged) => (
                                                <div
                                                    class={`flex flex-col justify-center items-center py-1.5 px-3 rounded-md border-0 ${
                                                        currentUsersPage() === paged ? 'bg-emerald-400' : 'bg-transparent'
                                                    } outline-none transition-all duration-300 text-gray-800 hover:text-emerald-500 hover:bg-emerald-100 focus:shadow-none cursor-pointer`}
                                                    onClick={() => {
                                                        setCurrentUsersPage(paged);
                                                        getUsersPage();
                                                    }}
                                                    data-mdb-ripple="true"
                                                    data-mdb-ripple-color="#10b981"
                                                >
                                                    {paged}
                                                </div>
                                            )
                                        )}

                                    <li class="page-item">
                                        <div
                                            class="page-link relative block py-2 px-2 rounded-md border-0 bg-transparent outline-none transition-all duration-300 text-gray-800 hover:text-gray-800 hover:bg-emerald-200 focus:shadow-none cursor-pointer"
                                            aria-label="Next"
                                            onClick={() => {
                                                if (currentUsersPage() < usersPages()) {
                                                    setCurrentUsersPage(currentUsersPage() + 1);
                                                    getUsersPage();
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

export default AdminUsers;