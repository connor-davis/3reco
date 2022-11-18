const mongoose = require('mongoose');
const userTypes = require('../types/user.types');

const UserSchema = new mongoose.Schema({
  _userId: mongoose.Schema.Types.ObjectId,
  userType: {
    type: String,
    required: true,
    default: userTypes.STANDARD,
  },
  image: {
    type: String,
    required: false,
  },
  phoneNumber: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
  completedProfile: {
    type: Boolean,
    required: true,
    default: false,
  },
  agreedToTerms: {
    type: Boolean,
    required: true,
  },
  firstName: {
    type: String,
    required: false,
  },
  lastName: {
    type: String,
    required: false,
  },
  idNumber: {
    type: String,
    required: false,
  },
  businessName: {
    type: String,
    required: false,
  },
  businessRegistrationNumber: {
    type: String,
    required: false,
  },
  streetAddress: {
    type: String,
    required: false,
  },
  city: {
    type: String,
    required: false,
  },
  areaCode: {
    type: Number,
    required: false,
  },
  province: {
    type: String,
    required: false,
  },
  location: {
    type: String,
    required: false,
  },
});

module.exports = UserSchema;
