const mongoose = require("mongoose");

const fleetSchema = new mongoose.Schema({
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
  
  // Business Details
  companyName: {
    type: String,
    required: true
  },
  gstNumber: {
    type: String,
    default: ""
  },
  panNumber: {
    type: String,
    default: ""
  },
  
  // Address
  address: {
    type: String,
    required: true
  },
  city: {
    type: String,
    required: true
  },
  state: {
    type: String,
    required: true
  },
  pincode: {
    type: String,
    required: true
  },
  
  // Bank Details
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
  
  // Business Stats
  totalCars: {
    type: Number,
    default: 0
  },
  totalDrivers: {
    type: Number,
    default: 0
  },
  totalEarnings: {
    type: Number,
    default: 0
  },
  walletBalance: {
    type: Number,
    default: 0
  },
  commissionPercentage: {
    type: Number,
    default: 10 // Admin can set specific % for each fleet
  },
  
  // Documents
  documents: {
    gstCertificate: {
      type: String,
      default: null
    },
    panCard: {
      type: String,
      default: null
    },
    businessLicense: {
      type: String,
      default: null
    }
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Admin"
  }
}, { timestamps: true });

module.exports = mongoose.model("Fleet", fleetSchema);