const { sendPushNotification } = require('./utils/fcmNotification');
const admin = require('./config/firebaseAdmin');

async function testPush() {
    const token = process.argv[2];
    if (!token) {
        console.log("Please provide FCM token as argument: node test_push.js <token>");
        process.exit(1);
    }

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

    try {
        const response = await sendPushNotification(token, {
            title: "New Ride: Rs.250",
            body: "Test ride from backend",
            data: payloadData
        });
        console.log("FCM Response:", response);
    } catch (err) {
        console.error("FCM Error:", err);
    }
    process.exit(0);
}

testPush();
