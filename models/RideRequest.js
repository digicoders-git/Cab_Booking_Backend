const mongoose = require("mongoose");

const rideRequestSchema = new mongoose.Schema({
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Booking",
    required: true
  },
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Driver",
    required: true
  },
  status: {
    type: String,
    enum: ["Pending", "Accepted", "Rejected", "Timeout", "Cancelled"],
    default: "Pending" // "Pending" means driver hasn't answered yet
  }
}, { timestamps: true });

module.exports = mongoose.model("RideRequest", rideRequestSchema);
