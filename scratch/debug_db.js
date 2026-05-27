require('dotenv').config();
const mongoose = require('mongoose');
const BulkBooking = require('../models/BulkBooking');

async function debug() {
    await mongoose.connect(process.env.MONGO_URI);
    const recent = await BulkBooking.find().sort({ createdAt: -1 }).limit(1);
    console.log("Recent BulkBooking advancePayment:", recent[0].advancePayment);
    mongoose.disconnect();
}
debug();
