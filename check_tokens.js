const mongoose = require("mongoose");
require("dotenv").config();
const Fleet = require("./models/Fleet");

async function checkTokens() {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/Carbooking");
    const fleets = await Fleet.find({}, "name companyName fcmToken");
    console.log("--- FLEET TOKENS STATUS ---");
    fleets.forEach(f => {
        console.log(`Name: ${f.name} | Co: ${f.companyName} | Token: ${f.fcmToken ? (f.fcmToken.substring(0, 10) + "...") : "MISSING"}`);
    });
    await mongoose.connection.close();
}

checkTokens();
