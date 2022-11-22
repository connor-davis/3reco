const mongoose = require('mongoose');
const InboxSchema = require('../schemas/inbox.schema');

module.exports = mongoose.model('Inbox', InboxSchema);
