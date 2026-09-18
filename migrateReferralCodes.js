const mongoose = require('mongoose');
require('dotenv').config();
const Driver = require('./models/Driver');
const Fleet = require('./models/Fleet');
const Vendor = require('./models/Vendor');
const Admin = require('./models/Admin');
const { generateReferralCode } = require('./utils/referralUtils');

async function migrateCodes() {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb+srv://developer:667z2225@cluster0.zox7b.mongodb.net/Kwik_cab");
        console.log("Connected to DB...");

        const models = [Driver, Fleet, Vendor, Admin];
        for (const Model of models) {
            const users = await Model.find({ referralCode: { $exists: false } });
            console.log(`Found ${users.length} users in ${Model.modelName} needing referral codes.`);
            for (const user of users) {
                user.referralCode = await generateReferralCode();
                await user.save();
                console.log(`Assigned code ${user.referralCode} to ${Model.modelName} ${user.email}`);
            }

            const nullUsers = await Model.find({ referralCode: null });
            console.log(`Found ${nullUsers.length} users with null codes in ${Model.modelName}.`);
            for (const user of nullUsers) {
                user.referralCode = await generateReferralCode();
                await user.save();
                console.log(`Assigned code ${user.referralCode} to ${Model.modelName} ${user.email}`);
            }
        }
        console.log("Migration complete!");
        process.exit(0);
    } catch (err) {
        console.error("Migration error:", err);
        process.exit(1);
    }
}

migrateCodes();
