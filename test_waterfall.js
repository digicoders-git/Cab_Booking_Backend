const mongoose = require('mongoose');
const Driver = require('./models/Driver');
const Booking = require('./models/Booking');
const RideRequest = require('./models/RideRequest');
require('dotenv').config();

async function runTest() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/capbokkin');
        console.log('--- SYSTEM CHECK ---');

        // 1. Get a Category ID
        const CarCategory = require('./models/CarCategory');
        const cat = await CarCategory.findOne({ name: 'Bike' });
        if(!cat) { console.log('Bike category not found'); return; }
        const catId = cat._id.toString();

        // 2. Prepare 2 Drivers (Driver A: Near, Driver B: Farther)
        await Driver.findByIdAndUpdate('69b4086b442ada9f121be955', {
            isOnline: true, isAvailable: true, isApproved: true, isActive: true,
            'carDetails.carType': catId,
            currentLocation: { latitude: 26.9124, longitude: 80.9436 }
        });

        await Driver.findByIdAndUpdate('69b408de442ada9f121be95f', {
            isOnline: true, isAvailable: true, isApproved: true, isActive: true,
            'carDetails.carType': catId,
            currentLocation: { latitude: 26.9124, longitude: 80.9480 }
        });

        console.log('Drivers set to Online & Near Engineering Chauraha.');

        // 3. Login as User to get token
        const loginRes = await fetch('http://localhost:5000/api/users/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: '9876543210', otp: '123456' })
        });
        const loginData = await loginRes.json();
        const token = loginData.token;
        console.log('User logged in. Token acquired.');

        // 4. Create Booking via API
        console.log('\n--- STARTING WATERFALL TEST ---');
        const bookingRes = await fetch('http://localhost:5000/api/bookings/create', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                passengerName: "Test User",
                passengerPhone: "0000000000",
                rideType: "Private",
                carCategoryId: catId,
                seatsBooked: 1,
                pickupAddress: "Engineering Chauraha",
                pickupLat: 26.9124,
                pickupLng: 80.9435,
                dropAddress: "Airport",
                dropLat: 26.7606,
                dropLng: 80.8893,
                distanceKm: 15,
                pickupDate: "2024-03-20",
                pickupTime: "12:00 PM"
            })
        });

        const bookingData = await bookingRes.json();
        const bookingId = bookingData.bookingId;
        console.log('Booking Created ID:', bookingId);
        console.log('Watching RideRequests in database for 90 seconds...');

        // 监控 RideRequests
        for (let i = 0; i < 3; i++) {
            console.log(`\nWaiting 32s for Waterfall step...`);
            await new Promise(r => setTimeout(r, 32000)); 
            const requests = await RideRequest.find({ booking: bookingId }).populate('driver', 'name');
            console.log(`[T+${(i+1)*30}s] Status of Requests:`);
            if (requests.length === 0) console.log("- No requests found yet.");
            requests.forEach(r => {
                console.log(`- Driver: ${r.driver.name} | Status: ${r.status}`);
            });
        }

        console.log('\nTest Complete.');
        process.exit(0);

    } catch (err) {
        console.error('Test Failed:', err.message);
        process.exit(1);
    }
}

runTest();
