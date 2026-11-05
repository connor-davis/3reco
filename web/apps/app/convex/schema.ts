import { defineSchema } from 'convex/server';
import users from './users';
import collectors from './collectors';
import materials from './materials';
import stock from './stock';
import transactions from './transactions';
import transactionRequests from './transactionRequests';
import transactionRequestMessages from './transactionRequestMessages';
import notifications from './notifications';
import carts from './carts';
import storeReviews from './storeReviews';

export default defineSchema({
  users,
  collectors,
  materials,
  stock,
  transactions,
  transactionRequests,
  transactionRequestMessages,
  notifications,
  carts,
  storeReviews,
});
