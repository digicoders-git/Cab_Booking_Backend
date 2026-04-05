const express = require("express");
const router = express.Router();
const vendorController = require("../controllers/vendorController");
const { auth, adminOnly, vendorOnly } = require("../middleware/auth");
const uploadCarDocs = require("../middleware/uploadCarDocs");
const uploadFleetDocs = require("../middleware/uploadFleetDocs");

// ============================================================
// ADMIN ROUTES (Admin Only)
// ============================================================

// Create Vendor (Admin set karta hai — name, area, commission%)
const uploadProfile = require("../middleware/uploadAdminImage");
router.post("/create", auth, adminOnly, uploadProfile.fields([
    { name: "image", maxCount: 1 },
    { name: "aadhar", maxCount: 1 },
    { name: "pan", maxCount: 1 },
    { name: "gst", maxCount: 1 }
]), vendorController.createVendor);

// Get All Vendors
router.get("/all", auth, adminOnly, vendorController.getAllVendors);

// Get Single Vendor
router.get("/:id", auth, adminOnly, vendorController.getSingleVendor);

// Update Vendor
router.put("/update/:id", auth, adminOnly, uploadProfile.fields([
    { name: "image", maxCount: 1 },
    { name: "aadhar", maxCount: 1 },
    { name: "pan", maxCount: 1 },
    { name: "gst", maxCount: 1 }
]), vendorController.updateVendor);

// Update Commission % Only
router.patch("/commission/:id", auth, adminOnly, vendorController.updateVendorCommission);

// Toggle Active/Deactive
router.patch("/toggle/:id", auth, adminOnly, vendorController.toggleVendorStatus);

// Delete Vendor
router.delete("/delete/:id", auth, adminOnly, vendorController.deleteVendor);

// ============================================================
// VENDOR ROUTES (Vendor Only)
// ============================================================

// Login
router.post("/login", vendorController.loginVendor);

// Get Own Profile
router.get("/profile/me", auth, vendorOnly, vendorController.getVendorProfile);

// Self Profile Update (NEW: Vendor can update their own profile)
const upload = require("../middleware/uploadAdminImage"); // Generic image upload
router.put("/profile/self-update", auth, vendorOnly, upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'aadhar', maxCount: 1 },
  { name: 'pan', maxCount: 1 },
  { name: 'gst', maxCount: 1 }
]), vendorController.updateSelfProfile);

// Dashboard Stats
router.get("/dashboard/stats", auth, vendorOnly, vendorController.getVendorDashboard);

// Create Driver (Vendor apne area ke liye driver banata hai)
router.post("/create-driver", auth, vendorOnly, uploadCarDocs, vendorController.createDriver);

// Create Fleet (Vendor apne area ke liye fleet banata hai)
router.post("/create-fleet", auth, vendorOnly, uploadFleetDocs, vendorController.createFleet);

// Get My Drivers
router.get("/my/drivers", auth, vendorOnly, vendorController.getMyDrivers);

// Get Single Driver by ID
router.get("/driver/:id", auth, vendorOnly, vendorController.getVendorDriverById);

// Update My Driver
router.put("/update-driver/:id", auth, vendorOnly, uploadCarDocs, vendorController.updateVendorDriver);

// Delete My Driver
router.delete("/delete-driver/:id", auth, vendorOnly, vendorController.deleteVendorDriver);

// Toggle My Driver Status (Active/Inactive)
router.patch("/toggle-driver/:id", auth, vendorOnly, vendorController.toggleVendorDriverStatus);

// Get My Fleets
router.get("/my/fleets", auth, vendorOnly, vendorController.getMyFleets);

// Get Single Fleet by ID
router.get("/fleet/:id", auth, vendorOnly, vendorController.getVendorFleetById);

// Update My Fleet
router.put("/update-fleet/:id", auth, vendorOnly, uploadFleetDocs, vendorController.updateVendorFleet);

// Toggle My Fleet Status (Active/Inactive)
router.patch("/toggle-fleet/:id", auth, vendorOnly, vendorController.toggleVendorFleetStatus);

// Delete My Fleet
router.delete("/delete-fleet/:id", auth, vendorOnly, vendorController.deleteVendorFleet);

// Request Wallet Payout
router.post("/wallet/withdraw", auth, vendorOnly, vendorController.requestVendorWithdrawal);

// Payout History
router.get("/wallet/withdrawals", auth, vendorOnly, vendorController.getMyVendorWithdrawals);

// ============================================================
// MEGA REPORT (All APIs combined)
// ============================================================
router.get("/reports/pure-vendor-data", auth, vendorOnly, vendorController.getPureVendorDataReport);

module.exports = router;
