import Logo from '../../assets/3rEco-x512.png';
import TermsAndConditionsModal from '../../components/modals/tsandcsModal';
import apiUrl from '../../apiUrl';
import axios from 'axios';
import { createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';
import { useNavigate } from '@solidjs/router';
import useState from '../../hooks/state';

const Authentication = () => {
  const [isRegister, setRegister] = createSignal(true);

  return (
    <div class="flex flex-col space-y-2 justify-center items-center">
      <div class="text-2xl">
        <img src={Logo} class="w-32 h-32" />
      </div>

      {isRegister() ? (
        <RegisterForm setRegister={setRegister} />
      ) : (
        <LoginForm setRegister={setRegister} />
      )}
    </div>
  );
};

const LoginForm = ({ setRegister }) => {
  const navigate = useNavigate();

  const [authState, updateAuthState] = useState('authState');
  const [userState, updateUserState] = useState('userState');

  const [message, setMessage] = createStore({}, { name: 'message' });
  const [phoneNumber, setPhoneNumber] = createSignal('');
  const [password, setPassword] = createSignal('');

  const login = () => {
    axios
      .post(
        apiUrl + '/auth/login',
        {
          phoneNumber: phoneNumber(),
          password: password(),
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
      .then((response) => {
        if (response.data.error) {
          setMessage({
            type: 'error',
            value: response.data.message,
          });
        } else {
          setMessage({
            type: 'success',
            value: 'You are logged in.',
          });

          setTimeout(() => {
            updateAuthState({
              authenticated: true,
              token: response.data.data.authenticationToken,
            });

            delete response.data.data.authenticationToken;

            updateUserState({
              ...response.data.data,
            });

            navigate('/', { replace: true });
          }, 1000);
        }
      })
      .catch((error) => {
        setMessage({
          type: 'error',
          value: 'Failed to login to your account.',
        });

        updateAuthState({
          authenticated: false,
          token: undefined,
        });
      });
  };

  return (
    <div class="flex flex-col justify-center items-center space-y-5 w-full h-full">
      <div>
        Don't have an account?{' '}
        <span
          class="text-emerald-500 cursor-pointer"
          onClick={() => setRegister(true)}
        >
          Register
        </span>
      </div>

      {message.type && (
        <div
          class={`${message.type === 'error' && 'text-red-500'} ${
            message.type === 'success' && 'text-emerald-600'
          } w-full text-center animate-fade-in`}
        >
          {message.value}
        </div>
      )}

      <div class="flex flex-col space-y-4 w-96 h-auto rounded-2xl shadow-2xl p-3 bg-gray-100 border-1 border-l border-t border-r border-b border-gray-300">
        <div class="flex flex-col justify-start space-y-2">
          <div>
            Phone Number <span class="text-red-500">*</span>
          </div>
          <input
            type="tel"
            placeholder="Your phone number"
            value={phoneNumber()}
            onChange={(event) => setPhoneNumber(event.target.value)}
            class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
          />
          <div class="text-sm text-gray-500">
            We'll never share your phone number.
          </div>
        </div>

        <div class="flex flex-col justify-start space-y-2">
          <div>
            Password <span class="text-red-500">*</span>
          </div>
          <input
            type="password"
            placeholder="Your password"
            value={password()}
            onChange={(event) => setPassword(event.target.value)}
            class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
          />
        </div>

        <div
          class="flex items-center justify-center bg-emerald-500 px-3 py-2 rounded-lg cursor-pointer"
          onClick={() => login()}
        >
          Login
        </div>
      </div>
    </div>
  );
};

const RegisterForm = ({ setRegister }) => {
  const navigate = useNavigate();

  const [authState, updateAuthState] = useState('authState');
  const [userState, updateUserState] = useState('userState');

  const [phoneNumber, setPhoneNumber] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [confirmPassword, setConfirmPassword] = createSignal('');
  const [message, setMessage] = createStore({}, { name: 'message' });
  const [agreedToTermsAndConditions, setAgreedToTermsAndConditions] =
    createSignal(false);
  const [showTermsAndConditionsModal, setShowTermsAndConditionsModal] =
    createSignal(false);

  const strongPassword = new RegExp(
    '(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9])(?=.{8,})'
  );
  const averagePassword = new RegExp(
    '((?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9])(?=.{6,}))|((?=.*[a-z])(?=.*[A-Z])(?=.*[^A-Za-z0-9])(?=.{8,}))'
  );

  const register = () => {
    if (
      phoneNumber().length === 0 ||
      password().length === 0 ||
      confirmPassword().length === 0
    )
      return setMessage({
        type: 'error',
        value: 'Please fill out all fields.',
      });
    if (!agreedToTermsAndConditions())
      return setMessage({
        type: 'error',
        value: 'You need to agree to the terms and conditions to register.',
      });
    if (password() !== confirmPassword())
      return setMessage({ type: 'error', value: 'Passwords do not match.' });
    else
      axios
        .post(
          apiUrl + '/auth/register',
          {
            phoneNumber: phoneNumber(),
            password: password(),
          },
          {
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )
        .then((response) => {
          if (response.data.error) {
            setMessage({
              type: 'error',
              value: response.data.message,
            });
          } else {
            setMessage({
              type: 'success',
              value: 'You are logged in.',
            });

            setTimeout(() => {
              updateAuthState({
                authenticated: true,
                token: response.data.data.authenticationToken,
              });

              delete response.data.data.authenticationToken;

              updateUserState({
                ...response.data.data,
              });

              navigate('/', { replace: true });
            }, 1000);
          }
        })
        .catch(() => {
          setMessage({
            type: 'error',
            value: 'Failed to register your account.',
          });

          updateAuthState({
            authenticated: false,
            token: undefined,
          });
        });
  };

  return (
    <div class="flex flex-col justify-center items-center space-y-5 w-full h-full">
      {showTermsAndConditionsModal() && (
        <TermsAndConditionsModal
          onAgree={() => {
            setShowTermsAndConditionsModal(false);
            setAgreedToTermsAndConditions(true);
            console.log('User agreed');
          }}
          onDisagree={() => {
            setShowTermsAndConditionsModal(false);
            setAgreedToTermsAndConditions(false);
            console.log('User disagreed');
          }}
          onClose={() => setShowTermsAndConditionsModal(false)}
        />
      )}

      <div>
        Already have an account?{' '}
        <span
          class="text-emerald-500 cursor-pointer"
          onClick={() => setRegister(false)}
        >
          Login
        </span>
      </div>

      {message.type && (
        <div
          class={`${message.type === 'error' && 'text-red-500'} ${
            message.type === 'success' && 'text-emerald-600'
          } w-full text-center animate-fade-in`}
        >
          {message.value}
        </div>
      )}

      <div class="flex flex-col space-y-4 w-96 h-auto rounded-2xl shadow-2xl p-3 bg-gray-100 border-1 border-l border-t border-r border-b border-gray-300">
        <div class="flex flex-col justify-start space-y-2">
          <div>
            Phone Number <span class="text-red-500">*</span>
          </div>
          <input
            type="tel"
            placeholder="Your phone number"
            value={phoneNumber()}
            onKeyUp={(event) => setPhoneNumber(event.target.value)}
            class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
          />
          <div class="text-sm text-gray-500">
            We'll never share your phone number.
          </div>
        </div>

        <div class="flex flex-col justify-start space-y-2">
          <div>
            Password <span class="text-red-500">*</span>
          </div>
          <input
            type="password"
            placeholder="Your password"
            value={password()}
            onKeyUp={(event) => setPassword(event.target.value)}
            class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
          />

          {password().length > 0 && (
            <div class="flex space-x-1 items-center w-full h-auto">
              <div
                class={`flex w-1/3 h-2 rounded-full ${
                  password().length > 7 ||
                  averagePassword.test(password()) ||
                  strongPassword.test(password())
                    ? 'bg-emerald-500'
                    : 'bg-gray-200'
                }`}
              ></div>
              <div
                class={`flex w-1/3 h-2 rounded-full ${
                  averagePassword.test(password()) ||
                  strongPassword.test(password())
                    ? 'bg-emerald-500'
                    : 'bg-gray-200'
                }`}
              ></div>
              <div
                class={`flex w-1/3 h-2 rounded-full  ${
                  strongPassword.test(password())
                    ? 'bg-emerald-500'
                    : 'bg-gray-200'
                }`}
              ></div>
            </div>
          )}
        </div>

        <div class="flex flex-col justify-start space-y-2">
          <div>
            Confirm password <span class="text-red-500">*</span>
          </div>
          <input
            type="password"
            placeholder="Confirm your password"
            value={confirmPassword()}
            onKeyUp={(event) => setConfirmPassword(event.target.value)}
            class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
          />
        </div>

        <div class="flex justify-center items-center w-full space-x-2">
          <div
            class={`flex flex-col justify-center items-center w-5 h-5 rounded-full cursor-pointer ${
              agreedToTermsAndConditions() ? 'bg-emerald-500' : 'bg-gray-400'
            }`}
            onClick={() =>
              setAgreedToTermsAndConditions(!agreedToTermsAndConditions())
            }
          ></div>
          <div
            class="text-sm cursor-pointer hover:text-emerald-500"
            onClick={() => setShowTermsAndConditionsModal(true)}
          >
            Terms and Conditions
          </div>
        </div>

        <div
          class={`flex items-center justify-center bg-emerald-500 px-3 py-2 rounded-lg ${
            confirmPassword() === password() &&
            confirmPassword().length > 0 &&
            password().length > 0 &&
            phoneNumber().length > 0
              ? 'cursor-pointer'
              : 'cursor-no-drop'
          }`}
          onClick={() => {
            if (
              confirmPassword() === password() &&
              confirmPassword().length > 0 &&
              password().length > 0 &&
              phoneNumber().length > 0
            ) {
              register();
            }
          }}
        >
          Register
        </div>
      </div>
    </div>
  );
};

export default Authentication;
