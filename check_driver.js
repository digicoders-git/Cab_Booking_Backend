const mongoose = require("mongoose");
const connectDB = require("./config/db");

require("dotenv").config();

async function checkPartial() {
    await connectDB();
    const collections = await mongoose.connection.db.listCollections().toArray();
    for (let col of collections) {
        const result = await mongoose.connection.db.collection(col.name).findOne({ email: { $regex: "abbasvasif", $options: "i" } });
        if (result) {
            console.log(`Found partial match in collection: ${col.name}, email: ${result.email}`);
        }
    }
    
    console.log("Search complete.");
    mongoose.disconnect();
}

checkPartial();
