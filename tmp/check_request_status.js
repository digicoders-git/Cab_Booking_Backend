const mongoose = require("mongoose");
const RideRequest = require("../models/RideRequest");
const Driver = require("../models/Driver");
const Booking = require("../models/Booking");

const checkRequest = async () => {
    try {
        await mongoose.connect("mongodb://localhost:27017/Carbooking");
        console.log("Connected to MongoDB");

        const bookingId = "69c5745ee4d00be9e6e4ffb3";
        const requests = await RideRequest.find({ booking: bookingId }).populate("driver", "name");

        if (requests.length === 0) {
            console.log("No ride requests found for this booking.");
        } else {
            requests.forEach(r => {
                console.log("--- Ride Request Found ---");
                console.log("ID:", r._id);
                console.log("Request Status:", r.status);
                console.log("Driver:", r.driver ? r.driver.name : "None");
                console.log("Created At:", r.createdAt);
            });
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error("Error:", err.message);
    }
};

checkRequest();
