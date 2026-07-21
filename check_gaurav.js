const mongoose = require('mongoose');
const MONGO_URI = 'mongodb://127.0.0.1:27017/Carbooking';

async function checkGaurav() {
    try {
        await mongoose.connect(MONGO_URI);
        const db = mongoose.connection.db;
        
        // Search in users, drivers, agents, etc.
        const collections = ['drivers', 'users', 'vendors', 'agents'];
        for (let collName of collections) {
            const collection = db.collection(collName);
            // Case-insensitive regex search
            const doc = await collection.findOne({ email: { $regex: /gaurav@gmail.com/i } });
            console.log(`Searching in collection '${collName}':`, doc ? 'FOUND' : 'NOT FOUND');
            if (doc) {
                console.log(JSON.stringify(doc, null, 2));
            }
        }
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await mongoose.disconnect();
    }
}

checkGaurav();
