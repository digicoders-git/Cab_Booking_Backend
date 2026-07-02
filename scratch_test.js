require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('./models/Admin');
const Agent = require('./models/Agent');
const BulkBooking = require('./models/BulkBooking');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

async function runTest() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to DB.");

        // 1. Get or Create an Admin
        let admin = await Admin.findOne({ role: 'SuperAdmin' });
        if (!admin) {
            console.log("No SuperAdmin found. Exiting test.");
            process.exit(1);
        }
        
        // 2. Get or Create an Agent for commission testing
        let agent = await Agent.findOne({});
        if (!agent) {
             agent = await Agent.create({ name: 'Test Agent', phone: '1231231231', password: 'abc', role: 'agent' });
        }
        const initialAgentBalance = agent.walletBalance || 0;

        // 3. Generate Admin Token
        const adminToken = jwt.sign({ id: admin._id, role: 'SuperAdmin' }, process.env.JWT_SECRET, { expiresIn: '1h' });

        // 4. Create a dummy Bulk Booking in Marketplace
        const booking = await BulkBooking.create({
            createdBy: agent._id,
            createdByModel: 'Agent',
            pickup: { address: 'Delhi', latitude: 28.7, longitude: 77.1 },
            drop: { address: 'Gurgaon', latitude: 28.4, longitude: 77.0 },
            pickupDateTime: new Date(),
            status: 'Marketplace',
            offeredPrice: 5000,
            carsRequired: [] // empty for test
        });
        console.log("Created Mock BulkBooking in Marketplace. ID:", booking._id);

        // 5. Test ACCEPT API via Axios
        console.log("\n--- Testing Accept Bulk Booking ---");
        const acceptRes = await axios.post(`${BASE_URL}/bulk-bookings/accept/${booking._id}`, {}, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        console.log("Accept Response:", acceptRes.data.message);

        // Verify status
        const acceptedBooking = await BulkBooking.findById(booking._id);
        console.log("Status after accept:", acceptedBooking.status);
        console.log("Assigned Admin ID:", acceptedBooking.assignedAdmin);

        // 6. Test END API via Axios
        console.log("\n--- Testing End Bulk Booking ---");
        const endRes = await axios.post(`${BASE_URL}/bulk-bookings/end/${booking._id}`, {}, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        console.log("End Response:", endRes.data.message);

        // Verify Commission
        const updatedAgent = await Agent.findById(agent._id);
        console.log(`Agent Initial Balance: ${initialAgentBalance}, New Balance: ${updatedAgent.walletBalance}`);

        console.log("\n=== TEST PASSED SUCCESSFULLY ===");

    } catch (err) {
        console.error("Test Failed:", err.response ? err.response.data : err.message);
    } finally {
        await mongoose.disconnect();
    }
}

runTest();
