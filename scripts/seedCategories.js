const mongoose = require('mongoose');
require('dotenv').config();
const CarCategory = require('../models/CarCategory');

async function sedCategories() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const categories = [
            {
                name: 'Sedan',
                seatCapacity: 4,
                baseFare: 50,
                privateRatePerKm: 12,
                sharedRatePerSeatPerKm: 4,
                seatLayout: ['Front', 'Back-Left', 'Back-Middle', 'Back-Right'],
                isActive: true
            },
            {
                name: 'Bike',
                seatCapacity: 1,
                baseFare: 20,
                privateRatePerKm: 5,
                sharedRatePerSeatPerKm: 5,
                seatLayout: ['Rear'],
                isActive: true
            },
            {
                name: 'Auto',
                seatCapacity: 3,
                baseFare: 30,
                privateRatePerKm: 8,
                sharedRatePerSeatPerKm: 3,
                seatLayout: ['Left', 'Middle', 'Right'],
                isActive: true
            }
        ];

        for (const cat of categories) {
            await CarCategory.findOneAndUpdate({ name: cat.name }, cat, { upsert: true, new: true });
            console.log(`Category ${cat.name} created/updated`);
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

sedCategories();
