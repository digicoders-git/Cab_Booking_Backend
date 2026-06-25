const express = require("express");
const router = express.Router();
const offerController = require("../controllers/offerController");
const { auth, adminOnly, userOnly } = require("../middleware/auth");

// --- ADMIN ROUTES ---
// Create a new offer
router.post("/create", auth, adminOnly, offerController.createOffer);

// Get all offers (for admin panel)
router.get("/all", auth, adminOnly, offerController.getAllOffers);

// Update an offer
router.put("/update/:id", auth, adminOnly, offerController.updateOffer);

// Delete an offer
router.delete("/delete/:id", auth, adminOnly, offerController.deleteOffer);


// --- USER ROUTES ---
// Validate an offer code before booking
router.post("/validate", auth, offerController.validateOffer);

module.exports = router;
