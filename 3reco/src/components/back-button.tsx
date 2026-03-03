import { Link, useRouter } from '@tanstack/react-router';
import { ChevronLeftIcon } from 'lucide-react';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

export default function BackButton() {
  const router = useRouter();

  if (!router.history.canGoBack())
    return (
      <Link to="/">
        <Button variant="ghost" size="icon">
          <ChevronLeftIcon className="size-4" />
        </Button>
      </Link>
    );

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.history.back()}
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
        }
      />
      <TooltipContent>Go Back</TooltipContent>
    </Tooltip>
  );
}
