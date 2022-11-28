import { createSignal, onMount } from 'solid-js';

import Logo from '../../assets/3rEco-x512.png';
import apiUrl from '../../apiUrl';
import axios from 'axios';
import { useNavigate } from '@solidjs/router';
import useState from '../../hooks/state';

const SetupProfile = () => {
  const navigate = useNavigate();

  const [authState] = useState('authState');
  const [userState, updateUserState] = useState('userState');

  const [currentStep, setCurrentStep] = createSignal(1);

  const [userType, setUserType] = createSignal(undefined);
  const [firstName, setFirstName] = createSignal('');
  const [lastName, setLastName] = createSignal('');
  const [idNumber, setIdNumber] = createSignal('');
  const [businessName, setBusinessName] = createSignal('');
  const [businessRegistrationNumber, setBusinessRegistrationNumber] =
    createSignal('');
  const [streetAddress, setStreetAddress] = createSignal('');
  const [city, setCity] = createSignal('');
  const [areaCode, setAreaCode] = createSignal('');
  const [province, setProvince] = createSignal('');

  onMount(() => {
    setTimeout(() => {
      if (userState.completedProfile) navigate('/', { replace: true });
    }, 300);
  });

  const completeStandardProfile = () => {
    axios
      .put(
        apiUrl + '/users',
        {
          _id: userState._id,
          completedProfile: true,
          firstName: firstName(),
          lastName: lastName(),
          idNumber: idNumber(),
          streetAddress: streetAddress(),
          city: city(),
          areaCode: areaCode(),
          province: province(),
          userType: userType(),
        },
        { headers: { Authorization: 'Bearer ' + authState.token } }
      )
      .then((response) => {
        updateUserState({ ...response.data.data });

        navigate('/');
      })
      .catch((error) => {});
  };

  const completeBusinessProfile = () => {
    axios
      .put(
        apiUrl + '/users',
        {
          _id: userState._id,
          completedProfile: true,
          businessName: businessName(),
          businessRegistrationNumber: businessRegistrationNumber(),
          streetAddress: streetAddress(),
          city: city(),
          areaCode: areaCode(),
          province: province(),
          userType: userType(),
        },
        { headers: { Authorization: 'Bearer ' + authState.token } }
      )
      .then((response) => {
        updateUserState({ ...response.data.data });

        navigate('/');
      })
      .catch((error) => {});
  };

  return (
    <div class="flex flex-col w-full h-full space-y-3 justify-center items-center bg-gray-100">
      <div class="text-2xl">
        <img src={Logo} class="w-32 h-32" />
      </div>
      <div class="text-xl">Setup Profile</div>
      <div class="flex items-center space-x-2 w-96">
        <div
          class={`flex flex-col p-2 w-6 h-6 rounded-full justify-center items-center cursor-pointer ${
            currentStep() === 1 ? 'bg-emerald-500' : 'bg-gray-200 '
          }`}
          onClick={() => userType() !== undefined && setCurrentStep(1)}
        >
          1
        </div>
        <div class="w-full h-1 bg-gray-300"></div>
        <div
          class={`flex flex-col p-2 w-6 h-6 rounded-full justify-center items-center cursor-pointer ${
            currentStep() === 2 ? 'bg-emerald-500' : 'bg-gray-200 '
          }`}
          onClick={() => userType() !== undefined && setCurrentStep(2)}
        >
          2
        </div>
        <div class="w-full h-1 bg-gray-300"></div>
        <div
          class={`flex flex-col p-2 w-6 h-6 rounded-full justify-center items-center cursor-pointer ${
            currentStep() === 3 ? 'bg-emerald-500' : 'bg-gray-200 '
          }`}
          onClick={() => userType() !== undefined && setCurrentStep(3)}
        >
          3
        </div>
      </div>
      <div class="flex flex-col space-y-5 w-96 h-auto border-l border-t border-r border-b border-gray-300 rounded-lg p-5">
        {currentStep() === 1 && (
          <div class="flex flex-col space-y-3 animate-fade-in">
            <div
              class="flex w-full items-center justify-center bg-emerald-500 px-3 py-2 rounded-lg cursor-pointer"
              onClick={() =>
                setUserType('standard') && setCurrentStep(currentStep() + 1)
              }
            >
              Standard
            </div>
            <div
              class="flex w-full items-center justify-center bg-emerald-500 px-3 py-2 rounded-lg cursor-pointer"
              onClick={() =>
                setUserType('business') && setCurrentStep(currentStep() + 1)
              }
            >
              Business
            </div>
          </div>
        )}

        {currentStep() === 2 && userType() === 'standard' && (
          <div class="flex flex-col space-y-3 animate-fade-in">
            <div class="flex flex-col justify-start space-y-2">
              <div>
                First Name <span class="text-red-500">*</span>
              </div>
              <input
                type="text"
                placeholder="Your first name"
                value={firstName()}
                onKeyUp={(event) => setFirstName(event.target.value)}
                class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
              />
            </div>

            <div class="flex flex-col justify-start space-y-2">
              <div>
                Last Name <span class="text-red-500">*</span>
              </div>
              <input
                type="text"
                placeholder="Your last name"
                value={lastName()}
                onKeyUp={(event) => setLastName(event.target.value)}
                class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
              />
            </div>

            <div class="flex flex-col justify-start space-y-2">
              <div>
                ID Number <span class="text-red-500">*</span>
              </div>
              <input
                type="text"
                placeholder="Your id number"
                value={idNumber()}
                onKeyUp={(event) => setIdNumber(event.target.value)}
                class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
              />
            </div>
          </div>
        )}

        {currentStep() === 2 && userType() === 'business' && (
          <div class="flex flex-col space-y-3 animate-fade-in">
            <div class="flex flex-col justify-start space-y-2">
              <div>
                Business Name <span class="text-red-500">*</span>
              </div>
              <input
                type="text"
                placeholder="Your business name"
                value={businessName()}
                onKeyUp={(event) => setBusinessName(event.target.value)}
                class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
              />
            </div>

            <div class="flex flex-col justify-start space-y-2">
              <div>
                Business Registration Number <span class="text-red-500">*</span>
              </div>
              <input
                type="text"
                placeholder="Your business registration number"
                value={businessRegistrationNumber()}
                onKeyUp={(event) =>
                  setBusinessRegistrationNumber(event.target.value)
                }
                class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
              />
            </div>
          </div>
        )}

        {currentStep() === 3 && (
          <div class="flex flex-col space-y-3 animate-fade-in">
            <div class="flex flex-col justify-start space-y-2">
              <div>
                Street Address <span class="text-red-500">*</span>
              </div>
              <input
                type="text"
                placeholder="Your street address"
                value={streetAddress()}
                onKeyUp={(event) => setStreetAddress(event.target.value)}
                class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
              />
            </div>

            <div class="flex flex-col justify-start space-y-2">
              <div>
                City <span class="text-red-500">*</span>
              </div>
              <input
                type="text"
                placeholder="Your city"
                value={city()}
                onKeyUp={(event) => setCity(event.target.value)}
                class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
              />
            </div>

            <div class="flex flex-col justify-start space-y-2">
              <div>
                Area Code <span class="text-red-500">*</span>
              </div>
              <input
                type="text"
                placeholder="Your area code"
                value={areaCode()}
                onKeyUp={(event) => setAreaCode(event.target.value)}
                class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
              />
            </div>

            <div class="flex flex-col justify-start space-y-2">
              <div>
                Province <span class="text-red-500">*</span>
              </div>
              <input
                type="text"
                placeholder="Your province"
                value={province()}
                onKeyUp={(event) => setProvince(event.target.value)}
                class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
              />
            </div>
          </div>
        )}
      </div>
      <div class="flex w-96 items-center">
        {currentStep() > 1 && (
          <div
            class="flex items-center justify-center bg-emerald-500 px-3 py-2 rounded-lg cursor-pointer"
            onClick={() => setCurrentStep(currentStep() - 1)}
          >
            Back
          </div>
        )}
        {currentStep() < 3 && currentStep() > 1 && (
          <div
            class="flex items-center justify-center bg-emerald-500 px-3 ml-auto py-2 rounded-lg cursor-pointer"
            onClick={() => setCurrentStep(currentStep() + 1)}
          >
            Next
          </div>
        )}
        {currentStep() === 3 && (
          <div
            class={`flex items-center justify-center bg-emerald-500 px-3 ml-auto py-2 rounded-lg ${
              (firstName().length > 0 &&
                lastName().length > 0 &&
                idNumber().length > 0 &&
                streetAddress().length > 0 &&
                city().length > 0 &&
                areaCode().length > 0 &&
                province().length > 0 &&
                userType() === 'standard') ||
              (businessName().length > 0 &&
                businessRegistrationNumber().length > 0 &&
                streetAddress().length > 0 &&
                city().length > 0 &&
                areaCode().length > 0 &&
                province().length > 0 &&
                userType() === 'business')
                ? 'cursor-pointer'
                : 'cursor-no-drop'
            }`}
            onClick={() => {
              if (
                businessName().length > 0 &&
                businessRegistrationNumber().length > 0 &&
                streetAddress().length > 0 &&
                city().length > 0 &&
                areaCode().length > 0 &&
                province().length > 0 &&
                userType() === 'business'
              ) {
                completeBusinessProfile();
                return;
              }

              if (
                firstName().length > 0 &&
                lastName().length > 0 &&
                idNumber().length > 0 &&
                streetAddress().length > 0 &&
                city().length > 0 &&
                areaCode().length > 0 &&
                province().length > 0 &&
                userType() === 'standard'
              ) {
                completeStandardProfile();
                return;
              }
            }}
          >
            Finish
          </div>
        )}
      </div>
    </div>
  );
};

export default SetupProfile;
