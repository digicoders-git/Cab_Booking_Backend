const mongoose = require("mongoose");
const BulkBooking = require("../models/BulkBooking");
const FleetCar = require("../models/FleetCar");
const Fleet = require("../models/Fleet");

async function checkData() {
    try {
        await mongoose.connect("mongodb://localhost:27017/Carbooking");
        console.log("Connected to MongoDB\n");

        const marketplaces = await BulkBooking.find({ status: "Marketplace" });
        console.log(`Active Marketplace Deals: ${marketplaces.length}`);
        marketplaces.forEach(b => {
            console.log(`- Deal ID: ${b._id}, Required Categories: ${b.carsRequired.map(c => c.category)}`);
        });

        const fleets = await Fleet.find();
        console.log(`\nTotal Fleets: ${fleets.length}`);
        for (const f of fleets) {
            const cars = await FleetCar.find({ fleetId: f._id });
            console.log(`- Fleet: ${f.companyName} (${f.email})`);
            console.log(`  Cars: ${cars.length}`);
            cars.forEach(c => {
                console.log(`    * Tag: ${c.carNumber}, Approved: ${c.isApproved}, Active: ${c.isActive}, CatID: ${c.carType}`);
            });
            
            // Simulating marketplace query
            const approvedCategories = await FleetCar.distinct("carType", {
                fleetId: f._id,
                isApproved: true,
                isActive: true
            });
            console.log(`  Approved Categories for this Fleet: ${approvedCategories}`);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkData();
