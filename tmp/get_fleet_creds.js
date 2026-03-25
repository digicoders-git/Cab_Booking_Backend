const mongoose = require('mongoose');
const Fleet = require('../models/Fleet');
require('dotenv').config();

async function getFleet() {
    await mongoose.connect(process.env.MONGO_URI);
    const fleet = await Fleet.findOne();
    if (fleet) {
        console.log('EMAIL:', fleet.email);
        console.log('PASSWORD:', fleet.password);
    } else {
        console.log('No fleet found');
    }
    process.exit();
}

getFleet();
