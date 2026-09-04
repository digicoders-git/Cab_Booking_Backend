const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const BulkBooking = require('../models/BulkBooking');
const FixedBooking = require('../models/FixedBooking');
const AgentLead = require('../models/AgentLead');
require('dotenv').config({ path: '../.env' });

async function countAllBookings() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/Carbooking');

        const privateCount = await Booking.countDocuments({ rideType: 'Private' });
        const sharedCount = await Booking.countDocuments({ rideType: 'Shared' });
        const bulkCount = await BulkBooking.countDocuments();
        const fixedCount = await FixedBooking.countDocuments();
        const agentLeadCount = await AgentLead.countDocuments();

        console.log('--- Database Booking Counts ---');
        console.log(`1. Normal Private Bookings: ${privateCount}`);
        console.log(`2. Normal Shared Bookings: ${sharedCount}`);
        console.log(`3. Bulk/Outstation Bookings: ${bulkCount}`);
        console.log(`4. Fixed Route Bookings: ${fixedCount}`);
        console.log(`5. Agent Lead Bookings (Marketplace): ${agentLeadCount}`);
        
        console.log(`\nTotal Bookings in Database: ${privateCount + sharedCount + bulkCount + fixedCount + agentLeadCount}`);

    } catch (error) {
        console.error('Error connecting or counting:', error);
    } finally {
        await mongoose.disconnect();
    }
}

countAllBookings();
