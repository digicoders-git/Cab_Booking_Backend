const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });
const Booking = require('./models/Booking');

async function check() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/Carbooking');
        let b = await Booking.findOne({ bookingStatus: { $in: ['Accepted', 'Ongoing'] } });
        if (!b) {
            b = await Booking.findOne();
        }
        if (b) {
            console.log("FOUND_BOOKING_ID=" + b._id.toString());
            console.log("STATUS=" + b.bookingStatus);
        } else {
            console.log("NO_BOOKINGS_FOUND");
        }
    } catch (e) {
        console.error("DB_ERROR:", e.message);
    }
    process.exit(0);
}

check();
