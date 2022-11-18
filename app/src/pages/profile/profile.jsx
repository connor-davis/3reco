import { createSignal, onMount } from 'solid-js';

import LogoutModal from '../../components/modals/logout/logout';
import apiUrl from '../../apiUrl';
import axios from 'axios';
import { useNavigate } from '@solidjs/router';
import useNotifications from '../../hooks/notifications';
import useState from '../../hooks/state';

const Profile = () => {
  const navigate = useNavigate();

  const [authState, updateAuthState, clearAuthState] = useState('authState');
  const [userState, updateUserState, clearUserState] = useState('userState');
  const [notificationsState, addNotification, deleteNotification, clear] =
    useNotifications();

  const [isLoading, setLoading] = createSignal(true);
  const [statusMessage, setStatusMessage] = createSignal('Loading profile.');

  const [currentStep, setCurrentStep] = createSignal(1);

  const [firstName, setFirstName] = createSignal('');
  const [editingFirstName, setEditingFirstName] = createSignal(false);
  const [lastName, setLastName] = createSignal('');
  const [editingLastName, setEditingLastName] = createSignal(false);
  const [idNumber, setIdNumber] = createSignal('');
  const [editingIdNumber, setEditingIdNumber] = createSignal(false);
  const [businessName, setBusinessName] = createSignal('');
  const [editingBusinessName, setEditingBusinessName] = createSignal(false);
  const [businessRegistrationNumber, setBusinessRegistrationNumber] =
    createSignal('');
  const [
    editingBusinessRegistrationNumber,
    setEditingBusinessRegistrationNumber,
  ] = createSignal(false);

  onMount(() => {
    setTimeout(() => {
      getProfile();
    }, 300);
  });

  const getProfile = () => {
    axios
      .get(apiUrl + '/users', {
        headers: { Authorization: 'Bearer ' + authState.token },
      })
      .then((response) => {
        updateUserState({ ...response.data.data });

        setFirstName(userState.firstName);
        setLastName(userState.lastName);
        setIdNumber(userState.idNumber);
        setBusinessName(userState.businessName);
        setBusinessRegistrationNumber(userState.businessName);

        setLoading(false);
      })
      .catch((error) => {});
  };

  const updateProfile = (key, value) => {
    console.log(key, value);
  };

  const logout = () => {
    addNotification('Logout', 'You will be logged out in 3 seconds.');

    setTimeout(() => {
      clearAuthState();
      clearUserState();

      clear();

      window.location.href = '/';
    }, 3000);
  };

  return (
    <div class="flex flex-col w-full h-full overflow-y-auto">
      <LogoutModal onLogout={() => logout()} />

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
            <div class="text-xl">Your Profile</div>
            <div
              class="flex items-center space-x-2 text-sm py-2 px-3 rounded-md overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap hover:text-red-500 hover:bg-red-100 transition duration-300 ease-in-out cursor-pointer"
              data-mdb-ripple="true"
              data-mdb-ripple-color="#ef4444"
              data-bs-toggle="modal"
              data-bs-target="#logoutModal"
            >
              Logout
            </div>
          </div>

          <div class="flex flex-col space-y-2 w-full h-full overflow-hidden">
            <div
              class={`flex flex-col w-full rounded-lg border-l border-t border-r border-b border-gray-300 ${
                currentStep() === 1 ? 'h-full bg-gray-200' : 'h-auto'
              }`}
            >
              <div
                class={`flex justify-between items-center p-3 bg-gray-100 cursor-pointer ${
                  currentStep() === 1
                    ? 'rounded-t-lg border-b border-gray-300'
                    : 'rounded-lg'
                }`}
                onClick={() => setCurrentStep(1)}
              >
                <div>Details</div>
                <div></div>
              </div>

              {currentStep() === 1 && userState.userType === 'standard' ? (
                <div class="flex flex-col w-full h-full overflow-y-auto space-y-2 p-3">
                  <div class="flex flex-col w-full h-auto p-3 border-l border-t border-r border-b border-gray-300 bg-gray-100 rounded-lg"></div>
                  <div class="flex flex-col w-full h-auto p-3 border-l border-t border-r border-b border-gray-300 bg-gray-100 rounded-lg">
                    <div class="flex flex-col justify-start space-y-2">
                      <div class="flex justify-between items-center">
                        <div>Your First Name</div>
                        {editingFirstName() ? (
                          <div
                            class="flex items-center space-x-2 text-sm py-2 px-3 rounded-md overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap hover:text-emerald-500 hover:bg-emerald-100 transition duration-300 ease-in-out cursor-pointer"
                            data-mdb-ripple="true"
                            data-mdb-ripple-color="#10b981"
                            onClick={() => {
                              setEditingFirstName(false);
                              updateProfile('firstName', firstName());
                            }}
                          >
                            Finish
                          </div>
                        ) : (
                          <div
                            class="flex items-center space-x-2 text-sm py-2 px-3 rounded-md overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap hover:text-emerald-500 hover:bg-emerald-100 transition duration-300 ease-in-out cursor-pointer"
                            data-mdb-ripple="true"
                            data-mdb-ripple-color="#10b981"
                            onClick={() => {
                              setEditingFirstName(true);
                            }}
                          >
                            Edit
                          </div>
                        )}
                      </div>
                      <input
                        type="tel"
                        placeholder="Your first Name"
                        value={firstName()}
                        onChange={(event) => setFirstName(event.target.value)}
                        class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
                        disabled={!editingFirstName()}
                      />
                    </div>
                  </div>
                  <div class="flex flex-col w-full h-auto p-3 border-l border-t border-r border-b border-gray-300 bg-gray-100 rounded-lg">
                    <div class="flex flex-col justify-start space-y-2">
                      <div class="flex justify-between items-center">
                        <div>Your Last Name</div>
                        {editingLastName() ? (
                          <div
                            class="flex items-center space-x-2 text-sm py-2 px-3 rounded-md overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap hover:text-emerald-500 hover:bg-emerald-100 transition duration-300 ease-in-out cursor-pointer"
                            data-mdb-ripple="true"
                            data-mdb-ripple-color="#10b981"
                            onClick={() => {
                              setEditingLastName(false);
                              updateProfile('lastName', lastName());
                            }}
                          >
                            Finish
                          </div>
                        ) : (
                          <div
                            class="flex items-center space-x-2 text-sm py-2 px-3 rounded-md overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap hover:text-emerald-500 hover:bg-emerald-100 transition duration-300 ease-in-out cursor-pointer"
                            data-mdb-ripple="true"
                            data-mdb-ripple-color="#10b981"
                            onClick={() => {
                              setEditingLastName(true);
                            }}
                          >
                            Edit
                          </div>
                        )}
                      </div>
                      <input
                        type="tel"
                        placeholder="Your first Name"
                        value={lastName()}
                        onChange={(event) => setLastName(event.target.value)}
                        class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
                        disabled={!editingLastName()}
                      />
                    </div>
                  </div>
                  <div class="flex flex-col w-full h-auto p-3 border-l border-t border-r border-b border-gray-300 bg-gray-100 rounded-lg">
                    <div class="flex flex-col justify-start space-y-2">
                      <div class="flex justify-between items-center">
                        <div>Your ID Number</div>
                        {editingIdNumber() ? (
                          <div
                            class="flex items-center space-x-2 text-sm py-2 px-3 rounded-md overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap hover:text-emerald-500 hover:bg-emerald-100 transition duration-300 ease-in-out cursor-pointer"
                            data-mdb-ripple="true"
                            data-mdb-ripple-color="#10b981"
                            onClick={() => {
                              setEditingIdNumber(false);
                              updateProfile('idNumber', idNumber());
                            }}
                          >
                            Finish
                          </div>
                        ) : (
                          <div
                            class="flex items-center space-x-2 text-sm py-2 px-3 rounded-md overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap hover:text-emerald-500 hover:bg-emerald-100 transition duration-300 ease-in-out cursor-pointer"
                            data-mdb-ripple="true"
                            data-mdb-ripple-color="#10b981"
                            onClick={() => {
                              setEditingIdNumber(true);
                            }}
                          >
                            Edit
                          </div>
                        )}
                      </div>
                      <input
                        type="text"
                        placeholder="Your id number"
                        value={idNumber()}
                        onChange={(event) => setIdNumber(event.target.value)}
                        class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
                        disabled={!editingIdNumber()}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div class="flex flex-col w-full h-full overflow-y-auto space-y-2 p-3">
                  <div class="flex flex-col w-full h-auto p-3 border-l border-t border-r border-b border-gray-300 bg-gray-100 rounded-lg"></div>
                  <div class="flex flex-col w-full h-auto p-3 border-l border-t border-r border-b border-gray-300 bg-gray-100 rounded-lg">
                    <div class="flex flex-col justify-start space-y-2">
                      <div class="flex justify-between items-center">
                        <div>Your Business Name</div>
                        {editingBusinessName() ? (
                          <div
                            class="flex items-center space-x-2 text-sm py-2 px-3 rounded-md overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap hover:text-emerald-500 hover:bg-emerald-100 transition duration-300 ease-in-out cursor-pointer"
                            data-mdb-ripple="true"
                            data-mdb-ripple-color="#10b981"
                            onClick={() => {
                              setEditingBusinessName(false);
                              updateProfile('businessName', businessName());
                            }}
                          >
                            Finish
                          </div>
                        ) : (
                          <div
                            class="flex items-center space-x-2 text-sm py-2 px-3 rounded-md overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap hover:text-emerald-500 hover:bg-emerald-100 transition duration-300 ease-in-out cursor-pointer"
                            data-mdb-ripple="true"
                            data-mdb-ripple-color="#10b981"
                            onClick={() => {
                              setEditingBusinessName(true);
                            }}
                          >
                            Edit
                          </div>
                        )}
                      </div>
                      <input
                        type="text"
                        placeholder="Your business registration number"
                        value={businessName()}
                        onChange={(event) =>
                          setBusinessName(event.target.value)
                        }
                        class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
                        disabled={!editingBusinessName()}
                      />
                    </div>
                  </div>
                  <div class="flex flex-col w-full h-auto p-3 border-l border-t border-r border-b border-gray-300 bg-gray-100 rounded-lg">
                    <div class="flex flex-col justify-start space-y-2">
                      <div class="flex justify-between items-center">
                        <div>Your Business Registration Number</div>
                        {editingBusinessRegistrationNumber() ? (
                          <div
                            class="flex items-center space-x-2 text-sm py-2 px-3 rounded-md overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap hover:text-emerald-500 hover:bg-emerald-100 transition duration-300 ease-in-out cursor-pointer"
                            data-mdb-ripple="true"
                            data-mdb-ripple-color="#10b981"
                            onClick={() => {
                              setEditingBusinessRegistrationNumber(false);
                              updateProfile(
                                'businessRegistrationNumber',
                                businessRegistrationNumber()
                              );
                            }}
                          >
                            Finish
                          </div>
                        ) : (
                          <div
                            class="flex items-center space-x-2 text-sm py-2 px-3 rounded-md overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap hover:text-emerald-500 hover:bg-emerald-100 transition duration-300 ease-in-out cursor-pointer"
                            data-mdb-ripple="true"
                            data-mdb-ripple-color="#10b981"
                            onClick={() => {
                              setEditingBusinessRegistrationNumber(true);
                            }}
                          >
                            Edit
                          </div>
                        )}
                      </div>
                      <input
                        type="text"
                        placeholder="Your business registration number"
                        value={businessRegistrationNumber()}
                        onChange={(event) =>
                          setBusinessRegistrationNumber(event.target.value)
                        }
                        class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
                        disabled={!editingBusinessRegistrationNumber()}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div
              class={`flex flex-col w-full rounded-lg border-l border-t border-r border-b border-gray-300 ${
                currentStep() === 2 ? 'h-full bg-gray-200' : 'h-auto'
              }`}
            >
              <div
                class={`flex justify-between items-center p-3 bg-gray-100 cursor-pointer ${
                  currentStep() === 2
                    ? 'rounded-t-lg border-b border-gray-300'
                    : 'rounded-lg'
                }`}
                onClick={() => setCurrentStep(2)}
              >
                <div>Location</div>
                <div></div>
              </div>

              {currentStep() === 2 && (
                <div class="flex flex-col w-full h-full overflow-y-auto space-y-2 p-3">
                  <div class="flex flex-col w-full h-auto p-3 border-l border-t border-r border-b border-gray-300 bg-gray-100 rounded-lg">
                    <div class="flex flex-col justify-start space-y-2">
                      <div class="flex justify-between items-center">
                        <div>Your First Name</div>
                        <div
                          class="flex items-center space-x-2 text-sm py-2 px-3 rounded-md overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap hover:text-emerald-500 hover:bg-emerald-100 transition duration-300 ease-in-out cursor-pointer"
                          data-mdb-ripple="true"
                          data-mdb-ripple-color="#10b981"
                        >
                          Edit
                        </div>
                      </div>
                      <input
                        type="tel"
                        placeholder="Your first Name"
                        value={firstName()}
                        class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
                        disabled={!editingFirstName()}
                      />
                    </div>
                  </div>
                  <div class="flex flex-col w-full h-auto p-3 border-l border-t border-r border-b border-gray-300 bg-gray-100 rounded-lg">
                    <div class="flex flex-col justify-start space-y-2">
                      <div class="flex justify-between items-center">
                        <div>Your First Name</div>
                        <div
                          class="flex items-center space-x-2 text-sm py-2 px-3 rounded-md overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap hover:text-emerald-500 hover:bg-emerald-100 transition duration-300 ease-in-out cursor-pointer"
                          data-mdb-ripple="true"
                          data-mdb-ripple-color="#10b981"
                        >
                          Edit
                        </div>
                      </div>
                      <input
                        type="tel"
                        placeholder="Your first Name"
                        value={firstName()}
                        class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
                        disabled={!editingFirstName()}
                      />
                    </div>
                  </div>
                  <div class="flex flex-col w-full h-auto p-3 border-l border-t border-r border-b border-gray-300 bg-gray-100 rounded-lg">
                    <div class="flex flex-col justify-start space-y-2">
                      <div class="flex justify-between items-center">
                        <div>Your First Name</div>
                        <div
                          class="flex items-center space-x-2 text-sm py-2 px-3 rounded-md overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap hover:text-emerald-500 hover:bg-emerald-100 transition duration-300 ease-in-out cursor-pointer"
                          data-mdb-ripple="true"
                          data-mdb-ripple-color="#10b981"
                        >
                          Edit
                        </div>
                      </div>
                      <input
                        type="tel"
                        placeholder="Your first Name"
                        value={firstName()}
                        class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
                        disabled={!editingFirstName()}
                      />
                    </div>
                  </div>
                  <div class="flex flex-col w-full h-auto p-3 border-l border-t border-r border-b border-gray-300 bg-gray-100 rounded-lg">
                    <div class="flex flex-col justify-start space-y-2">
                      <div class="flex justify-between items-center">
                        <div>Your First Name</div>
                        <div
                          class="flex items-center space-x-2 text-sm py-2 px-3 rounded-md overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap hover:text-emerald-500 hover:bg-emerald-100 transition duration-300 ease-in-out cursor-pointer"
                          data-mdb-ripple="true"
                          data-mdb-ripple-color="#10b981"
                        >
                          Edit
                        </div>
                      </div>
                      <input
                        type="tel"
                        placeholder="Your first Name"
                        value={firstName()}
                        class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
                        disabled={!editingFirstName()}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
