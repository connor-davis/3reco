const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  seller: {
    type: String,
    required: true,
  },
  sellerPhoneNumber: {
    type: String,
    required: true,
  },
  buyer: {
    type: String,
    required: true,
  },
  buyerPhoneNumber: {
    type: String,
    required: true
  },
  stockType: {
    type: String,
    required: true,
  },
  weight: {
    type: Number,
    required: true,
  },
  value: {
    type: Number,
    required: true,
  },
  date: {
    type: Number,
    required: true,
  },
});

module.exports = TransactionSchema;
