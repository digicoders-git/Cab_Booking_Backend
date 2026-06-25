const mongoose = require("mongoose");

const offerSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  discountAmount: {
    type: Number,
    required: true,
    min: 1
  },
  bookingType: {
    type: String,
    enum: ["Normal", "Bulk"],
    required: true
  },
  validTill: {
    type: Date,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

module.exports = mongoose.model("Offer", offerSchema);
