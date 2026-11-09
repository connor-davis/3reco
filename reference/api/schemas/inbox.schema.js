const mongoose = require('mongoose');
const InboxTypes = require("../types/inbox.types");

const InboxSchema = new mongoose.Schema({
  sender: {
    type: Object,
    required: true,
  },
  recipient: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  attachments: {
    type: Array,
    required: false,
  },
  type: {
    type: String,
    required: true,
    default: InboxTypes.DEFAULT,
  },
});

module.exports = InboxSchema;
