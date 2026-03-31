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

type TransactionPartyDetailsProps =
  | { userId: Id<'users'>; collectorId?: never }
  | { userId?: never; collectorId: Id<'collectors'> };

export default function TransactionPartyDetails(
  props: TransactionPartyDetailsProps
) {
  const userId = 'userId' in props ? props.userId : undefined;
  const collectorId = 'collectorId' in props ? props.collectorId : undefined;

  const user = useConvexQuery(
    api.users.findById,
    userId ? { _id: userId } : 'skip'
  );
  const collector = useConvexQuery(
    api.collectors.findById,
    collectorId ? { _id: collectorId } : 'skip'
  );

  const entity = collector ?? user;

  if (!entity) {
    return <Skeleton className="w-8 h-8 rounded-full" />;
  }

  const title =
    'businessName' in entity
      ? entity.businessName ??
        [entity.firstName, entity.lastName].filter(Boolean).join(' ') ??
        entity.email
      : entity.name;
  const subtitle = 'phone' in entity ? entity.email ?? entity.phone : entity.email;

  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <Avatar>
            <AvatarImage src={entity.image} />
            <AvatarFallback>{(title ?? subtitle)?.charAt(0)}</AvatarFallback>
          </Avatar>
        }
      />
      <HoverCardContent side="bottom">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarImage src={entity.image} />
            <AvatarFallback>{(title ?? subtitle)?.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <Activity mode={title ? 'visible' : 'hidden'}>
              <Label>{title}</Label>
            </Activity>
            <Label className="text-muted-foreground">{subtitle}</Label>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

