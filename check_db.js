const mongoose = require('mongoose');
const AreaPricing = require('./models/AreaPricing'); 
require('dotenv').config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/Cab_Booking');
    const areas = await AreaPricing.find();
    console.log("AREAS:", JSON.stringify(areas, null, 2));
    process.exit(0);
}
run();
