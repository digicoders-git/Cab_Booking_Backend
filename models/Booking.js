const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
  // Who created the booking?
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null // Custom booking by agent won't have a user ID initially
  },
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Agent",
    default: null // Null if booked directly by user
  },
  
  // Passenger Details (Important if Agent books for someone else)
  passengerDetails: {
    name: { type: String, required: true },
    phone: { type: String, required: true }
  },

  // Trip Type
  rideType: {
    type: String,
    enum: ["Private", "Shared"],
    required: true
  },
  
  // What car did they choose?
  carCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "CarCategory",
    required: true
  },

  // Seats booked (1 for private, could be multiple for shared)
  seatsBooked: {
    type: Number,
    required: true,
    default: 1
  },
  // Exact names/labels of the seats chosen in a shared ride
  selectedSeats: {
    type: [String],
    default: []
  },

  // Location Details
  pickup: {
    address: { type: String, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true }
  },
  drop: {
    address: { type: String, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true }
  },

  // Distance & Time
  estimatedDistanceKm: {
    type: Number,
    required: true
  },
  pickupDate: {
    type: Date,
    default: Date.now // Default to now if not provided
  },
  pickupTime: { 
    type: String, 
    default: () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  },

  // Financials
  fareEstimate: {
    type: Number,
    required: true
  },
  actualFare: {
    type: Number,
    default: 0 // Will update if route changes or driver adds extra cost
  },
  agentCommission: {
    type: Number,
    default: 0 // Calculated if agent made the booking
  },
  adminCommission: {
    type: Number,
    default: 0 // System's cut
  },
  paymentStatus: {
    type: String,
    enum: ["Pending", "Advanced Paid", "Completed", "Refunded"],
    default: "Pending"
  },
  paymentMethod: {
    type: String,
    enum: ["Cash", "Online", "Wallet"],
    default: "Cash"
  },

  // Assignment / Execution (Phase 3 elements)
  assignedDriver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Driver",
    default: null
  },
  assignedCar: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "FleetCar", // Or Driver's car representation
    default: null
  },
  bookingStatus: {
    type: String,
    enum: ["Pending", "Accepted", "Ongoing", "Completed", "Cancelled", "Expired"],
    default: "Pending"
  },
  cancelledBy: {
    type: String,
    enum: ["User", "Driver", "Admin", "Agent", null],
    default: null
  },
  cancelReason: {
    type: String,
    default: ""
  },

  // Live Trip Data
  driverLocation: {
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    heading: { type: Number, default: null },
    lastUpdated: { type: Date, default: null }
  },

  tripData: {
    arrivedAt: { type: Date, default: null }, // Timestamp when driver clicked 'Arrived'
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    startOtp: { type: String, default: null }, // Safety feature: OTP to start ride
    waitingTimeMin: { type: Number, default: 0 }, // Chargeable waiting time
    waitingCharges: { type: Number, default: 0 }  // Total waiting cost added to bill
  }

}, { timestamps: true });

module.exports = mongoose.model("Booking", bookingSchema);
