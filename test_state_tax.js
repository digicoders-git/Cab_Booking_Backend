require('dotenv').config();
const mongoose = require('mongoose');
const StateTax = require('./models/StateTax');
const CarCategory = require('./models/CarCategory');
const { calculateTaxesInternal } = require('./controllers/stateTaxController');

async function testTaxes() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Database connected.");

        // 1. Get any existing car category to test with
        const category = await CarCategory.findOne();
        if (!category) {
            console.log("No car category found. Cannot run test.");
            process.exit(1);
        }
        console.log(`Using Car Category: ${category.name} (${category._id})`);

        // 2. Clean up previous test taxes for "delhi"
        await StateTax.deleteMany({ stateName: 'delhi' });

        // 3. Create a test tax rule
        console.log("\n[1] Creating test State Tax for 'Delhi': ₹250...");
        await StateTax.create({
            stateName: 'delhi',
            taxType: 'State Tax',
            carCategory: category._id,
            amount: 250,
            isActive: true
        });

        console.log("Tax rule created successfully!");

        // 4. Test Scenario A: One Way (UP -> Delhi)
        console.log("\n[2] Testing Scenario A: One Way trip (UP to Delhi)");
        const res1 = await calculateTaxesInternal({
            pickupAddress: "Noida, Uttar Pradesh",
            dropAddress: "Connaught Place, Delhi",
            carCategoryId: category._id,
            tripType: "OneWay"
        });
        console.log("Result A:", JSON.stringify(res1, null, 2));

        // 5. Test Scenario B: Round Trip (UP -> Delhi -> UP)
        console.log("\n[3] Testing Scenario B: Round Trip (UP to Delhi back to UP)");
        const res2 = await calculateTaxesInternal({
            pickupAddress: "Noida, Uttar Pradesh",
            dropAddress: "Connaught Place, Delhi",
            carCategoryId: category._id,
            tripType: "RoundTrip"
        });
        console.log("Result B:", JSON.stringify(res2, null, 2));

        // 6. Test Scenario C: Local Intra-State (Delhi -> Delhi)
        console.log("\n[4] Testing Scenario C: Local Trip (Delhi to Delhi)");
        const res3 = await calculateTaxesInternal({
            pickupAddress: "New Delhi Railway Station, Delhi",
            dropAddress: "Connaught Place, Delhi",
            carCategoryId: category._id,
            tripType: "OneWay"
        });
        console.log("Result C:", JSON.stringify(res3, null, 2));

    } catch (err) {
        console.error("Test failed:", err);
    } finally {
        mongoose.disconnect();
        process.exit(0);
    }
}

testTaxes();
