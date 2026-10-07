const mongoose = require('mongoose');
const BulkBooking = require('./models/BulkBooking');
const Transaction = require('./models/Transaction');

mongoose.connect('mongodb://127.0.0.1:27017/Carbooking', { useNewUrlParser: true, useUnifiedTopology: true })
    .then(async () => {
        console.log("Connected to DB.");
        const booking = await BulkBooking.findOne({ status: 'Completed' }).sort({ createdAt: -1 }).populate('assignedFleet assignedAdmin');
        
        if (!booking) {
            console.log("No completed Bulk Bookings found.");
            process.exit(0);
        }

        console.log("===== BULK BOOKING DATA =====");
        console.log("ID:", booking._id.toString());
        console.log("Offered Price:", booking.offeredPrice);
        console.log("Total Price with Tax:", booking.totalPriceWithTax);
        console.log("Advance Paid:", booking.advancePayment.amount);
        console.log("Final Payment Paid:", booking.finalPayment.amount);
        
        console.log("\n===== ASSIGNED DRIVERS / FLEET CARS =====");
        booking.assignedDrivers.forEach((driver, idx) => {
            console.log(`Car ${idx + 1}:`);
            console.log(`  Driver ID: ${driver.driver}`);
            console.log(`  Payout Amount: ${driver.payoutAmount}`);
            console.log(`  Gross Share: ${driver.grossShare}`);
            console.log(`  Commission: ${driver.commission}`);
        });

        console.log("\n===== TRANSACTIONS =====");
        const txs = await Transaction.find({ relatedBooking: booking._id });
        if (txs.length === 0) {
            console.log("No transactions found for this booking.");
        } else {
            txs.forEach(tx => {
                console.log(`- ${tx.transactionType} | Amount: ${tx.amount} | To: ${tx.receiverType} (${tx.receiverId}) | Status: ${tx.status} | Category: ${tx.category}`);
            });
        }
        
        process.exit(0);
    })
    .catch(err => {
        console.error("DB Error:", err);
        process.exit(1);
    });
