const mongoose = require('mongoose');
const { sendPushNotification } = require('./utils/fcmNotification');
const Driver = require('./models/Driver');
require('dotenv').config();

async function testPush() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to local DB.");

        const driver = await Driver.findOne({ fcmToken: { $exists: true, $type: "string", $ne: "" } });
        if (!driver || !driver.fcmToken) {
            console.log("No driver found with FCM token in local DB!");
            process.exit(1);
        }

        console.log("Found Driver:", driver.name, "with token:", driver.fcmToken.substring(0, 10));

        const payloadData = {
            bookingId: "TEST_BOOKING_123",
            requestId: "TEST_REQUEST_123",
            type: "NEW_RIDE_REQUEST",
            pickup: "Test Pickup Location, MG Road",
            drop: "Test Drop Location, Airport",
            fare: "250",
            distance: "12.5",
            rideType: "Private",
            stopsCount: "1",
            expiresAt: (Date.now() + 16000).toString(),
        };

        console.log("Sending Payload Data:", payloadData);

        const response = await sendPushNotification(driver.fcmToken, {
            title: "New Ride: Rs.250",
            body: "Test ride from local backend",
            data: payloadData
        });
        
        console.log("FCM Response:", response);
        
    } catch (err) {
        console.error("Error:", err);
    }
    process.exit(0);
}

testPush();
