import {createSignal, onMount} from 'solid-js';

import Logo from '../../assets/3rEco-x512.png';
import apiUrl from '../../apiUrl';
import axios from 'axios';
import useNotifications from "../../hooks/notifications";

const ResetPassword = () => {
    const [notificationsState, addNotification, deleteNotification, clear] =
        useNotifications();

    let href = document.location.href;
    let hrefSize = href.split('/').length;
    let token = href.split('/')[hrefSize - 1];

    const [password, setPassword] = createSignal('');
    const [confirmPassword, setConfirmPassword] = createSignal('');

    const resetPassword = () => {
        axios
            .post(
                apiUrl + '/admin/passwordReset/',
                {
                    newPassword: password(),
                    token: token
                }
            )
            .then((response) => {
                console.log(response.data);

                if (!response.data.success) {
                    addNotification("Error", response.data.data.message);
                } else {
                    addNotification("Success", "Your password has been reset.");

                    setTimeout(() => {
                        window.location.href = "/";
                    }, 2000);
                }
            })
            .catch((error) => {
            });
    };

    return (
        <div class="flex flex-col w-full h-full space-y-3 justify-center items-center bg-gray-100">
            <div class="text-2xl">
                <img src={Logo} class="w-32 h-32"/>
            </div>
            <div class="text-xl">Reset Password</div>
            <div class="flex items-center space-x-2 w-96">
                <div
                    class="flex flex-col space-y-5 w-96 h-auto border-l border-t border-r border-b border-gray-300 rounded-lg p-5 bg-white">
                    <div class="flex flex-col justify-start space-y-2">
                        <div>
                            Password <span class="text-red-500">*</span>
                        </div>
                        <input
                            type="password"
                            placeholder="New password"
                            value={password()}
                            onKeyUp={(event) => setPassword(event.target.value)}
                            class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
                        />
                    </div>
                    <div class="flex flex-col justify-start space-y-2">
                        <div>
                            Confirm Password <span class="text-red-500">*</span>
                        </div>
                        <input
                            type="password"
                            placeholder="Confirm new password"
                            value={confirmPassword()}
                            onKeyUp={(event) => setConfirmPassword(event.target.value)}
                            class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
                        />
                    </div>
                    <div
                        class={`flex w-full items-center justify-center bg-emerald-500 px-3 ml-auto py-2 rounded-lg`}
                        onClick={() => {
                            if (
                                password() !== "" && confirmPassword() !== "" && password() === confirmPassword()
                            ) {
                                resetPassword();
                            }
                        }}
                    >
                        Continue
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ResetPassword;
