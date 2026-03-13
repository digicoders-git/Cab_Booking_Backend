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
    enum: ["all", "user", "driver", "agent", "fleet"],
    required: true
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Admin",
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model("Notification", notificationSchema);
