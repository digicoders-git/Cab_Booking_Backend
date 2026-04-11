const mongoose = require('mongoose');
const AreaPricing = require('./models/AreaPricing');

const uri = "mongodb://localhost:27017/Carbooking";

mongoose.connect(uri).then(async () => {
    const lucknow = await AreaPricing.findOne({ areaName: /Lucknow/i });
    console.log("Lucknow Pricing Data:");
    if (lucknow) {
        console.log(JSON.stringify(lucknow, null, 2));
    } else {
        console.log("Lucknow area not found in database!");
    }
    
    const count = await AreaPricing.countDocuments({ isActive: true });
    console.log("Total Active Areas:", count);
    
    process.exit(0);
}).catch(err => {
    console.error("DB Error:", err);
    process.exit(1);
});
