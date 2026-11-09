const mongoose = require('mongoose');
const AcquisitionRequestScema = require('../schemas/acquisitionRequest.schema');

module.exports = mongoose.model('AcquisitionRequest', AcquisitionRequestScema);
