const mongoose = require('mongoose');
const TransactionSchema = require('../schemas/transaction.schema');

module.exports = mongoose.model('Transaction', TransactionSchema);
