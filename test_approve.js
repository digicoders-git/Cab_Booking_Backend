require('dotenv').config();
const mongoose = require('mongoose');
const Driver = require('./models/Driver');
const AppSetting = require('./models/AppSetting');
const Transaction = require('./models/Transaction');

const connectDB = async () => {
    await mongoose.connect(process.env.MONGO_URI);
};

const testApprove = async () => {
    await connectDB();
    
    // Create a mock referrer
    const referrer = new Driver({
        name: "Mock Referrer",
        email: "mockreferrer" + Date.now() + "@test.com",
        phone: "9999999999",
        password: "test",
        referralCode: "MOCK123"
    });
    await referrer.save();

    // Create a new mock driver
    const newDriver = new Driver({
        name: "Mock Driver",
        email: "mockdriver" + Date.now() + "@test.com",
        phone: "8888888888",
        password: "test",
        referredBy: referrer._id
    });
    await newDriver.save();

    // Simulate approval logic
    try {
        const driver = newDriver;
        const settings = await AppSetting.findOne();
        if (settings && settings.enableDriverIncentive) {
            console.log("Incentives enabled!");
            console.log("Joining Bonus:", settings.driverJoiningBonus);
            console.log("Referral Bonus:", settings.driverReferralBonus);

            // Joining Bonus
            if (settings.driverJoiningBonus > 0) {
                driver.walletBalance += settings.driverJoiningBonus;
                await driver.save();
                console.log("Saved joining bonus to driver");
            }
            
            // Referral Bonus
            if (settings.driverReferralBonus > 0 && driver.referredBy) {
                const ref = await Driver.findById(driver.referredBy);
                if (ref) {
                    ref.walletBalance += settings.driverReferralBonus;
                    await ref.save();
                    console.log("Saved referral bonus to referrer");
                    
                    await Transaction.create({
                        userId: ref._id,
                        userType: "Driver",
                        amount: settings.driverReferralBonus,
                        type: "Credit",
                        context: "Referral Bonus",
                        description: `Received referral bonus for inviting ${driver.name}`,
                        status: "Success",
                        paymentMethod: "Wallet"
                    });
                    console.log("Created transaction");
                } else {
                    console.log("Referrer not found");
                }
            }
        }
    } catch (err) {
        console.error("Incentive Error:", err.message);
        console.error(err);
    }

    process.exit(0);
};

testApprove();
