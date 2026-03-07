import { defineSchema } from 'convex/server';
import users from './users';
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
  materials,
  stock,
  transactions,
  transactionRequests,
  transactionRequestMessages,
  notifications,
  carts,
  storeReviews,
});
