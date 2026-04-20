const mongoose = require("mongoose");

const carCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true, // Example: "Sedan", "SUV", "Hatchback"
    trim: true
  },
  seatCapacity: {
    type: Number,
    required: true,
    min: 1,
    max: 100 // Increased limit for larger vehicles like buses/vans
  },
  avgSpeedKmH: {
    type: Number,
    default: 25 // Default speed 25 km/h if not specified
  },
  // NEW: Shared Ride Seat Mapping
  seatLayout: {
    type: [String],
    default: [] // e.g., ["Front", "Back-Left", "Back-Middle", "Back-Right"]
  },
  // Pricing for Private Ride (Full Cab)
  privateRatePerKm: {
    type: Number,
    required: true,
    default: 0
  },
  // Pricing for Shared Ride (Per Seat)
  sharedRatePerSeatPerKm: {
    type: Number,
    required: true,
    default: 0
  },
  // Minimum Base Fare when ride starts
  baseFare: {
    type: Number,
    required: true,
    default: 0
  },
  // Image to show on User App during selection
  image: {
    type: String,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  bulkBookingBasePrice: {
    type: Number,
    default: 0
  },
  // Waiting Time Rules (Phase 1)
  freeWaitingMin: {
    type: Number,
    default: 3 // Default 3 minutes free
  },
  waitingChargePerMin: {
    type: Number,
    default: 2 // Default ₹2 per extra minute
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Admin"
  }
}, { timestamps: true });

module.exports = mongoose.model("CarCategory", carCategorySchema);
