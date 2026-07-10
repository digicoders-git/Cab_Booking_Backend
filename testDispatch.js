const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect('mongodb://127.0.0.1:27017/cab_booking').then(async () => {
    const User = require('./models/User');
    const Driver = require('./models/Driver');
    const Booking = require('./models/Booking');
    const CarCategory = require('./models/CarCategory');
    const RideRequest = require('./models/RideRequest');
    const tripController = require('./controllers/tripController');
    const { getIO, initSocket } = require('./socket/socket');
    
    const http = require('http');
    const server = http.createServer();
    initSocket(server); // Initialize socket to prevent 'io is undefined' errors

    // 1. Get or create category
    let cat = await CarCategory.findOne();
    if (!cat) cat = await CarCategory.create({ name: 'Mini', type: 'Car', seats: 4 });

    // 2. Ensure we have 2 available drivers
    await Driver.deleteMany({ email: { $in: ['d1@test.com', 'd2@test.com'] } });
    
    const d1 = await Driver.create({ 
        name: 'D1', phone: '1111111111', email: 'd1@test.com', password: 'hash', 
        isOnline: true, isAvailable: true, isActive: true, isApproved: true,
        carDetails: { carType: cat._id },
        currentLocation: { latitude: 28.7, longitude: 77.1 } // near
    });
    const d2 = await Driver.create({ 
        name: 'D2', phone: '2222222222', email: 'd2@test.com', password: 'hash', 
        isOnline: true, isAvailable: true, isActive: true, isApproved: true,
        carDetails: { carType: cat._id },
        currentLocation: { latitude: 28.7, longitude: 77.1 } // near
    });
    
    // 3. Create dummy booking
    let user = await User.findOne();
    if (!user) user = await User.create({ name: 'Test User', phone: '9999999999' });

    const booking = await Booking.create({
        user: user._id,
        carCategory: cat._id,
        passengerDetails: { name: 'Test', phone: '99' },
        rideType: 'Private',
        pickup: { address: 'A', latitude: 28.7, longitude: 77.1 },
        drop: { address: 'B', latitude: 28.8, longitude: 77.2 },
        estimatedDistanceKm: 15,
        fareEstimate: 300,
        bookingStatus: 'Pending',
        tripData: { startOtp: '1234' }
    });

    console.log('--- TEST: autoMatchDriver ---');
    const matchResult = await tripController.autoMatchDriver(booking._id);
    console.log('autoMatchDriver Result:', matchResult);

    const pendingRequests = await RideRequest.find({ booking: booking._id });
    console.log('Pending Requests Created:', pendingRequests.length);

    console.log('--- TEST: Accept by Driver 1 ---');
    // Mock req, res
    const req = {
        params: { requestId: pendingRequests[0]._id },
        body: { action: 'Accept' },
        user: { id: d1._id }
    };
    const res = {
        status: function(c) { this.statusCode = c; return this; },
        json: function(d) { console.log('Accept Response:', d); return this; }
    };
    
    await tripController.respondToRequest(req, res);

    const updatedBooking = await Booking.findById(booking._id);
    console.log('Final Booking Status:', updatedBooking.bookingStatus);
    console.log('Assigned Driver:', updatedBooking.assignedDriver);

    const otherRequest = await RideRequest.findById(pendingRequests[1]._id);
    console.log('Other Driver Request Status:', otherRequest.status);

    console.log('DONE');
    process.exit(0);
}).catch(console.error);
