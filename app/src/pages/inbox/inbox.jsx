import { createSignal, onMount } from 'solid-js';

import ComposeModal from '../../components/modals/compose/compose';
import DeleteInboxModal from '../../components/modals/deleteInbox/deleteInbox';
import Paged from '../../components/paged/paged';
import apiUrl from '../../apiUrl';
import axios from 'axios';
import { createStore } from 'solid-js/store';
import { useNavigate } from '@solidjs/router';
import useNotifications from '../../hooks/notifications';
import useState from '../../hooks/state';

const Inbox = () => {
  const navigate = useNavigate();

  const [authState, updateAuthState, clearAuthState] = useState('authState');
  const [userState, updateUserState, clearUserState] = useState('userState');
  const [notificationsState, addNotification, deleteNotification, clear] =
    useNotifications();

  const [isLoading, setLoading] = createSignal(true);
  const [statusMessage, setStatusMessage] = createSignal('Loading inbox.');

  const [inboxPages, setInboxPages] = createSignal(0);
  const [currentInboxPage, setCurrentInboxPage] = createSignal(1);
  const [pageData, setPageData] = createStore([], { name: 'page-data' });
  const [paged, setPaged] = createStore([], { name: 'paged-list' });

  onMount(() => {
    setTimeout(() => {
      getInboxPages();
    }, 300);
  });

  const getInboxPages = () => {
    axios
      .get(apiUrl + '/inbox/pages?limit=10', {
        headers: {
          Authorization: 'Bearer ' + authState.token,
        },
      })
      .then((response) => {
        setPaged([]);
        setInboxPages(response.data.pages);

        for (let i = 0; i < inboxPages(); i++) {
          setPaged([...paged, i + 1]);
        }

        if (currentInboxPage() > inboxPages())
          setCurrentInboxPage(inboxPages());

        fetchInboxPage();
      })
      .catch((error) => {});
  };

  const fetchInboxPage = () => {
    axios
      .get(apiUrl + '/inbox/page/' + currentInboxPage() + '?limit=10', {
        headers: {
          Authorization: 'Bearer ' + authState.token,
        },
      })
      .then((response) => {
        setPageData([...response.data.pageData].reverse());
        setLoading(false);
      })
      .catch((error) => {});
  };

  const deleteInbox = (id) => {
    axios
      .delete(apiUrl + '/inbox/' + id, {
        headers: { Authorization: 'Bearer ' + authState.token },
      })
      .then((response) => {
        if (response.data.error) {
          addNotification('Error', response.data.message);
        } else {
          getInboxPages();
        }
      })
      .catch((error) => {});
  };

  const getUserImage = (user) => {
    if (!user.image) {
      if (user.userType === 'business') {
        if (user.businessName) {
          const businessNameSplit = user.businessName.split(' ');

          if (businessNameSplit.length > 1) {
            return (
              businessNameSplit[0].substring(0, 1) +
              businessNameSplit[businessNameSplit.length - 1].substring(0, 1)
            );
          } else {
            return userState.businessName.substring(0, 1);
          }
        } else return 'B';
      } else if (user.userType === 'standard') {
        if (user.firstName && user.lastName) {
          const firstNameSplit = user.firstName.split('');
          const lastNameSplit = user.lastName.split('');

          return firstNameSplit[0] + lastNameSplit[0];
        } else return 'S';
      } else {
        return 'A';
      }
    } else return user.image;
  };

  return (
    <div class="flex flex-col w-full h-full overflow-y-auto">
      <ComposeModal />

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
            <div class="text-xl">Your Inbox</div>
            <div
              class="flex items-center space-x-2 text-sm py-2 px-3 rounded-md overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap hover:text-emerald-500 hover:bg-emerald-100 transition duration-300 ease-in-out cursor-pointer"
              data-mdb-ripple="true"
              data-mdb-ripple-color="#10b981"
              data-bs-toggle="modal"
              data-bs-target="#composeModal"
            >
              Compose
            </div>
          </div>
          <div class="flex flex-col w-full h-full overflow-hidden">
            <div class="flex flex-col w-full h-full p-3 border-l border-t border-r border-gray-300 rounded-t-lg bg-gray-200 overflow-y-auto space-y-2">
              {pageData.length > 0 &&
                pageData.map((item, i) => (
                  <>
                    <DeleteInboxModal onDelete={() => deleteInbox(item._id)} />

                    <div class="flex flex-col w-full h-auto bg-gray-100 border-l border-t border-r border-b border-gray-300 rounded-md">
                      <div class="flex items-center space-x-5 border-gray-300 p-3">
                        <div class="flex items-center w-full space-x-10">
                          <div class="flex items-center space-x-2">
                            <div class="shrink-0">
                              {getUserImage(item.sender).length > 2 && (
                                <img
                                  src={getUserImage(item.sender)}
                                  class="rounded-full w-10 h-10 bg-gray-200 object-cover"
                                />
                              )}

                              {getUserImage(item.sender).length <= 2 && (
                                <div class="flex flex-col justify-center items-center rounded-full w-10 h-10 bg-emerald-500">
                                  {getUserImage(item.sender)}
                                </div>
                              )}
                            </div>
                            <div class="text-lg font-semibold">
                              {item.sender.userType === 'standard'
                                ? item.sender.firstName +
                                  ' ' +
                                  item.sender.lastName
                                : item.sender.businessName}
                            </div>
                          </div>
                          <div class="flex items-center space-x-2">
                            <div class="text-lg shrink-0">{item.title}</div>
                            <div class="text-lg text-gray-400">-</div>
                            <div class="text-lg w-full max-w-2xl truncate text-gray-400">
                              {item.content}
                            </div>
                          </div>
                        </div>
                        <div class="flex items-center space-x-2">
                          <div
                            class="flex items-center space-x-2 text-sm py-2 px-3 rounded-md overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap hover:text-emerald-500 hover:bg-emerald-100 transition duration-300 ease-in-out cursor-pointer"
                            data-mdb-ripple="true"
                            data-mdb-ripple-color="#10b981"
                            onClick={() => navigate('/inbox/' + item._id)}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke-width="1.5"
                              stroke="currentColor"
                              class="w-4 h-4"
                            >
                              <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                              />
                              <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                            </svg>
                          </div>
                          <div
                            class="flex items-center space-x-2 text-sm py-2 px-3 rounded-md overflow-hidden text-gray-700 text-ellipsis whitespace-nowrap hover:text-red-500 hover:bg-red-100 transition duration-300 ease-in-out cursor-pointer"
                            data-mdb-ripple="true"
                            data-mdb-ripple-color="#ef4444"
                            data-bs-toggle="modal"
                            data-bs-target="#deleteInboxModal"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke-width="1.5"
                              stroke="currentColor"
                              class="w-4 h-4"
                            >
                              <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                              />
                            </svg>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                ))}

              {pageData.length === 0 && (
                <div class="flex flex-col w-full h-full justify-center items-center">
                  You have nothing in your inbox.
                </div>
              )}
            </div>
            <div class="flex justify-center items-center w-full border-l border-t border-r border-b border-gray-300 rounded-b-lg bg-gray-100 p-3">
              <nav>
                <ul class="flex list-style-none space-x-2">
                  <li class="page-item">
                    <div
                      class="page-link relative block py-2 px-2 rounded-md border-0 bg-transparent outline-none transition-all duration-300 text-gray-800 hover:text-gray-800 hover:bg-emerald-200 focus:shadow-none cursor-pointer"
                      onClick={() => {
                        if (currentInboxPage() > 1) {
                          setCurrentInboxPage(currentInboxPage() - 1);
                          fetchInboxPage();
                        }
                      }}
                      data-mdb-ripple="true"
                      data-mdb-ripple-color="#10b981"
                    >
                      <span aria-hidden="true">&laquo;</span>
                    </div>
                  </li>

                  {inboxPages() > 0 && (
                    <Paged
                      paged={paged}
                      currentPage={currentInboxPage}
                      onPageClick={(page) => {
                        setCurrentInboxPage(page);
                        fetchInboxPage();
                      }}
                    />
                  )}

                  <li class="page-item">
                    <div
                      class="page-link relative block py-2 px-2 rounded-md border-0 bg-transparent outline-none transition-all duration-300 text-gray-800 hover:text-gray-800 hover:bg-emerald-200 focus:shadow-none cursor-pointer"
                      aria-label="Next"
                      onClick={() => {
                        if (currentInboxPage() < inboxPages()) {
                          setCurrentInboxPage(currentInboxPage() + 1);
                          fetchInboxPage();
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

export default Inbox;
