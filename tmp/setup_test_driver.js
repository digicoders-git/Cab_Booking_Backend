const mongoose = require('mongoose');
require('dotenv').config();
const Driver = require('../models/Driver');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/capbokkin';

async function setup() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to DB");

        const testEmail = "driver_test_99@gmail.com";
        const testPhone = "9988776655";

        // 1. Cleanup old test driver if exists
        await Driver.deleteOne({ email: testEmail });

        // 2. Create Driver (Direct DB)
        const driver = await Driver.create({
            name: "Test Driver GPT",
            email: testEmail,
            phone: testPhone,
            password: "password123",
            isApproved: true,
            isActive: true,
            isOnline: true, // Directly make them online
            currentLocation: {
                latitude: 26.85,
                longitude: 80.95,
                lastUpdated: new Date()
            },
            carDetails: {
                carType: "69bd53c7b37aab9a75dc8e17", // Sedan
                carNumber: "TEST99",
                carModel: "Swift",
                carBrand: "Maruti"
            }
        });
        console.log("Driver created and status set to ONLINE with LOCATION directly in DB.");
        console.log("Driver ID:", driver._id);

        await mongoose.disconnect();
        console.log("Done.");
    } catch (error) {
        console.error("Error:", error.message);
        process.exit(1);
    }
}

setup();
