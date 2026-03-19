const mongoose = require("mongoose");
const dotEnv = require("dotenv");
dotEnv.config();

const Driver = require("./models/Driver");

const test = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/capbokkin");
        console.log("Connected to MongoDB");

        // Find or create a driver for testing
        let driver = await Driver.findOne({ email: "test.driver@example.com" });
        if (!driver) {
            const bcrypt = require("bcryptjs");
            const hashedPassword = await bcrypt.hash("password123", 10);
            driver = await Driver.create({
                name: "Test Driver",
                email: "test.driver@example.com",
                phone: "9998887776",
                password: hashedPassword,
                walletBalance: 2000, // Giving some balance for testing
                isApproved: true,
                isActive: true,
                bankDetails: {
                    accountNumber: "123456789",
                    ifscCode: "SBIN0001",
                    bankName: "Test Bank",
                    accountHolderName: "Test Driver"
                }
            });
            console.log("Test Driver Created with 2000 balance");
        } else {
            driver.walletBalance = 2000; // Reset balance for test
            await driver.save();
            console.log("Existing Test Driver wallet balance reset to 2000");
        }
        process.exit(0);
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

test();
