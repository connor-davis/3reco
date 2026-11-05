const mongoose = require('mongoose');

const OfferSchema = new mongoose.Schema({
  owner: {
    type: String,
    required: true,
  },
  stockId: {
    type: String,
    required: true,
  },
});

module.exports = OfferSchema;
