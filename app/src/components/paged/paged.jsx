import {onMount} from "solid-js";


const Paged = ({
                   paged, currentPage, onPageClick = (page) => {
    }
               }) => {
    return (
        <>
            {paged.length <= 5 &&
                paged.map((paged) => (
                    <div
                        class={`flex flex-col justify-center items-center py-1.5 px-3 rounded-md border-0 ${
                            currentPage() === paged ? 'bg-emerald-400' : 'bg-transparent'
                        } outline-none transition-all duration-300 text-gray-800 hover:text-emerald-500 hover:bg-emerald-100 focus:shadow-none cursor-pointer`}
                        onClick={() => onPageClick(paged)}
                        data-mdb-ripple="true"
                        data-mdb-ripple-color="#10b981"
                    >
                        {paged}
                    </div>
                ))}
        </>
    );
};

export default Paged;
