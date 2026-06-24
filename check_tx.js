const mongoose = require('mongoose');
const Transaction = require('./models/Transaction');
const dotenv = require('dotenv');

dotenv.config();

async function checkTx() {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/CabBooking");
        const txs = await Transaction.find().sort({ createdAt: -1 }).limit(5);
        console.log(JSON.stringify(txs, null, 2));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

checkTx();
