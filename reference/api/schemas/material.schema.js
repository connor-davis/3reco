const mongoose = require('mongoose');

const MaterialSchema = new mongoose.Schema({
  owner: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    required: true,
  },
  value: {
    type: Number,
    required: true,
  },
});

module.exports = MaterialSchema;
