const mongoose = require("mongoose");
const Transaction = require("../models/Transaction");

const checkTransactions = async () => {
    try {
        await mongoose.connect("mongodb://localhost:27017/Carbooking");
        console.log("Connected to MongoDB");

        const bookingId = "69c5745ee4d00be9e6e4ffb3";
        const txs = await Transaction.find({ relatedBooking: bookingId });

        if (txs.length === 0) {
            console.log("No transactions found for this booking.");
        } else {
            txs.forEach(t => {
                console.log("--- Transaction Found ---");
                console.log("ID:", t._id);
                console.log("Amount:", t.amount);
                console.log("Type:", t.type);
                console.log("Category:", t.category);
                console.log("User Model:", t.userModel);
            });
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error("Error:", err.message);
    }
};

checkTransactions();
