import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { setMaterialRegistry } from '@/lib/data/materials';
import type { CartLine, PageState, Role } from '@/lib/types';
import { MockContext, seedData, type MockData } from './context';

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

const seedCart: CartLine[] = [{ listingId: 'lst-101', kg: '500' }];

/** Holds the role, page state, cart and every mock list for the session. */
export function MockProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>(() =>
    readStored('cc-role', 'business')
  );
  const [pageState, setPageStateState] = useState<PageState>(() =>
    readStored('cc-state', 'ready')
  );
  const [cart, setCartState] = useState<CartLine[]>(() =>
    readStored('cc-cart', seedCart)
  );
  const [data, setDataState] = useState<MockData>(seedData);
  const [celebrate, setCelebrate] = useState<{
    kg: number;
    co2: number;
  } | null>(null);

  const setRole = useCallback((next: Role) => {
    writeStored('cc-role', next);
    setRoleState(next);
  }, []);

  // Every data change goes through here so the materials registry stays in step.
  const setData = useCallback((update: (data: MockData) => MockData) => {
    setDataState((current) => {
      const next = update(current);
      setMaterialRegistry(next.materials);

      return next;
    });
  }, []);

  const setPageState = useCallback((next: PageState) => {
    writeStored('cc-state', next);
    setPageStateState(next);
  }, []);

  const setCart = useCallback((next: CartLine[]) => {
    writeStored('cc-cart', next);
    setCartState(next);
  }, []);

  const value = useMemo(
    () => ({
      role,
      setRole,
      pageState,
      setPageState,
      cart,
      setCart,
      data,
      setData,
      celebrate,
      setCelebrate,
    }),
    [
      role,
      setRole,
      pageState,
      setPageState,
      cart,
      setCart,
      data,
      setData,
      celebrate,
    ]
  );

  return <MockContext value={value}>{children}</MockContext>;
}
