const mongoose = require('mongoose');
const AgentLead = require('./models/AgentLead');
const dotenv = require('dotenv');

dotenv.config();

async function checkLeads() {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/CabBooking");
        const leads = await AgentLead.find().sort({ createdAt: -1 }).limit(5);
        console.log(JSON.stringify(leads, null, 2));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

checkLeads();
