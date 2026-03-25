const mongoose = require('mongoose');
require('dotenv').config();
const CarCategory = require('../models/CarCategory');

async function cleanupCarCategories() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB for cleanup.");

        const allCategories = await CarCategory.find();
        let fixCount = 0;

        for (const cat of allCategories) {
            let layout = cat.seatLayout;
            let needsFix = false;

            // Check if layout has only one element and it's a stringified array
            if (layout.length === 1 && layout[0].startsWith('[')) {
                try {
                    const parsed = JSON.parse(layout[0]);
                    if (Array.isArray(parsed)) {
                        cat.seatLayout = parsed;
                        needsFix = true;
                    }
                } catch (e) {
                    // Not valid JSON stringified array, skip
                }
            }

            if (needsFix) {
                await cat.save();
                console.log(`Fixed seatLayout for category: ${cat.name}`);
                fixCount++;
            }
        }

        console.log(`Cleanup finished. Fixed ${fixCount} categories.`);
        process.exit(0);
    } catch (err) {
        console.error("Cleanup error:", err);
        process.exit(1);
    }
}

cleanupCarCategories();
