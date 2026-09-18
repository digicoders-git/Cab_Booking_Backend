require('dotenv').config();
const mongoose = require('mongoose');
const Driver = require('./models/Driver');
const Transaction = require('./models/Transaction');

const connectDB = async () => {
    await mongoose.connect(process.env.MONGO_URI);
};

const check = async () => {
    await connectDB();

    const drivers = await Driver.find({}).sort({ createdAt: -1 }).limit(5);
    console.log("Recent Drivers:");
    for (let d of drivers) {
        console.log(`- ${d.name} | Wallet: ${d.walletBalance} | RefCode: ${d.referralCode} | ReferredBy: ${d.referredBy}`);
    }

    const txs = await Transaction.find({ context: "Referral Bonus" }).sort({ createdAt: -1 }).limit(5);
    console.log("\nRecent Referral Transactions:");
    for (let t of txs) {
        console.log(`- User: ${t.userId} | Amt: ${t.amount} | Desc: ${t.description}`);
    }

    process.exit(0);
};

check();
