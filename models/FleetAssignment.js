const mongoose = require("mongoose");

const fleetAssignmentSchema = new mongoose.Schema({
  
  // Fleet Reference
  fleetId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Fleet",
    required: true
  },
  
  // Car Reference
  carId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "FleetCar",
    required: true
  },
  
  // Driver Reference
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "FleetDriver",
    required: true
  },
  
  // Car Details (Snapshot)
  carNumber: {
    type: String,
    required: true
  },
  
  carModel: {
    type: String,
    required: true
  },
  
  carType: {
    type: String,
    required: true
  },
  
  seatCapacity: {
    type: Number,
    required: true
  },
  
  // Driver Details (Snapshot)
  driverName: {
    type: String,
    required: true
  },
  
  driverEmail: {
    type: String,
    required: true
  },
  
  driverPhone: {
    type: String,
    required: true
  },
  
  // Assignment Status
  isAssigned: {
    type: Boolean,
    default: true
  },
  
  assignedAt: {
    type: Date,
    default: Date.now
  },
  
  unassignedAt: {
    type: Date,
    default: null
  },
  
  // Assignment History
  assignmentHistory: [
    {
      action: {
        type: String,
        enum: ["assigned", "unassigned"],
        required: true
      },
      timestamp: {
        type: Date,
        default: Date.now
      },
      performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Fleet"
      }
    }
  ],
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
  
}, { timestamps: true });

module.exports = mongoose.model("FleetAssignment", fleetAssignmentSchema);
