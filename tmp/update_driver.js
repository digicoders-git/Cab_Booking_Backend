const mongoose = require('mongoose');
require('dotenv').config();
const Driver = require('../models/Driver');

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const bikeffId = '69c11a1fc16cb96bbe631f6c'; 
        
        // Pushal sir ko Bikeff se link kar rahe hain
        const result = await Driver.updateOne(
            { _id: '69b84b1bbed40b1c81e66a46' },
            { $set: { 'carDetails.carType': new mongoose.Types.ObjectId(bikeffId) } }
        );
        
        console.log('--- Data Update Result ---');
        console.log('Matched:', result.matchedCount, 'Updated:', result.modifiedCount);
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
