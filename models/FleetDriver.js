const mongoose = require("mongoose");

const fleetDriverSchema = new mongoose.Schema({
  
  // Driver Details
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
  
  // License Details
  licenseNumber: {
    type: String,
    default: ""
  },
  
  licenseExpiry: {
    type: Date,
    default: null
  },
  
  // Address
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
  
  // Fleet Reference
  fleetId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Fleet",
    required: true
  },
  
  // Status
  isApproved: {
    type: Boolean,
    default: false
  },
  
  isActive: {
    type: Boolean,
    default: false
  },
  
  // Approval Details
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Admin",
    default: null
  },
  
  approvedAt: {
    type: Date,
    default: null
  },
  
  // Rejection Details
  isRejected: {
    type: Boolean,
    default: false
  },
  
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Admin",
    default: null
  },
  
  rejectedAt: {
    type: Date,
    default: null
  },
  
  rejectionReason: {
    type: String,
    default: null
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

module.exports = mongoose.model("FleetDriver", fleetDriverSchema);
