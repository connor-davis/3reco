import { createContext } from 'react';
import type { AuthUser } from '../api/types';

export interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  error: Error | null;
}
export const AuthContext = createContext<AuthContextValue | null>(null);
