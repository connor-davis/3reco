const DeleteInboxModal = ({ onDelete = () => {} }) => {
  return (
    <div
      class="modal fade fixed top-0 left-0 hidden w-full h-full outline-none overflow-x-hidden overflow-y-auto"
      id="deleteInboxModal"
      tabindex="-1"
      aria-labelledby="deleteInboxModal"
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
              Delete
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
              Are you sure you would like to delete this inbox item?
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
              onClick={() => {
                onDelete();
              }}
              data-bs-toggle="modal"
              data-data-bs-dismiss="modal"
            >
              Yes
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeleteInboxModal;
