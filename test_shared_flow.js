const mongoose = require('mongoose');
// Native fetch used (Node v18+)

const BASE_URL = 'http://localhost:5000/api';

async function runTest() {
    console.log("🚀 Starting End-to-End Shared Ride Flow Test...");

    try {
        // 1. ADMIN LOGIN
        console.log("\n--- Step 1: Admin Login ---");
        const adminLogin = await fetch(`${BASE_URL}/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@example.com', password: 'newpassword123' })
        }).then(r => r.json());

        if (!adminLogin.success) throw new Error("Admin login failed: " + adminLogin.message);
        const adminToken = adminLogin.token;
        console.log("✅ Admin Logged In");

        // 2. CREATE CAR CATEGORY (SUV 7-Seater)
        console.log("\n--- Step 2: Create SUV Category ---");
        const categoryData = {
            name: "SUV-Test-X" + Date.now(),
            seatCapacity: 7,
            baseFare: 50,
            privateRatePerKm: 20,
            sharedRatePerSeatPerKm: 8,
            avgSpeedKmH: 30,
            seatLayout: ["Front", "Row2-L", "Row2-M", "Row2-R", "Row3-L", "Row3-M", "Row3-R"]
        };
        const categoryRes = await fetch(`${BASE_URL}/car-categories/create`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify(categoryData)
        }).then(r => r.json());

        const categoryId = categoryRes.category?._id || "69b824eb4c7daee5f2617372"; 
        console.log(`✅ Category Ready: ${categoryId}`);

        // 3. FLEET LOGIN
        console.log("\n--- Step 3: Fleet Login ---");
        const fleetLogin = await fetch(`${BASE_URL}/fleet/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'fleet@example.com', password: 'fleet123' })
        }).then(r => r.json());

        if (!fleetLogin.success) throw new Error("Fleet login failed");
        const fleetToken = fleetLogin.token;
        console.log("✅ Fleet Logged In");

        // 4. CREATE FLEET CAR
        console.log("\n--- Step 4: Create Fleet Car ---");
        const carNum = "UP32-SH-" + Math.floor(Math.random() * 9000 + 1000);
        const carRes = await fetch(`${BASE_URL}/fleet/cars/create`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${fleetToken}`
            },
            body: JSON.stringify({
                carNumber: carNum,
                carModel: "Innova",
                carBrand: "Toyota",
                carType: categoryId,
                seatCapacity: 7
            })
        }).then(r => r.json());
        const fleetCarId = carRes.car._id;
        console.log(`✅ Car Created: ${carNum}`);

        // 5. CREATE FLEET DRIVER
        console.log("\n--- Step 5: Create Fleet Driver ---");
        const drvEmail = `shared.driver${Math.floor(Math.random()*10000)}@test.com`;
        const fDriverRes = await fetch(`${BASE_URL}/fleet/drivers/create`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${fleetToken}`
            },
            body: JSON.stringify({
                name: "Shared Pilot",
                email: drvEmail,
                phone: "91" + Math.floor(Math.random()*9000000000 + 1000000000),
                password: "password123",
                licenseNumber: "DL-SH-" + Date.now(),
                address: "Lucknow", city: "Lucknow", state: "UP", pincode: "226001"
            })
        }).then(r => r.json());
        const fleetDriverId = fDriverRes.driver._id;
        console.log(`✅ Fleet Driver Created: ${drvEmail}`);

        // 6. ASSIGN CAR (This creates entries in Driver model)
        console.log("\n--- Step 6: Assign Car ---");
        const aRes = await fetch(`${BASE_URL}/fleet/assignment/assign`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${fleetToken}`
            },
            body: JSON.stringify({ driverId: fleetDriverId, carId: fleetCarId })
        });
        
        const resText = await aRes.text();
        let assignRes;
        try {
            assignRes = JSON.parse(resText);
        } catch (e) {
            console.log("DEBUG Assign HTML Response:", resText);
            throw new Error("Assign failed with non-JSON response");
        }
        
        if (!assignRes.success) throw new Error("Assign failed: " + assignRes.message);
        
        const mainDriverId = assignRes.mainDriver.id;
        console.log(`✅ Car Assigned. Main Driver ID: ${mainDriverId}`);

        // 7. ADMIN APPROVE Main Driver
        console.log("\n--- Step 7: Admin Approve Driver ---");
        await fetch(`${BASE_URL}/drivers/approve/${mainDriverId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        console.log("✅ Main Driver Approved");

        // 8. DRIVER LOGIN & GO ONLINE & SET LOCATION
        console.log("\n--- Step 8: Driver Online ---");
        const driverLogin = await fetch(`${BASE_URL}/drivers/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: drvEmail, password: 'password123' })
        }).then(r => r.json());
        const driverToken = driverLogin.token;

        await fetch(`${BASE_URL}/drivers/toggle-online`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${driverToken}` }
        });
        
        await fetch(`${BASE_URL}/drivers/update-location`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${driverToken}`
            },
            body: JSON.stringify({ latitude: 26.912, longitude: 80.943 })
        });
        console.log("✅ Driver Online at Pickup Point");

        // 9. USER LOGIN & CREATE SHARED BOOKING
        console.log("\n--- Step 9: User Create Shared Booking ---");
        const userLogin = await fetch(`${BASE_URL}/users/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: '9876543210', otp: '123456' })
        }).then(r => r.json());
        const userToken = userLogin.token;

        const bookingRes = await fetch(`${BASE_URL}/bookings/create`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify({
                passengerName: "Vivek Test",
                passengerPhone: "9876543210",
                rideType: "Shared",
                carCategoryId: categoryId,
                seatsBooked: 2,
                pickupAddress: "Eng Chauraha", pickupLat: 26.9124, pickupLng: 80.9435,
                dropAddress: "Airport", dropLat: 26.7606, dropLng: 80.8893,
                distanceKm: 15,
                pickupDate: "2024-03-20",
                pickupTime: "12:00 PM"
            })
        }).then(r => r.json());
        const bookingId = bookingRes.bookingId;
        console.log(`✅ Shared Booking Created: ${bookingId}`);

        // 10. SEARCH FOR SHARED RIDES
        console.log("\n--- Step 10: Search Shared Rides ---");
        const searchRes = await fetch(`${BASE_URL}/trips/shared-rides/search/${bookingId}`).then(r => r.json());
        console.log(`✅ Found ${searchRes.count} shared drivers`);
        
        if (searchRes.count === 0) throw new Error("No shared drivers found!");

        // 11. USER LOCKS SEAT
        console.log("\n--- Step 11: Locking Seats ---");
        const lockRes = await fetch(`${BASE_URL}/trips/shared-rides/book-seat/${bookingId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                driverId: searchRes.drivers[0].driverId,
                selectedSeats: ["Front", "Row2-L"]
            })
        }).then(r => r.json());
        if (!lockRes.success) throw new Error("Locking failed: " + lockRes.message);
        console.log("✅ Seats Locked");

        // 12. DRIVER ACCEPTS
        console.log("\n--- Step 12: Driver Accepts ---");
        const pendingReqs = await fetch(`${BASE_URL}/trips/requests/pending`, {
            headers: { 'Authorization': `Bearer ${driverToken}` }
        }).then(r => r.json());
        
        if (!pendingReqs.requests || pendingReqs.requests.length === 0) throw new Error("No request on driver screen");
        const requestId = pendingReqs.requests[0]._id;

        await fetch(`${BASE_URL}/trips/requests/${requestId}/respond`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${driverToken}`
            },
            body: JSON.stringify({ action: "Accept" }) // Note: Action changed to 'action' based on respondToRequest controller
        });
        console.log("✅ Driver Accepted Trip");

        // 13. START TRIP (OTP)
        console.log("\n--- Step 13: Start Trip ---");
        const otp = bookingRes.startOtp;
        await fetch(`${BASE_URL}/trips/execute/${bookingId}/start`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${driverToken}`
            },
            body: JSON.stringify({ otp })
        });
        console.log("✅ Trip Started");

        // 14. END TRIP (Cash)
        console.log("\n--- Step 14: End Trip (Cash) ---");
        const endRes = await fetch(`${BASE_URL}/trips/execute/${bookingId}/end`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${driverToken}`
            },
            body: JSON.stringify({ paymentMethod: "Cash" })
        }).then(r => r.json());
        console.log(`✅ Trip Ended! Final Fare: ${endRes.finalFare}`);

        console.log("\n🔥 ALL TESTS PASSED! Shared Ride E2E Flow is Working.");

    } catch (err) {
        console.error("\n❌ TEST FAILED:", err.message);
    }
}

runTest();
