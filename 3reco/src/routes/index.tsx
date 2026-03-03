import { api } from '@convex/_generated/api';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from 'convex/react';

export const Route = createFileRoute('/')({
  component: Index,
});

function Index() {
  const user = useQuery(api.users.currentUser);

  return <pre>{JSON.stringify(user, null, 2)}</pre>;
}
