import { onMount } from "solid-js";


const Paged = ({
    paged, currentPage, onPageClick = (page) => {
    }
}) => {
    return (
        <>
            {paged.length < 6 ?
                paged.map((paged) => (
                    <div
                        class={`flex flex-col justify-center items-center py-1.5 px-3 rounded-md border-0 ${currentPage() === paged ? 'bg-emerald-400' : 'bg-transparent'
                            } outline-none transition-all duration-300 text-gray-800 hover:text-emerald-500 hover:bg-emerald-100 focus:shadow-none cursor-pointer`}
                        onClick={() => onPageClick(paged)}
                        data-mdb-ripple="true"
                        data-mdb-ripple-color="#10b981"
                    >
                        {paged}
                    </div>
                )) : <div class="flex items-center space-x-2">
                    {currentPage() > 1 &&
                        <div
                            class={`flex flex-col justify-center items-center py-1.5 px-3 rounded-md border-0 outline-none transition-all duration-300 text-gray-800 hover:text-emerald-500 hover:bg-emerald-100 focus:shadow-none cursor-pointer`}
                            onClick={() => {
                                onPageClick(1);
                            }}
                            data-mdb-ripple="true"
                            data-mdb-ripple-color="#10b981"
                        >
                            1
                        </div>
                    }
                    {currentPage() > 2 &&
                        <div class="flex items-center space-x-2">
                            <div>...</div>
                        </div>
                    }
                    {
                        currentPage() < paged.length - 3 && paged.slice(currentPage() - 1, currentPage() + 3).map((paged, index) => (
                            <div
                                class={`flex flex-col justify-center items-center py-1.5 px-3 rounded-md border-0 ${currentPage() === paged ? 'bg-emerald-400' : 'bg-transparent'
                                    } outline-none transition-all duration-300 text-gray-800 hover:text-emerald-500 hover:bg-emerald-100 focus:shadow-none cursor-pointer`}
                                onClick={() => {
                                    onPageClick(paged);
                                }}
                                data-mdb-ripple="true"
                                data-mdb-ripple-color="#10b981"
                            >
                                {paged}
                            </div>
                        ))
                    }
                    {
                        currentPage() > paged.length - 4 && <div class="flex items-center space-x-2">
                            <div class="flex items-center space-x-2">
                                <div
                                    class={`flex flex-col justify-center items-center py-1.5 px-3 rounded-md border-0 ${currentPage() === paged.length - 3 ? 'bg-emerald-400' : 'bg-transparent'
                                        } outline-none transition-all duration-300 text-gray-800 hover:text-emerald-500 hover:bg-emerald-100 focus:shadow-none cursor-pointer`}
                                    onClick={() => {
                                        onPageClick(paged.length - 3);
                                    }}
                                    data-mdb-ripple="true"
                                    data-mdb-ripple-color="#10b981"
                                >
                                    {paged.length - 3}
                                </div>
                                <div
                                    class={`flex flex-col justify-center items-center py-1.5 px-3 rounded-md border-0 ${currentPage() === paged.length - 2 ? 'bg-emerald-400' : 'bg-transparent'
                                        } outline-none transition-all duration-300 text-gray-800 hover:text-emerald-500 hover:bg-emerald-100 focus:shadow-none cursor-pointer`}
                                    onClick={() => {
                                        onPageClick(paged.length - 2);
                                    }}
                                    data-mdb-ripple="true"
                                    data-mdb-ripple-color="#10b981"
                                >
                                    {paged.length - 2}
                                </div>
                                <div
                                    class={`flex flex-col justify-center items-center py-1.5 px-3 rounded-md border-0 ${currentPage() === paged.length - 1 ? 'bg-emerald-400' : 'bg-transparent'
                                        } outline-none transition-all duration-300 text-gray-800 hover:text-emerald-500 hover:bg-emerald-100 focus:shadow-none cursor-pointer`}
                                    onClick={() => {
                                        onPageClick(paged.length - 1);
                                    }}
                                    data-mdb-ripple="true"
                                    data-mdb-ripple-color="#10b981"
                                >
                                    {paged.length - 1}
                                </div>
                                <div
                                    class={`flex flex-col justify-center items-center py-1.5 px-3 rounded-md border-0 ${currentPage() === paged.length ? 'bg-emerald-400' : 'bg-transparent'
                                        } outline-none transition-all duration-300 text-gray-800 hover:text-emerald-500 hover:bg-emerald-100 focus:shadow-none cursor-pointer`}
                                    onClick={() => {
                                        onPageClick(paged.length);
                                    }}
                                    data-mdb-ripple="true"
                                    data-mdb-ripple-color="#10b981"
                                >
                                    {paged.length}
                                </div>
                            </div>
                        </div>
                    }
                </div>
            }
        </>
    );
};

export default Paged;
