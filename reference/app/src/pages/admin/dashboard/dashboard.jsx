import {createSignal, onMount} from "solid-js";
import useNotifications from "../../../hooks/notifications";
import axios from "axios";
import apiUrl from "../../../apiUrl";
import useState from "../../../hooks/state";

const AdminDashboard = () => {
    const [authState] = useState("authState");

    const [usersCount, setUsersCount] = createSignal(0);
    const [materialsCount, setMaterialsCount] = createSignal(0);

    const [notificationsState, addNotification, deleteNotification, clear] =
        useNotifications();

    const [isLoading, setLoading] = createSignal(true);
    const [statusMessage, setStatusMessage] = createSignal('Loading dashboard.');

    onMount(() => {
        setTimeout(() => {
            loadUsersCount();
        }, 300);
    });

    const loadUsersCount = () => {
        axios.get(apiUrl + "/admin/users/count", {
            headers: {
                "Authorization": "Bearer " + authState.token
            }
        }).then((response) => {
            if (response.data.data.error) {
                addNotification("Error", response.data.message);
            } else {
                setUsersCount(response.data.data);

                loadMaterialsCount()
            }
        })
    };

    const loadMaterialsCount = () => {
        axios.get(apiUrl + "/admin/materials/count", {
            headers: {
                "Authorization": "Bearer " + authState.token
            }
        }).then((response) => {
            if (response.data.data.error) {
                addNotification("Error", response.data.message);
            } else {
                setMaterialsCount(response.data.data);

                setLoading(false);
            }
        })
    };

    return (
        <div class="flex flex-col w-full h-full overflow-y-auto">
            {isLoading() && (
                <div class="flex flex-col w-full h-full justify-center items-center bg-gray-100">
                    <div
                        class="flex space-x-3 justify-center items-center w-auto h-auto rounded-md md:rounded-2xl shadow-2xl p-1 md:p-3 bg-gray-100 border-1 border-l border-t border-r border-b border-gray-300">
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
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="flex flex-col w-full justify-center items-center py-20 bg-emerald-100 text-emerald-500 border-l border-t border-r border-b border-emerald-200 rounded-md">{usersCount()} users</div>
                        <div class="flex flex-col w-full justify-center items-center py-20 bg-emerald-100 text-emerald-500 border-l border-t border-r border-b border-emerald-200 rounded-md">{materialsCount()} materials</div>
                    </div>
                </div>
            )}
        </div>
    )
};

export default AdminDashboard;