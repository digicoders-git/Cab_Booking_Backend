const express = require("express");
const router = express.Router();
const offerController = require("../controllers/offerController");
const { auth, adminOnly, userOnly } = require("../middleware/auth");
const { checkPermission } = require("../middleware/rbac");

// --- ADMIN ROUTES ---
// Create a new offer
router.post("/create", auth, checkPermission("OFFER_CREATE"), offerController.createOffer);

// Get all offers (for admin panel)
router.get("/all", auth, checkPermission("OFFER_READ"), offerController.getAllOffers);

// Update an offer
router.put("/update/:id", auth, checkPermission("OFFER_EDIT"), offerController.updateOffer);

// Delete an offer
router.delete("/delete/:id", auth, checkPermission("OFFER_DELETE"), offerController.deleteOffer);


// --- USER ROUTES ---
// Get all active offers (Public route so non-logged in users can see promos)
router.get("/active", offerController.getActiveOffers);

// Validate an offer code before booking (requires auth)
router.post("/validate", auth, offerController.validateOffer);

module.exports = router;
