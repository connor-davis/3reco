const mongoose = require('mongoose');

const UserDocumentSchema = new mongoose.Schema({
  documentName: {
    type: String,
    required: true,
  },
  documentLocation: {
    type: String,
    required: true,
  },
});

const UserSchema = new mongoose.Schema({
  _userId: mongoose.Schema.Types.ObjectId,
  image: {
    type: String,
    required: false,
  },
  email: {
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
  lat: {
    type: Number,
    required: false,
  },
  lng: {
    type: Number,
    required: false,
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
    type: Number,
    required: false,
  },
  age: {
    type: Number,
    required: false,
  },
  gender: {
    type: String,
    required: false,
  },
  ethnicity: {
    type: String,
    required: false,
  },
  businessName: {
    type: String,
    required: false,
  },
  businessType: {
    type: String,
    required: false,
  },
  businessTypeDescription: {
    type: String,
    required: false,
  },
  positionAtECD: {
    type: String,
    required: false,
  },
  numberOfChildren: {
    type: Number,
    required: false,
  },
  businessRegistered: {
    type: Boolean,
    required: false,
    default: false,
  },
  businessRegistrationNumber: {
    type: String,
    required: false,
  },
  businessNumberOfEmployees: {
    type: Number,
    required: false,
  },
  websiteUrl: {
    type: String,
    required: false,
  },
  facebookPageUrl: {
    type: String,
    required: false,
  },
  instagramPageUrl: {
    type: String,
    required: false,
  },
  youTubeChannelUrl: {
    type: String,
    required: false,
  },
  accountNumber: {
    type: Number,
    required: false,
  },
  bankName: {
    type: String,
    required: false,
  },
  bankBranchCode: {
    type: Number,
    required: false,
  },
  streetAddress: {
    type: String,
    required: false,
  },
  suburb: {
    type: String,
    required: false,
  },
  ward: {
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
  country: {
    type: String,
    required: false,
  },
  location: {
    type: String,
    required: false
  }
});

module.exports = UserSchema;
