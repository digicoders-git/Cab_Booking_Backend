const mongoose = require("mongoose");
const dotEnv = require("dotenv");
dotEnv.config();
const CarCategory = require("./models/CarCategory");

async function testCategoryDirect() {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/capbokkin");
        console.log("1. Connected to MongoDB");

        const categoryName = "Traffic Test Category " + Date.now();
        const catData = {
            name: categoryName,
            seatCapacity: 4,
            privateRatePerKm: 12,
            sharedRatePerSeatPerKm: 5,
            baseFare: 50,
            ratePerMinute: 2.5, // NEW FIELD
            trafficBufferMin: 15 // NEW FIELD
        };

        const newCategory = await CarCategory.create(catData);
        console.log("2. Category created in database!");

        const savedCategory = await CarCategory.findById(newCategory._id);
        console.log(`- Category Name: ${savedCategory.name}`);
        console.log(`- Rate Per Minute: ₹${savedCategory.ratePerMinute}`);
        console.log(`- Traffic Buffer Min: ${savedCategory.trafficBufferMin} minutes`);

        if (savedCategory.ratePerMinute === 2.5 && savedCategory.trafficBufferMin === 15) {
            console.log("\n🎉 SUCCESS! The ratePerMinute and trafficBufferMin are being correctly saved and retrieved from MongoDB.");
        } else {
            console.log("\n❌ FAILED! The new fields were not saved properly.");
        }

        process.exit(0);
    } catch (err) {
        console.error("Test failed", err);
        process.exit(1);
    }
}

testCategoryDirect();
