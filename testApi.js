const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

async function runTest() {
    console.log("Connecting to Database...");
    await mongoose.connect('mongodb://127.0.0.1:27017/Carbooking');
    
    const DriverModel = require('./models/Driver');
    
    // Create a mock driver
    const fakeDriverId = new mongoose.Types.ObjectId();
    await DriverModel.create({
        _id: fakeDriverId,
        name: "API Test Driver",
        email: `test${Date.now()}@driver.com`,
        phone: `999${Math.floor(Math.random() * 10000000)}`,
        password: "password123",
        isActive: true,
        isVerified: true
    });
    
    // Generate Token
    const token = jwt.sign({ id: fakeDriverId.toString(), role: 'driver' }, 'mysupersecret', { expiresIn: '1d' });
    console.log("Generated Token:", token);
    
    console.log("\n--- TESTING SET DESTINATION ---");
    // Test the limit (should succeed 4 times, fail the 5th)
    for (let i = 1; i <= 5; i++) {
        try {
            const res = await fetch('http://localhost:5000/api/drivers/set-destination', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    latitude: 28.7041,
                    longitude: 77.1025,
                    address: `Test Location ${i}`
                })
            });
            const data = await res.json();
            console.log(`Attempt ${i}: Status ${res.status} ->`, data);
        } catch (e) {
            console.error(`Attempt ${i} Failed:`, e);
        }
    }
    
    console.log("\n--- TESTING CLEAR DESTINATION ---");
    try {
        const res = await fetch('http://localhost:5000/api/drivers/clear-destination', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await res.json();
        console.log(`Clear API: Status ${res.status} ->`, data);
    } catch (e) {
        console.error("Clear API Failed:", e);
    }
    
    // Cleanup
    console.log("\nCleaning up database...");
    await DriverModel.deleteOne({ _id: fakeDriverId });
    console.log("Cleanup done.");
    
    process.exit(0);
}

runTest();
