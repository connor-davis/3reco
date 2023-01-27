import { createSignal } from 'solid-js';
import useState from '../../../hooks/state';

const EditStockModal = ({ data, materials, onEdit = (data) => {} }) => {
  const [authState] = useState('authState');

  const [name, setName] = createSignal(data.stockName);
  const [description, setDescription] = createSignal(data.stockDescription);
  const [weight, setWeight] = createSignal(data.stockWeight);
  const [value, setValue] = createSignal(data.stockValue);
  const [type, setType] = createSignal({
    type: data.stockType,
    value: data.stockValue / data.stockWeight,
  });

  const updateValue = () => {
    if (weight() > 0 && type().type !== 'Choose Type') {
      setValue(weight() * type().value);
    }
  };

  return (
    <div
      class="modal fade fixed top-0 left-0 hidden w-full h-full outline-none overflow-x-hidden overflow-y-auto"
      id={`editStockModal-${data._id}`}
      tabindex="-1"
      aria-labelledby={`editStockModal-${data._id}`}
      aria-modal="true"
      role="dialog"
    >
      <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable relative w-auto pointer-events-none">
        <div class="modal-content border-none shadow-lg relative flex flex-col w-full pointer-events-auto bg-white bg-clip-padding rounded-md outline-none text-current">
          <div class="modal-header flex flex-shrink-0 items-center justify-between p-4 border-b border-gray-200 rounded-t-md">
            <h5
              class="text-xl font-medium leading-normal text-gray-800"
              id="exampleModalCenteredScrollableLabel"
            >
              Edit Stock
            </h5>
            <button
              type="button"
              class="btn-close box-content w-4 h-4 p-1 text-black border-none rounded-none opacity-50 focus:shadow-none focus:outline-none focus:opacity-100 hover:text-black hover:opacity-75 hover:no-underline"
              data-bs-dismiss="modal"
              aria-label="Close"
            ></button>
          </div>
          <div class="modal-body relative p-4 flex flex-col w-full h-full max-h-96">
            <div class="flex flex-col space-y-3 w-full h-full overflow-y-auto">
              <div class="flex flex-col justify-start space-y-2">
                <div>
                  Name <span class="text-red-500">*</span>
                </div>
                <input
                  type="text"
                  placeholder="Name"
                  value={name()}
                  onKeyUp={(event) => setName(event.target.value)}
                  class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
                />
                <div class="text-sm text-gray-500">
                  What would you like to call your stock?
                </div>
              </div>
              <div class="flex flex-col justify-start space-y-2">
                <div>
                  Description <span class="text-red-500">*</span>
                </div>
                <textarea
                  placeholder="Description"
                  value={description()}
                  onKeyUp={(event) => setDescription(event.target.value)}
                  class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
                ></textarea>
                <div class="text-sm text-gray-500">Describe your stock.</div>
              </div>
              <div class="flex flex-col justify-start space-y-2">
                <div>
                  Weight <span class="text-red-500">*</span>
                </div>
                <input
                  type="number"
                  placeholder="Weight (kg)"
                  value={weight()}
                  onKeyUp={(event) => {
                    setWeight(event.target.value);
                    updateValue();
                  }}
                  class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
                />
                <div class="text-sm text-gray-500">
                  What is the weight of this stock.
                </div>
              </div>
              <div class="flex flex-col justify-start space-y-2">
                <div>
                  Type <span class="text-red-500">*</span>
                </div>
                <div>
                  <div class="dropdown relative">
                    <button
                      class="dropdown-toggle w-full px-6 py-2.5 bg-emerald-500 text-white font-medium text-xs leading-tight uppercase rounded-md hover:bg-emerald-600 focus:bg-emerald-600 focus:outline-none focus:ring-0 active:bg-emerald-700 active:text-white transition duration-150 ease-in-out flex justify-between items-center whitespace-nowrap"
                      type="button"
                      id="dropdownMenuButton1"
                      data-bs-toggle="dropdown"
                      aria-expanded="false"
                    >
                      <div>{type().type}</div>
                      <svg
                        aria-hidden="true"
                        focusable="false"
                        data-prefix="fas"
                        data-icon="caret-down"
                        class="w-2 ml-2"
                        role="img"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 320 512"
                      >
                        <path
                          fill="currentColor"
                          d="M31.3 192h257.3c17.8 0 26.7 21.5 14.1 34.1L174.1 354.8c-7.8 7.8-20.5 7.8-28.3 0L17.2 226.1C4.6 213.5 13.5 192 31.3 192z"
                        ></path>
                      </svg>
                    </button>
                    <ul
                      class="dropdown-menu min-w-max absolute bg-white text-base z-50 float-left py-2 list-none text-left rounded-lg shadow-lg mt-1 hidden m-0 bg-clip-padding border-none w-full h-auto max-h-32 overflow-y-auto"
                      aria-labelledby="dropdownMenuButton1"
                    >
                      {materials.length > 0 &&
                        materials.map((material) => (
                          <li>
                            <div
                              class="dropdown-item text-sm py-2 px-4 font-normal block w-full whitespace-nowrap bg-transparent text-gray-700 hover:bg-gray-100 cursor-pointer"
                              onClick={() => {
                                setType(material);
                                updateValue();
                              }}
                            >
                              {material.type}
                            </div>
                          </li>
                        ))}
                      {materials.length === 0 && (
                        <div class="flex items-center justify-center px-3 py-2 text-gray-400">
                          You have no materials.
                        </div>
                      )}
                    </ul>
                  </div>
                </div>
                <div class="text-sm text-gray-500">
                  What type of material is this stock?
                </div>
              </div>
              <div class="flex flex-col justify-start space-y-2">
                <div>
                  Value <span class="text-red-500">*</span>
                </div>
                <input
                  type="number"
                  placeholder="Value"
                  value={value()}
                  class="w-full h-auto px-3 py-2 rounded-lg bg-gray-200 outline-none"
                  disabled
                />
                <div class="text-sm text-gray-500">
                  The value of this stock is automatically calculated by the
                  material chosen.
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer flex space-x-2 items-center justify-end p-4 border-t border-gray-200 rounded-b-md">
            <div
              class="flex items-center w-full justify-center px-3 py-1 bg-red-500 rounded-md cursor-pointer"
              data-bs-toggle="modal"
              data-data-bs-dismiss="modal"
            >
              Cancel
            </div>
            <div
              class="flex items-center w-full justify-center px-3 py-1 bg-emerald-500 rounded-md cursor-pointer"
              data-bs-toggle="modal"
              data-data-bs-dismiss="modal"
              onClick={() => {
                onEdit({
                  name: name(),
                  description: description(),
                  weight: weight(),
                  type: type().type,
                  value: value(),
                });
              }}
            >
              Edit
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditStockModal;
