const axios = require('axios');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const connectDB = require('../config/db');
const BulkBooking = require('../models/BulkBooking');
const Admin = require('../models/Admin');

async function testReceipt() {
    try {
        await connectDB();
        
        // Find any bulk booking
        const booking = await BulkBooking.findOne();
        if (!booking) {
            console.log("No bulk bookings found in the database. Test skipped.");
            process.exit(0);
        }

        console.log(`Found booking: ${booking._id}`);

        // Find an admin and generate a token
        const admin = await Admin.findOne();
        if (!admin) {
            console.log("No admin found for testing. Test skipped.");
            process.exit(0);
        }

        const token = jwt.sign(
            { id: admin._id, role: "admin" },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

        console.log("Generated Admin Token. Calling API...");

        // Call the API
        const response = await axios.get(`http://localhost:5000/api/bulk-bookings/receipt/${booking._id}`, {
            headers: {
                Authorization: `Bearer ${token}`
            },
            responseType: 'arraybuffer' // We expect a PDF binary
        });

        if (response.status === 200 && response.headers['content-type'] === 'application/pdf') {
            console.log("✅ SUCCESS! PDF Receipt generated correctly.");
            console.log(`Received ${response.data.length} bytes of PDF data.`);
        } else {
            console.log("❌ Failed! Status:", response.status, "Content-Type:", response.headers['content-type']);
        }

    } catch (error) {
        console.error("Test failed with error:", error.response ? error.response.data : error.message);
    } finally {
        mongoose.connection.close();
    }
}

testReceipt();
