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

  const [image, setImage] = createSignal('');
  const [editingImage, setEditingImage] = createSignal(false);
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

  const [streetAddress, setStreetAddress] = createSignal('');
  const [editingStreetAddress, setEditingStreetAddress] = createSignal(false);
  const [city, setCity] = createSignal('');
  const [editingCity, setEditingCity] = createSignal(false);
  const [areaCode, setAreaCode] = createSignal('');
  const [editingAreaCode, setEditingAreaCode] = createSignal(false);
  const [province, setProvince] = createSignal('');
  const [editingProvince, setEditingProvince] = createSignal(false);

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

        setTimeout(() => {
          setImage(userState.image);
          
          setFirstName(userState.firstName);
          setLastName(userState.lastName);
          setIdNumber(userState.idNumber);
          setBusinessName(userState.businessName);
          setBusinessRegistrationNumber(userState.businessName);

          setStreetAddress(userState.streetAddress);
          setCity(userState.city);
          setAreaCode(userState.areaCode);
          setProvince(userState.province);

          setLoading(false);
        }, 100);
      })
      .catch((error) => {});
  };

  const updateProfile = (key, value) => {
    const data = {};

    data._id = userState._id;
    data[key] = value;

    axios
      .put(apiUrl + '/users', data, {
        headers: { Authorization: 'Bearer ' + authState.token },
      })
      .then((response) => {
        if (!response.data.error) {
          updateUserState({ ...response.data.data });

          console.log(userState);

          setTimeout(() => {
            setImage(userState.image);

            setFirstName(userState.firstName);
            setLastName(userState.lastName);
            setIdNumber(userState.idNumber);
            setBusinessName(userState.businessName);
            setBusinessRegistrationNumber(userState.businessName);

            setStreetAddress(userState.streetAddress);
            setCity(userState.city);
            setAreaCode(userState.areaCode);
            setProvince(userState.province);

            addNotification('Success', 'Your profile has been updated.');
          }, 100);
        } else {
          addNotification('Error', response.data.message);
        }
      })
      .catch((error) => {});
  };

  const getUserInitials = () => {
    if (!userState.image) {
      if (userState.userType === 'business') {
        if (userState.businessName) {
          const businessNameSplit = userState.businessName.split(' ');

          return (
            businessNameSplit[0] + businessNameSplit[businessNameSplit.length]
          );
        } else return 'B';
      } else if (userState.userType === 'standard') {
        if (userState.firstName && userState.lastName) {
          const firstNameSplit = userState.firstName.split('');
          const lastNameSplit = userState.lastName.split('');

          return firstNameSplit[0] + lastNameSplit[0];
        } else return 'S';
      } else {
        return 'A';
      }
    }
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

              {currentStep() === 1 &&
                (userState.userType === 'standard' ? (
                  <div class="flex flex-col w-full h-full overflow-y-auto space-y-2 p-3">
                    <div class="flex flex-col w-full h-auto p-3 border-l border-t border-r border-b border-gray-300 bg-gray-100 rounded-lg">
                      <div class="flex flex-col justify-start space-y-2">
                        <div class="flex justify-between items-center">
                          <div>Your Profile Image</div>
                          {editingImage() ? (
                            <div
                              class="flex items-center space-x-2 text-sm py-2 px-3 rounded-md overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap hover:text-emerald-500 hover:bg-emerald-100 transition duration-300 ease-in-out cursor-pointer"
                              data-mdb-ripple="true"
                              data-mdb-ripple-color="#10b981"
                              onClick={() => {
                                setEditingImage(false);
                                updateProfile('image', image());
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
                                setEditingImage(true);
                              }}
                            >
                              Edit
                            </div>
                          )}
                        </div>
                        <div class="flex items-center justify-center">
                          {image() === '' && (
                            <div class="flex flex-col justify-center items-center w-32 h-32 rounded-full bg-gray-200 border-l border-t border-r border-b border-gray-300 cursor-pointer">
                              {getUserInitials()}
                            </div>
                          )}

                          {image() !== '' && (
                            <img
                              src={image()}
                              class="flex flex-col justify-center items-center w-32 h-32 rounded-full bg-gray-200 border-l border-t border-r border-b border-gray-300 cursor-pointer object-cover"
                              onClick={() => {
                                let inputElement =
                                  document.createElement('input');

                                inputElement.setAttribute('type', 'file');

                                inputElement.click();

                                inputElement.addEventListener(
                                  'change',
                                  (event) => {
                                    let file = event.target.files[0];
                                    let reader = new FileReader();

                                    reader.readAsDataURL(file);

                                    reader.onload = (_) => {
                                      setImage(reader.result);
                                    };
                                  }
                                );
                              }}
                            />
                          )}
                        </div>
                      </div>
                    </div>
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
                ))}
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
                        <div>Your Street Address</div>
                        {editingStreetAddress() ? (
                          <div
                            class="flex items-center space-x-2 text-sm py-2 px-3 rounded-md overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap hover:text-emerald-500 hover:bg-emerald-100 transition duration-300 ease-in-out cursor-pointer"
                            data-mdb-ripple="true"
                            data-mdb-ripple-color="#10b981"
                            onClick={() => {
                              setEditingStreetAddress(false);
                              updateProfile('streetAddress', streetAddress());
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
                              setEditingStreetAddress(true);
                            }}
                          >
                            Edit
                          </div>
                        )}
                      </div>
                      <input
                        type="text"
                        placeholder="Your street address"
                        value={streetAddress()}
                        onChange={(event) =>
                          setStreetAddress(event.target.value)
                        }
                        class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
                        disabled={!editingStreetAddress()}
                      />
                    </div>
                  </div>
                  <div class="flex flex-col w-full h-auto p-3 border-l border-t border-r border-b border-gray-300 bg-gray-100 rounded-lg">
                    <div class="flex flex-col justify-start space-y-2">
                      <div class="flex justify-between items-center">
                        <div>Your City</div>
                        {editingCity() ? (
                          <div
                            class="flex items-center space-x-2 text-sm py-2 px-3 rounded-md overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap hover:text-emerald-500 hover:bg-emerald-100 transition duration-300 ease-in-out cursor-pointer"
                            data-mdb-ripple="true"
                            data-mdb-ripple-color="#10b981"
                            onClick={() => {
                              setEditingCity(false);
                              updateProfile('city', city());
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
                              setEditingCity(true);
                            }}
                          >
                            Edit
                          </div>
                        )}
                      </div>
                      <input
                        type="text"
                        placeholder="Your city"
                        value={city()}
                        onChange={(event) => setCity(event.target.value)}
                        class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
                        disabled={!editingCity()}
                      />
                    </div>
                  </div>
                  <div class="flex flex-col w-full h-auto p-3 border-l border-t border-r border-b border-gray-300 bg-gray-100 rounded-lg">
                    <div class="flex flex-col justify-start space-y-2">
                      <div class="flex justify-between items-center">
                        <div>Your Area Code</div>
                        {editingAreaCode() ? (
                          <div
                            class="flex items-center space-x-2 text-sm py-2 px-3 rounded-md overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap hover:text-emerald-500 hover:bg-emerald-100 transition duration-300 ease-in-out cursor-pointer"
                            data-mdb-ripple="true"
                            data-mdb-ripple-color="#10b981"
                            onClick={() => {
                              setEditingAreaCode(false);
                              updateProfile('areaCode', areaCode());
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
                              setEditingAreaCode(true);
                            }}
                          >
                            Edit
                          </div>
                        )}
                      </div>
                      <input
                        type="text"
                        placeholder="Your area code"
                        value={areaCode()}
                        onChange={(event) => setAreaCode(event.target.text)}
                        class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
                        disabled={!editingAreaCode()}
                      />
                    </div>
                  </div>
                  <div class="flex flex-col w-full h-auto p-3 border-l border-t border-r border-b border-gray-300 bg-gray-100 rounded-lg">
                    <div class="flex flex-col justify-start space-y-2">
                      <div class="flex justify-between items-center">
                        <div>Your Province</div>
                        {editingProvince() ? (
                          <div
                            class="flex items-center space-x-2 text-sm py-2 px-3 rounded-md overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap hover:text-emerald-500 hover:bg-emerald-100 transition duration-300 ease-in-out cursor-pointer"
                            data-mdb-ripple="true"
                            data-mdb-ripple-color="#10b981"
                            onClick={() => {
                              setEditingProvince(false);
                              updateProfile('province', province());
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
                              setEditingProvince(true);
                            }}
                          >
                            Edit
                          </div>
                        )}
                      </div>
                      <input
                        type="tel"
                        placeholder="Your province"
                        value={province()}
                        onChange={(event) => setProvince(event.target.text)}
                        class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
                        disabled={!editingProvince()}
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
