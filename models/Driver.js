const mongoose = require("mongoose");

const driverSchema = new mongoose.Schema({
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
  licenseNumber: {
    type: String,
    default: ""
  },
  licenseExpiry: {
    type: Date,
    default: null
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  isAvailable: {
    type: Boolean,
    default: true
  },
  // NEW: Shared Ride Engine Properties
  currentRideType: {
    type: String,
    enum: ["Private", "Shared", null],
    default: null
  },
  availableSeats: {
    type: Number,
    default: 0 // Will sync with carCategory capacity when online or empty
  },
  currentHeading: {
    type: Number,
    default: null // The compass angle (0-360) the driver is heading towards on a shared ride
  },
  seatMap: [{
    seatName: String,
    isBooked: { type: Boolean, default: false },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", default: null }
  }],
  currentLocation: {
    latitude: {
      type: Number,
      default: null
    },
    longitude: {
      type: Number,
      default: null
    },
    lastUpdated: {
      type: Date,
      default: null
    }
  },
  // CAR DETAILS (Driver's Own Car)
  carDetails: {
    carNumber: {
      type: String,
      default: null,
      uppercase: true
    },
    carModel: {
      type: String,
      default: null
    },
    carBrand: {
      type: String,
      default: null
    },
    carType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CarCategory",
      default: null
    },

    carColor: {
      type: String,
      default: ""
    },
    manufacturingYear: {
      type: Number,
      default: null
    },
    carDocuments: {
      rc: {
        type: String,
        default: null
      },
      insurance: {
        type: String,
        default: null
      },
      permit: {
        type: String,
        default: null
      },
      puc: {
        type: String,
        default: null
      }
    },
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
    lastServiceDate: {
      type: Date,
      default: null
    },
    nextServiceDate: {
      type: Date,
      default: null
    }
  },
  walletBalance: {
    type: Number,
    default: 0
  },
  debtLimit: {
    type: Number,
    default: -500 // Driver will be blocked if balance falls below this
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  totalTrips: {
    type: Number,
    default: 0
  },
  totalEarnings: {
    type: Number,
    default: 0
  },
  documents: {
    license: {
      type: String,
      default: null
    },
    aadhar: {
      type: String,
      default: null
    },
    pan: {
      type: String,
      default: null
    }
  },
  aadharNumber: {
    type: String,
    default: ""
  },
  panNumber: {
    type: String,
    default: ""
  },
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
  isActive: {
    type: Boolean,
    default: false  // Admin approval required
  },
  isApproved: {
    type: Boolean,
    default: false  // Pending approval by admin
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Admin",
    default: null
  },
  approvedAt: {
    type: Date,
    default: null
  },
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
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: "createdByModel",
    default: null
  },
  createdByModel: {
    type: String,
    enum: ["Admin", "Fleet", "Self", "Vendor"],
    default: "Self"
  }
}, { timestamps: true });

module.exports = mongoose.model("Driver", driverSchema);
