import { authTables } from '@convex-dev/auth/server';
import { defineSchema } from 'convex/server';
import users from './users';
import materials from './materials';
import stock from './stock';
import transactions from './transactions';
import transactionRequests from './transactionRequests';
import transactionRequestMessages from './transactionRequestMessages';
import notifications from './notifications';

export default defineSchema({
  ...authTables,
  users,
  materials,
  stock,
  transactions,
  transactionRequests,
  transactionRequestMessages,
  notifications,
});
