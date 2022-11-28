const mongoose = require('mongoose');

const AcquisitionRequestSchema = new mongoose.Schema({
  requester: {
    type: Object,
    required: true,
  },
  offerer: {
    type: String,
    required: true,
  },
  stockId: {
    type: String,
    required: true,
  },
  stockName: {
    type: String,
    required: true,
  },
  weight: {
    type: String,
    required: true,
  },
});

module.exports = AcquisitionRequestSchema;
