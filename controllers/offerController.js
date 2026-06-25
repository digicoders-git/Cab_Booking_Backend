const Offer = require("../models/Offer");

// 1. Create Offer (Admin Only)
exports.createOffer = async (req, res) => {
    try {
        const { code, discountAmount, bookingType, validTill, isActive } = req.body;

        // Check if code already exists
        const existingOffer = await Offer.findOne({ code: code.toUpperCase() });
        if (existingOffer) {
            return res.status(400).json({ success: false, message: "Offer code already exists" });
        }

        const newOffer = new Offer({
            code: code.toUpperCase(),
            discountAmount,
            bookingType,
            validTill,
            isActive
        });

        await newOffer.save();
        res.status(201).json({ success: true, message: "Offer created successfully", offer: newOffer });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// 2. Get All Offers (Admin Only)
exports.getAllOffers = async (req, res) => {
    try {
        const offers = await Offer.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, offers });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// 3. Update Offer (Admin Only)
exports.updateOffer = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        if (updates.code) {
            updates.code = updates.code.toUpperCase();
            // Check for duplicate
            const existingOffer = await Offer.findOne({ code: updates.code, _id: { $ne: id } });
            if (existingOffer) {
                return res.status(400).json({ success: false, message: "Offer code already exists" });
            }
        }

        const updatedOffer = await Offer.findByIdAndUpdate(id, updates, { new: true });
        if (!updatedOffer) return res.status(404).json({ success: false, message: "Offer not found" });

        res.status(200).json({ success: true, message: "Offer updated successfully", offer: updatedOffer });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// 4. Delete Offer (Admin Only)
exports.deleteOffer = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedOffer = await Offer.findByIdAndDelete(id);
        
        if (!deletedOffer) return res.status(404).json({ success: false, message: "Offer not found" });

        res.status(200).json({ success: true, message: "Offer deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};

// 5. Validate Offer (User Only)
exports.validateOffer = async (req, res) => {
    try {
        // Only users can use offers
        if (req.user.role !== "user") {
            return res.status(403).json({ success: false, message: "You cannot access/use this coupon. Only users can use offers." });
        }

        const { code, bookingType } = req.body;

        if (!code || !bookingType) {
            return res.status(400).json({ success: false, message: "Offer code and booking type are required" });
        }

        const offer = await Offer.findOne({ code: code.toUpperCase() });

        if (!offer) {
            return res.status(404).json({ success: false, message: "Invalid offer code" });
        }

        if (!offer.isActive) {
            return res.status(400).json({ success: false, message: "This offer is no longer active" });
        }

        if (new Date() > new Date(offer.validTill)) {
            return res.status(400).json({ success: false, message: "This offer has expired" });
        }

        if (offer.bookingType !== bookingType) {
            return res.status(400).json({ success: false, message: `This offer is only valid for ${offer.bookingType} bookings` });
        }

        res.status(200).json({
            success: true,
            message: "Offer applied successfully",
            discountAmount: offer.discountAmount,
            offerId: offer._id
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
};
