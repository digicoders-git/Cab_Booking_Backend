const mongoose = require("mongoose");
require("../models/Driver");
require("../models/User");
require("../models/Agent");
require("../models/CarCategory");
const Booking = require("../models/Booking");

const searchBooking = async () => {
    try {
        await mongoose.connect("mongodb://localhost:27017/Carbooking");
        console.log("Connected to MongoDB");

        // Search for booking with passenger Mohit and phone 7068767516
        const bookings = await Booking.find({
            "passengerDetails.name": "Mohit",
            "passengerDetails.phone": "7068767516"
        }).populate("assignedDriver", "name");

        if (bookings.length === 0) {
            console.log("No booking found for Mohit (7068767516)");
        } else {
            bookings.forEach(b => {
                console.log("--- Booking Found ---");
                console.log("ID:", b._id);
                console.log("Booking Status:", b.bookingStatus);
                console.log("Payment Status:", b.paymentStatus);
                console.log("Fare:", b.fareEstimate);
                console.log("Actual Fare:", b.actualFare);
                console.log("Assigned Driver:", b.assignedDriver ? b.assignedDriver.name : "None");
                console.log("Started At:", b.tripData.startedAt);
                console.log("Ended At:", b.tripData.endedAt);
                console.log("Created At:", b.createdAt);
            });
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error("Error:", err.message);
    }
};

searchBooking();
