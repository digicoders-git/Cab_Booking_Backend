const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
require('dotenv').config();

const Vendor = require('./models/Vendor');
const Agent = require('./models/Agent');

async function runTest() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB");

        // 1. Find a vendor
        let vendor = await Vendor.findOne();
        if (!vendor) {
            console.log("No vendor found, creating a dummy vendor...");
            vendor = await Vendor.create({
                name: "Test Vendor",
                email: "testvendor@example.com",
                phone: "9999999999",
                password: "password123",
                companyName: "Test Fleet Services",
                assignedArea: "Delhi",
                isActive: true
            });
        }
        
        console.log(`Using Vendor: ${vendor.name} (${vendor.email})`);

        // 2. Generate Token
        const token = jwt.sign(
            { id: vendor._id, role: "vendor" },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: "1h" }
        );

        // 3. Prepare Dummy Agent Data
        const testAgentEmail = `testagent_${Date.now()}@example.com`;
        const testAgentPhone = `88${Math.floor(10000000 + Math.random() * 90000000)}`;
        
        const payload = {
            name: "Agent Created By Vendor",
            email: testAgentEmail,
            phone: testAgentPhone,
            password: "password123"
        };

        // 4. Hit the API
        console.log("Calling API POST /api/vendor/create-agent...");
        const response = await axios.post('http://localhost:5000/api/vendors/create-agent', payload, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        console.log("API Response:", response.data);

        // 5. Verify in DB
        const newAgent = await Agent.findOne({ email: testAgentEmail });
        if (newAgent) {
            console.log("\n--- DB Verification ---");
            console.log("Agent Name:", newAgent.name);
            console.log("isActive:", newAgent.isActive);
            console.log("isApproved:", newAgent.isApproved);
            console.log("createdByVendor ID:", newAgent.createdByVendor?.toString());
            console.log("Vendor ID matched:", newAgent.createdByVendor?.toString() === vendor._id.toString());
            
            if (newAgent.isActive === false && newAgent.createdByVendor?.toString() === vendor._id.toString()) {
                console.log("SUCCESS: Vendor successfully created a pending Agent!");
            } else {
                console.log("FAILED: Verification checks failed.");
            }
        } else {
            console.log("FAILED: Agent not found in DB.");
        }

    } catch (error) {
        console.error("Test Failed:", error.response ? error.response.data : error.message);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from MongoDB");
    }
}

runTest();
