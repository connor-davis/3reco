import { cva } from 'class-variance-authority';

export const tabsListVariants = cva(
  'group/tabs-list inline-flex w-fit items-center justify-center rounded-md p-[3px] text-muted-foreground group-data-horizontal/tabs:h-9 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col group-data-vertical/tabs:rounded-md data-[variant=line]:rounded-none max-lg:group-data-horizontal/tabs:h-[3.25rem]',
  {
    variants: {
      variant: {
        default: 'bg-muted',
        line: 'max-w-full flex-nowrap gap-6 overflow-x-auto bg-transparent [scrollbar-width:none] [&::-webkit-scrollbar]:hidden group-data-horizontal/tabs:h-[46px] group-data-horizontal/tabs:w-full group-data-horizontal/tabs:justify-start',
      },
    },
    defaultVariants: {
      variant: 'line',
    },
  }
);
