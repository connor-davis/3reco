import { useConvexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Activity } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '../ui/hover-card';
import { Label } from '../ui/label';
import { Skeleton } from '../ui/skeleton';

export default function TransactionUserDetails({ _id }: { _id: Id<'users'> }) {
  const user = useConvexQuery(api.users.findById, { _id });

  if (!user) return <Skeleton className="w-8 h-8 rounded-full" />;

  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <Avatar>
            <AvatarImage src={user.image} />
            <AvatarFallback>
              {(user.businessName ?? user.firstName)?.charAt(0) ?? user.email?.charAt(0)}
            </AvatarFallback>
          </Avatar>
        }
      />
      <HoverCardContent side="bottom">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarImage src={user?.image} />
            <AvatarFallback>
              {(user?.businessName ?? user?.firstName)?.charAt(0) ?? user?.email?.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <Activity mode={user?.name ? 'visible' : 'hidden'}>
              <Label>{user?.name}</Label>
            </Activity>
            <Label className="text-muted-foreground">{user?.email}</Label>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
