const axios = require('axios');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

require('dotenv').config();
const JWT_SECRET = process.env.JWT_SECRET || 'kwikcabsecretkey';

async function testBookingFlow() {
    try {
        console.log("Generating User Token...");
        const userToken = jwt.sign({ id: new mongoose.Types.ObjectId().toString(), role: 'user' }, JWT_SECRET, { expiresIn: '1d' });

        // First, get a car category ID
        // Because we don't know the ID, we'll try to find one from the DB or mock it.
        // Actually, we can fetch active car categories
        const catRes = await axios.get("http://localhost:5000/api/car-categories/active");
        if (!catRes.data.categories || catRes.data.categories.length === 0) {
            console.log("No car categories found to test booking.");
            return;
        }
        const carCategoryId = catRes.data.categories[0]._id;

        const bookingPayload = {
            passengerName: "Test User",
            passengerPhone: "9876543210",
            rideType: "Private",
            carCategoryId: carCategoryId,
            seatsBooked: 4,
            pickupAddress: "Lucknow Junction",
            pickupLat: 26.83,
            pickupLng: 80.92,
            dropAddress: "Hazratganj",
            dropLat: 26.84,
            dropLng: 80.93,
            distanceKm: 5,
        };

        console.log("\n=====================================");
        console.log("TEST 1: Booking WITHOUT Promo Code");
        console.log("=====================================");
        try {
            const res1 = await axios.post("http://localhost:5000/api/bookings/create", bookingPayload, {
                headers: { Authorization: `Bearer ${userToken}` }
            });
            console.log("✅ Booking Success!");
            console.log(`Original Fare Estimate: ₹${res1.data.fareEstimate}`);
        } catch (e) {
            console.log("Failed:", e.response ? e.response.data : e.message);
        }

        console.log("\n=====================================");
        console.log("TEST 2: Booking WITH Promo Code (DIWALI500)");
        console.log("=====================================");
        try {
            const bookingPayloadWithCode = { ...bookingPayload, offerCode: "DIWALI500" };
            const res2 = await axios.post("http://localhost:5000/api/bookings/create", bookingPayloadWithCode, {
                headers: { Authorization: `Bearer ${userToken}` }
            });
            console.log("✅ Booking Success!");
            console.log(`Discounted Fare Estimate: ₹${res2.data.fareEstimate}`);
        } catch (e) {
            console.log("Failed:", e.response ? e.response.data : e.message);
        }

    } catch (e) {
        console.error("Critical Test Error:", e.message);
    }
}

testBookingFlow();
