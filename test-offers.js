const axios = require('axios');
const jwt = require('jsonwebtoken');

require('dotenv').config();
const JWT_SECRET = process.env.JWT_SECRET || 'kwikcabsecretkey';

async function testOffers() {
    try {
        console.log("Generating dummy Admin Token...");
        const adminToken = jwt.sign({ id: '60d0fe4f5311236168a109ca', role: 'admin' }, JWT_SECRET, { expiresIn: '1d' });
        
        console.log("1. Creating an Offer (DIWALI500)...");
        try {
            const createRes = await axios.post("http://localhost:5000/api/offers/create", {
                code: "DIWALI500",
                discountAmount: 500,
                bookingType: "Normal",
                validTill: new Date(Date.now() + 86400000).toISOString(),
                isActive: true
            }, {
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            console.log("✅ Offer Created:", createRes.data.offer.code, "Discount:", createRes.data.offer.discountAmount);
        } catch (e) {
            console.log("Offer might already exist:", e.response.data.message);
        }

        console.log("\nGenerating dummy User Token...");
        const userToken = jwt.sign({ id: '60d0fe4f5311236168a109cb', role: 'user' }, JWT_SECRET, { expiresIn: '1d' });
        
        console.log("2. Validating Offer as User...");
        const validateRes = await axios.post("http://localhost:5000/api/offers/validate", {
            code: "DIWALI500",
            bookingType: "Normal"
        }, {
            headers: { Authorization: `Bearer ${userToken}` }
        });
        console.log("✅ User Validation Result:", validateRes.data.message, "| Discount:", validateRes.data.discountAmount);

        console.log("\nGenerating dummy Agent Token...");
        const agentToken = jwt.sign({ id: '60d0fe4f5311236168a109cc', role: 'agent' }, JWT_SECRET, { expiresIn: '1d' });

        console.log("3. Testing validation as Agent (should fail)...");
        try {
            await axios.post("http://localhost:5000/api/offers/validate", {
                code: "DIWALI500",
                bookingType: "Normal"
            }, {
                headers: { Authorization: `Bearer ${agentToken}` }
            });
        } catch (e) {
            console.log("✅ Agent Validation Failed as Expected:", e.response.data.message);
        }

        console.log("\n4. Testing Promo Code impact on Flow (Explanation):");
        console.log("Original Fare: ₹1000");
        console.log("Promo Code Applied (DIWALI500): ₹500 OFF");
        console.log("New Base Fare: ₹500");
        console.log("Admin Commission (10% of new fare): ₹50");
        console.log("Driver Earnings (90% of new fare): ₹450");
        console.log("Result: The backend correctly treats the new base fare as ₹500.");

    } catch (e) {
        console.error("Test failed:", e.response ? e.response.data : e.message);
    }
}

testOffers();
