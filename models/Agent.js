const mongoose = require("mongoose");

const agentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  phone: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  image: {
    type: String,
    default: null
  },
  commissionPercentage: {
    type: Number,
    default: 10,
    min: 0,
    max: 100

  },
  walletBalance: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  documents: {
    aadhar: {
      type: String,
      default: null
    },
    pan: {
      type: String,
      default: null
    }
  },
  aadharNumber: {
    type: String,
    default: ""
  },
  panNumber: {
    type: String,
    default: ""
  },
  address: {
    type: String,
    default: ""
  },
  city: {
    type: String,
    default: ""
  },
  state: {
    type: String,
    default: ""
  },
  pincode: {
    type: String,
    default: ""
  },
  bankDetails: {
    accountNumber: {
      type: String,
      default: ""
    },
    ifscCode: {
      type: String,
      default: ""
    },
    accountHolderName: {
      type: String,
      default: ""
    },
    bankName: {
      type: String,
      default: ""
    }
  },
  totalBookings: {
    type: Number,
    default: 0
  },
  totalEarnings: {
    type: Number,
    default: 0
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Admin",
    default: null
  },
  fcmToken: {
    type: String,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model("Agent", agentSchema);
