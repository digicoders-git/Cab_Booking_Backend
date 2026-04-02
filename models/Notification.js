const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  // Who should see this notification?
  targetRoles: [{
    type: String,
    enum: ["all", "user", "driver", "agent", "fleet", "vendor"],
    default: "all"
  }],
  // NEW: target a specific person instead of a role
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'recipientModel',
    default: null
  },
  recipientModel: {
    type: String,
    enum: ['User', 'Driver', 'Agent', 'Fleet', 'Vendor', null],
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'createdByModel',
    required: true
  },
  createdByModel: {
    type: String,
    enum: ['Admin', 'Driver', 'User', 'System'],
    default: 'Admin'
  }
}, { timestamps: true });

module.exports = mongoose.model("Notification", notificationSchema);
