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
  }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
