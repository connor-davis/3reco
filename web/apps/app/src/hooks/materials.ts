import { useConvexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';

export const useMaterial = ({ _id }: { _id?: Id<'materials'> }) => {
  const material = useConvexQuery(
    api.materials.findById,
    _id
      ? {
          _id: _id as Id<'materials'>,
        }
      : 'skip'
  );

  return { material, isLoading: !material };
};
