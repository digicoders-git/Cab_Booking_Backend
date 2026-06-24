const mongoose = require('mongoose');
const AgentLead = require('./models/AgentLead');
const Transaction = require('./models/Transaction');
const Admin = require('./models/Admin');
const dotenv = require('dotenv');

dotenv.config();

async function fixCorruptedLeads() {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/CabBooking");
        console.log("Connected to DB");

        const corruptedLeads = await AgentLead.find({ status: 'Accepted', assignedDriver: { $in: [null, undefined] } });
        console.log(`Found ${corruptedLeads.length} corrupted leads.`);

        for (let lead of corruptedLeads) {
            console.log(`Fixing Lead ID: ${lead._id}`);

            // Refund admin wallet
            const admin = await Admin.findOne({ role: 'SuperAdmin' });
            if (admin) {
                admin.walletBalance -= lead.agentCommission;
                await admin.save();
                console.log(`Deducted ${lead.agentCommission} from Admin Wallet`);
            }

            // Remove related admin transaction
            await Transaction.deleteMany({ relatedBooking: lead._id });
            console.log("Deleted corrupted transactions");

            // Reset Lead to Marketplace
            lead.status = 'Marketplace';
            lead.paymentStatus = 'Pending';
            lead.assignedDriver = null;
            lead.acceptedAt = null;
            lead.hdfcTransactionId = null;
            await lead.save();
            console.log("Lead reset to Marketplace");
        }

        console.log("Done fixing leads");
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

fixCorruptedLeads();
