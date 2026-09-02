const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

const connectDB = require('./config/db');
const Booking = require('./models/Booking');
const User = require('./models/User');

async function testReceiptAPI() {
    try {
        await connectDB();
        
        // 1. Find a booking
        const booking = await Booking.findOne({}).sort({ createdAt: -1 });
        if (!booking) {
            console.log("No bookings found in DB to test.");
            process.exit(1);
        }
        console.log(`Found Booking ID: ${booking._id}`);
        console.log(`Fare Details - Estimate: ${booking.fareEstimate}, Actual: ${booking.actualFare}`);

        // 2. Generate token for a user to bypass auth
        const user = await User.findOne({});
        if (!user) {
            console.log("No users found to generate token.");
            process.exit(1);
        }
        
        const token = jwt.sign(
            { id: user._id, role: 'user' },
            process.env.JWT_SECRET || 'kwikcab_secret_key', // fallback if env is missing
            { expiresIn: '1h' }
        );

        // 3. Hit the API endpoint
        console.log("Hitting API: http://localhost:5000/api/bookings/receipt/" + booking._id);
        const response = await axios.get(`http://localhost:5000/api/bookings/receipt/${booking._id}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            },
            responseType: 'arraybuffer'
        });

        if (response.status === 200) {
            const fileName = `test_receipt_output_${booking._id}.pdf`;
            fs.writeFileSync(fileName, response.data);
            console.log(`✅ SUCCESS! PDF downloaded and saved as ${fileName}`);
            console.log(`File Size: ${(response.data.length / 1024).toFixed(2)} KB`);
        } else {
            console.log("Failed with status:", response.status);
        }

    } catch (error) {
        console.error("❌ ERROR while testing API:");
        if (error.response) {
            console.error(error.response.status, error.response.data.toString());
        } else {
            console.error(error.message);
        }
    } finally {
        mongoose.connection.close();
        process.exit(0);
    }
}

testReceiptAPI();
