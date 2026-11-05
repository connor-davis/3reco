import { useContext, useMemo } from 'react';
import { personEmails } from '@/lib/data/people';
import type { Profile, ProfileRole } from '@/lib/types';
import { MockContext, type MockContextValue, type MockData } from './context';

export function useMock(): MockContextValue {
  const value = useContext(MockContext);
  if (!value) throw new Error('useMock must be used inside MockProvider');
  return value;
}

// Only the array fields of the mock data are lists (profiles is a record).
type ListKey = {
  [K in keyof MockData]: MockData[K] extends unknown[] ? K : never;
}[keyof MockData];

/** Reads one mock list and gives add, update and remove for it. */
export function useMockList<K extends ListKey>(key: K) {
  const { data, setData } = useMock();
  type Item = MockData[K][number];

  function change(next: (items: Item[]) => Item[]) {
    setData((current) => ({
      ...current,
      [key]: next(current[key] as Item[]),
    }));
  }

  return {
    items: data[key] as Item[],
    add: (item: Item) => change((items) => [item, ...items]),
    // For streams like chat, where the newest entry belongs at the end.
    append: (item: Item) => change((items) => [...items, item]),
    update: (id: string | number, patch: Partial<Item>) =>
      change((items) =>
        items.map((item) =>
          (item as { id: string | number }).id === id
            ? { ...item, ...patch }
            : item
        )
      ),
    remove: (id: string | number) =>
      change((items) =>
        items.filter((item) => (item as { id: string | number }).id !== id)
      ),
    replace: (items: Item[]) => change(() => items),
  };
}

/** The role whose profile to show. Signed-out previews fall back to business. */
function profileRole(role: ReturnType<typeof useMock>['role']): ProfileRole {
  return role === 'signed-out' ? 'business' : role;
}

/** The signed-in person's profile, and a way to save changes to it. */
export function useProfile() {
  const { role, data, setData } = useMock();
  const key = profileRole(role);

  return {
    profile: data.profiles[key],
    save: (patch: Partial<Profile>) =>
      setData((current) => ({
        ...current,
        profiles: {
          ...current.profiles,
          [key]: { ...current.profiles[key], ...patch },
        },
      })),
  };
}

/** Name and email of the signed-in person, read from their profile. */
export function usePerson() {
  const { role } = useMock();
  const { profile } = useProfile();

  return {
    name: `${profile.firstName} ${profile.lastName}`.trim(),
    email: personEmails[profileRole(role)],
  };
}

/**
 * Everything on sale in the market: other stores' lots plus this business's
 * own stock that is switched to "listed". Unlisting stock removes it here.
 */
export function useMarketListings() {
  const { data } = useMock();

  return useMemo(
    () => [...data.listings, ...data.stock.filter((item) => item.listed)],
    [data.listings, data.stock]
  );
}
