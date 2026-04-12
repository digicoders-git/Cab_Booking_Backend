const axios = require('axios');

const ADMIN_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5YjQwMWY4YjY3ZmYyYWZhODdmNjJhZiIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc3NTk5MDcyN30.6zLKMGolg8R-3vtdkg8es1OFexai3qoyjSiev3R6Hbs";
const FLEET_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5Y2E0OWZmN2QxMTI0YjAwYjZjYjE5YSIsInJvbGUiOiJmbGVldCIsImlhdCI6MTc3NTk5MDcyN30.aqz-xjcQPsIqHZDHp_KuPhcoxDyn9oJGtQVH8kjgdB4";
const CATEGORY_ID = "69cba93a52c87a096b09bb8e";
const BASE_URL = "http://localhost:5000/api";

async function runTest() {
  try {
    console.log("🚀 Starting Full Flow Test...");

    // 1. Create Bulk Booking
    console.log("\n1. Creating Bulk Booking as Admin...");
    const createRes = await axios.post(`${BASE_URL}/bulk-bookings/create`, {
      pickup: { address: "City Mall, Delhi", latitude: 28.6139, longitude: 77.2090 },
      drop: { address: "Agra Fort, Agra", latitude: 27.1750, longitude: 78.0422 },
      pickupDateTime: "2026-05-20T10:00:00",
      numberOfDays: 2,
      carsRequired: [{ category: CATEGORY_ID, quantity: 2 }],
      offeredPrice: 12500,
      notes: "Test automated flow"
    }, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` }
    });
    
    const bookingId = createRes.data.booking._id;
    console.log("✅ Booking Created! ID:", bookingId);

    // 2. View Marketplace as Fleet
    console.log("\n2. Checking Marketplace as Fleet Owner...");
    const marketplaceRes = await axios.get(`${BASE_URL}/bulk-bookings/marketplace`, {
      headers: { Authorization: `Bearer ${FLEET_TOKEN}` }
    });
    
    console.log(`✅ Marketplace View Successful! Found ${marketplaceRes.data.count} deals.`);
    const found = marketplaceRes.data.bookings.find(b => b._id === bookingId);
    if (!found) throw new Error("Booking not found in marketplace!");
    console.log("🎯 Correct Booking confirmed in Marketplace.");

    // 3. Accept Booking as Fleet
    console.log("\n3. Accepting Booking as Fleet Owner...");
    const acceptRes = await axios.post(`${BASE_URL}/bulk-bookings/accept/${bookingId}`, {}, {
      headers: { Authorization: `Bearer ${FLEET_TOKEN}` }
    });
    
    if (acceptRes.data.booking.status === 'Accepted') {
      console.log("✅ Deal Accepted! Status:", acceptRes.data.booking.status);
      console.log("✅ Assigned Fleet ID:", acceptRes.data.booking.assignedFleet);
    } else {
      throw new Error(`Unexpected status: ${acceptRes.data.booking.status}`);
    }

    console.log("\n🎉 FULL FLOW TEST COMPLETED SUCCESSFULLY!");

  } catch (error) {
    console.error("\n❌ TEST FAILED!");
    console.error("Error Message:", error.response?.data?.message || error.message);
    if (error.response?.data?.error) console.error("Detailed Error:", error.response.data.error);
  }
}

runTest();
