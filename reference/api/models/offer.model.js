const mongoose = require('mongoose');
const OfferSchema = require('../schemas/offer.schema');

module.exports = mongoose.model('Offer', OfferSchema);
