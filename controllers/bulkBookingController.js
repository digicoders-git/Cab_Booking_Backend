const BulkBooking = require("../models/BulkBooking");
const CarCategory = require("../models/CarCategory");
const FleetCar = require("../models/FleetCar");
const Fleet = require("../models/Fleet");
const { getIO } = require("../socket/socket");

// 1. Create Bulk Booking Request
exports.createBulkBooking = async (req, res) => {
    try {
        const { 
            pickup, drop, pickupDateTime, 
            numberOfDays, totalDistance, carsRequired, offeredPrice, notes 
        } = req.body;

        // Validation
        if (!pickup || !drop || !pickupDateTime || !carsRequired || !offeredPrice) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        // Calculate System Estimated Price
        // Formula: Rate (per KM) * Quantity * Days * Distance
        let systemEstimatedPrice = 0;
        for (const item of carsRequired) {
            const category = await CarCategory.findById(item.category);
            if (category) {
                systemEstimatedPrice += (category.bulkBookingBasePrice || 0) * (item.quantity || 1) * (numberOfDays || 1) * (totalDistance || 0);
            }
        }

        const priceModifiedPercentage = systemEstimatedPrice > 0 
            ? ((offeredPrice - systemEstimatedPrice) / systemEstimatedPrice) * 100 
            : 0;

        const newBooking = await BulkBooking.create({
            createdBy: req.user.id,
            createdByModel: req.user.role === 'admin' ? 'Admin' : 
                            req.user.role === 'agent' ? 'Agent' : 
                            req.user.role === 'vendor' ? 'Vendor' : 
                            req.user.role === 'fleet' ? 'Fleet' : 'User',
            pickup,
            drop,
            pickupDateTime,
            numberOfDays: numberOfDays || 1,
            totalDistance: totalDistance || 0,
            carsRequired,
            systemEstimatedPrice,
            offeredPrice,
            priceModifiedPercentage,
            notes
        });

        // 🛰️ TARGETED NOTIFICATION LOGIC
        // Find Fleets that have the required approved cars
        const requiredCategoryIds = carsRequired.map(c => c.category);
        
        // Find Fleet IDs who have at least one approved car in the requested categories
        const eligibleFleets = await FleetCar.distinct("fleetId", {
            carType: { $in: requiredCategoryIds },
            isApproved: true,
            isActive: true
        });

        if (eligibleFleets.length > 0) {
            try {
                const io = getIO();
                eligibleFleets.forEach(fleetId => {
                    io.to(`fleet_${fleetId.toString()}`).emit("new_bulk_deal", {
                        bookingId: newBooking._id,
                        pickup: pickup.address,
                        drop: drop.address,
                        dateTime: pickupDateTime,
                        offeredPrice: offeredPrice,
                        cars: carsRequired.length
                    });
                });
                console.log(`Targeted Bulk Notification sent to ${eligibleFleets.length} Fleets 🟢`);
            } catch (err) {
                console.error("Socket Error (Bulk Booking):", err.message);
            }
        }

        res.status(201).json({
            success: true,
            message: "Bulk booking request created in Marketplace",
            booking: newBooking
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 2. Get Available Bulk Bookings for Fleets (Marketplace View)
exports.getMarketplace = async (req, res) => {
    try {
        const { id, role } = req.user;

        let query = { status: 'Marketplace' };

        // If it's a Fleet Owner, only show deals relevant to their approved cars
        if (role === 'fleet') {
            const approvedCategories = await FleetCar.distinct("carType", {
                fleetId: id,
                isApproved: true,
                isActive: true
            });
            query["carsRequired.category"] = { $in: approvedCategories };
        }
        
        // Admins see everything in Marketplace
        const bookings = await BulkBooking.find(query)
            .populate("carsRequired.category", "name image")
            .sort({ createdAt: -1 });

        res.json({ success: true, count: bookings.length, bookings });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 3. Accept Bulk Booking (Fleet Action)
exports.acceptBulkBooking = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const fleetId = req.user.id;

        const booking = await BulkBooking.findById(bookingId);
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        if (booking.status !== "Marketplace") {
            return res.status(400).json({ success: false, message: "Sorry, this deal is already taken or unavailable." });
        }

        // Lock the booking
        booking.status = "Accepted";
        booking.assignedFleet = fleetId;
        booking.acceptedAt = new Date();
        await booking.save();

        const fleet = await Fleet.findById(fleetId);

        // Notify Rider (Creator)
        try {
            const io = getIO();
            // User Room is their ID
            io.to(booking.createdBy.toString()).emit("bulk_booking_update", {
                bookingId: booking._id,
                status: "Accepted",
                fleetName: fleet ? fleet.companyName : "A Fleet Owner",
                message: "Your bulk booking has been accepted!"
            });

            // Notify Agents specifically if they created it
            if (booking.createdByModel === 'Agent') {
                io.to(`agent_${booking.createdBy.toString()}`).emit("bulk_booking_update", {
                    bookingId: booking._id,
                    status: "Accepted",
                    fleetName: fleet ? fleet.companyName : "A Fleet Owner"
                });
            }

            // Remove from other fleets' marketplace view
            io.emit("remove_bulk_deal", { bookingId: booking._id });

        } catch (err) {
            console.error("Socket Error (Accept Bulk):", err.message);
        }

        res.json({ success: true, message: "Bulk deal accepted successfully!", booking });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 4. Get Fleet's Own Bulk Bookings
exports.getMyBulkBookings = async (req, res) => {
    try {
        const fleetId = req.user.id;
        const bookings = await BulkBooking.find({ assignedFleet: fleetId })
            .populate("carsRequired.category", "name image")
            .sort({ acceptedAt: -1 });

        res.json({ success: true, count: bookings.length, bookings });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 5. Get Requests Created by Logged In User
exports.getMyCreatedRequests = async (req, res) => {
    try {
        const bookings = await BulkBooking.find({ createdBy: req.user.id })
            .populate("carsRequired.category", "name image")
            .populate("assignedFleet", "companyName phone")
            .sort({ createdAt: -1 });

        res.json({ success: true, count: bookings.length, bookings });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 6. Cancel Bulk Request
exports.cancelBulkBooking = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const booking = await BulkBooking.findById(bookingId);

        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        // Only creator or admin can cancel
        if (booking.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: "Not authorized to cancel this booking" });
        }

        // Can only cancel if in Marketplace or Accepted (before ongoing)
        if (!['Marketplace', 'Accepted'].includes(booking.status)) {
            return res.status(400).json({ success: false, message: `Cannot cancel a ${booking.status} ride` });
        }

        booking.status = 'Cancelled';
        await booking.save();

        // Socket notify
        try {
            getIO().emit("remove_bulk_deal", { bookingId: booking._id });
        } catch (err) {}

        res.json({ success: true, message: "Booking cancelled successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};
