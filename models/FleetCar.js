const mongoose = require("mongoose");

const fleetCarSchema = new mongoose.Schema({
  
  // Car Details
  carNumber: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },

  image: {
    type: String,
    default: null
  },

  // Car Document Photos
  carDocuments: {
    rcImage: {
      type: String,
      default: null
    },
    insuranceImage: {
      type: String,
      default: null
    },
    permitImage: {
      type: String,
      default: null
    },
    pucImage: {
      type: String,
      default: null
    }
  },
  
  carModel: {
    type: String,
    required: true
  },
  
  carBrand: {
    type: String,
    required: true
  },
  
  carType: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "CarCategory",
    required: true
  },
  
  seatCapacity: {
    type: Number,
    required: true,
    default: 4
  },
  
  carColor: {
    type: String,
    default: ""
  },
  
  manufacturingYear: {
    type: Number,
    default: null
  },

  
  // Document Expiry Dates
  insuranceExpiry: {
    type: Date,
    default: null
  },
  
  permitExpiry: {
    type: Date,
    default: null
  },
  
  pucExpiry: {
    type: Date,
    default: null
  },
  
  // Maintenance
  lastServiceDate: {
    type: Date,
    default: null
  },
  
  nextServiceDate: {
    type: Date,
    default: null
  },
  
  // Fleet Reference
  fleetId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Fleet",
    required: true
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  
  isAvailable: {
    type: Boolean,
    default: true
  },
  // NEW: Admin approval for marketplace visibility
  isApproved: {
    type: Boolean,
    default: false
  },
  
  isBusy: {
    type: Boolean,
    default: false
  },
  
  // Trip Stats
  totalTrips: {
    type: Number,
    default: 0
  },
  
  totalEarnings: {
    type: Number,
    default: 0
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
  
}, { timestamps: true });

module.exports = mongoose.model("FleetCar", fleetCarSchema);
