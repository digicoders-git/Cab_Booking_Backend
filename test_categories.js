const connectDB = require("./config/db");
const mongoose = require("mongoose");
const Admin = require("./models/Admin");
const CarCategory = require("./models/CarCategory");
const Fleet = require("./models/Fleet");
const FleetCar = require("./models/FleetCar");
const Driver = require("./models/Driver");
require("dotenv").config();

async function runTest() {
    try {
        await connectDB();
        console.log("1. Database Connected...");

        // 1. Create an Admin
        const admin = await Admin.findOneAndUpdate(
            { email: "testadmin@gmail.com" },
            { name: "Super Admin", email: "testadmin@gmail.com", password: "password" },
            { upsert: true, new: true }
        );
        console.log("2. Admin Creating/Found Successfully => ID: " + admin._id);

        // 2. Create 2 Car Categories (Sedan & SUV)
        const sedan = await CarCategory.findOneAndUpdate(
            { name: "Sedan" },
            { name: "Sedan", seatCapacity: 4, privateRatePerKm: 15, sharedRatePerSeatPerKm: 6, baseFare: 50, createdBy: admin._id },
            { upsert: true, new: true }
        );
        console.log("3. Car Category 1 (Sedan) Created! => ID: " + sedan._id);

        const suv = await CarCategory.findOneAndUpdate(
            { name: "SUV" },
            { name: "SUV", seatCapacity: 6, privateRatePerKm: 25, sharedRatePerSeatPerKm: 8, baseFare: 100, createdBy: admin._id },
            { upsert: true, new: true }
        );
        console.log("4. Car Category 2 (SUV) Created! => ID: " + suv._id);

        // 3. Create a Fleet Owner
        const fleet = await Fleet.findOneAndUpdate(
            { email: "fleetmaster@gmail.com" },
            { name: "Fleet Master", email: "fleetmaster@gmail.com", phone: "1234567890", password: "pwd", companyName: "Super Travels", address: "Delhi", city: "Delhi", state: "Delhi", pincode: "110001" },
            { upsert: true, new: true }
        );
        console.log("5. Fleet Owner Created! => ID: " + fleet._id);

        // 4. Create FleetCar using Sedan
        const fleetCar = await FleetCar.findOneAndUpdate(
            { carNumber: "DL1A1111" },
            { carNumber: "DL1A1111", carModel: "Dzire", carBrand: "Maruti", carType: sedan._id, fleetId: fleet._id },
            { upsert: true, new: true }
        ).populate("carType");
        console.log("6. Fleet Car Created & Successfully Linked to Category => " + fleetCar.carType.name);

        // 5. Create Independent Driver using SUV
        const driver = await Driver.findOneAndUpdate(
            { email: "driver007@gmail.com" },
            { 
                name: "James Driver", email: "driver007@gmail.com", phone: "9876543210", password: "pwd", 
                "carDetails.carNumber": "DL1B9999", "carDetails.carType": suv._id 
            },
            { upsert: true, new: true }
        ).populate("carDetails.carType");
        
        console.log("7. Independent Driver Created & Successfully Linked to Category => " + driver.carDetails.carType.name);

        console.log("\n✅ ALL TESTS PASSED! Database schema relationships are working perfectly.");

    } catch (error) {
        console.error("Test Failed: ", error);
    } finally {
        mongoose.connection.close();
        process.exit(0);
    }
}

runTest();
