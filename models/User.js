const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    default: ""
  },
  email: {
    type: String,
    default: ""
  },
  phone: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    default: ""
  },
  image: {
    type: String,
    default: null
  },
  aadhaarCard: {
    type: String,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  walletBalance: {
    type: Number,
    default: 0
  },
  totalEarnings: {
    type: Number,
    default: 0
  },
  bankDetails: {
    accountNumber: { type: String, default: "" },
    ifscCode: { type: String, default: "" },
    accountHolderName: { type: String, default: "" },
    bankName: { type: String, default: "" }
  },
  fcmToken: {
    type: String,
    default: null
  },
  // Ratings
  averageRating: {
    type: Number,
    default: 0
  },
  totalRatings: {
    type: Number,
    default: 0
  },
  // To track where the user first opened the app / came online
  firstLocation: {
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    address: { type: String, default: null },
    recordedAt: { type: Date, default: null }
  }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
