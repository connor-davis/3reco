const mongoose = require('mongoose');

const StockSchema = new mongoose.Schema({
  owner: {
    type: String,
    required: true,
  },
  stockType: {
    type: String,
    required: true,
  },
  stockName: {
    type: String,
    required: true,
  },
  stockDescription: {
    type: String,
    required: true,
  },
  stockWeight: {
    type: Number,
    required: true,
  },
  stockValue: {
    type: Number,
    required: true,
  },
  isOffered: {
    type: Boolean,
    required: true,
    default: false,
  },
});

module.exports = StockSchema;
