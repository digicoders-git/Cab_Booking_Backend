require('dotenv').config();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Agent = require('./models/Agent');
const Driver = require('./models/Driver');
const Admin = require('./models/Admin');
const Vendor = require('./models/Vendor');

async function runTest() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/cab_booking');

        console.log("🛠️  Setting up test data...");
        // 1. Get or Create SuperAdmin
        let admin = await Admin.findOne({ role: 'SuperAdmin' });
        if (!admin) admin = await Admin.create({ name: 'Admin', email: 'admin@test.com', password: '123', role: 'SuperAdmin' });
        admin.walletBalance = 5000;
        admin.agentLeadAdminProfitPct = 10;
        await admin.save();

        // 2. Setup Vendor, Agent, Driver
        await Vendor.deleteMany({ email: 'v_api@test.com' });
        await Agent.deleteMany({ email: 'a_api@test.com' });
        await Driver.deleteMany({ email: 'd_api@test.com' });

        const app = require('./server');
        const http = require('http');
        const server = http.createServer(app);
        await new Promise(resolve => server.listen(0, resolve));
        const port = server.address().port;
        console.log(`Server started on port ${port}`);

        const vendor = await Vendor.create({ name: 'Vendor', email: 'v_api@test.com', phone: '9001', password: '123', commissionPercentage: 20, assignedArea: 'Mumbai', companyName: 'Vendor Co' });
        const agent = await Agent.create({ name: 'Agent', email: 'a_api@test.com', phone: '8001', password: '123', createdByVendor: vendor._id, isApproved: true });
        const driver = await Driver.create({ name: 'Driver', email: 'd_api@test.com', phone: '7001', password: '123', walletBalance: 2000, isApproved: true });

        // Generate JWT Tokens
        const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
        const agentToken = jwt.sign({ id: agent._id, role: 'Agent' }, JWT_SECRET, { expiresIn: '1h' });
        const driverToken = jwt.sign({ id: driver._id, role: 'Driver' }, JWT_SECRET, { expiresIn: '1h' });

        console.log(`Tokens generated. Running HTTP Tests on localhost:${port}...`);
        
        const fetch = (await import('node-fetch')).default || global.fetch;

        // --- TEST 1: Create Lead (Agent) ---
        console.log(`\n[1/4] POST /api/agent-leads/create (Agent)`);
        let response = await fetch(`http://localhost:${port}/api/agent-leads/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${agentToken}` },
            body: JSON.stringify({
                customerName: 'Rohit Sharma',
                customerPhone: '9988776655',
                pickupAddress: 'Mumbai Airport',
                pickupLat: 19.09, pickupLng: 72.86,
                dropAddress: 'Pune City',
                dropLat: 18.52, dropLng: 73.85,
                pickupDateTime: new Date().toISOString(),
                totalPrice: 4000,
                agentCommission: 400
            })
        });
        let result = await response.json();
        console.log("Create Lead Response:", result.success ? "✅ Success" : "❌ Failed", result.message);
        if (!result.success) throw new Error(JSON.stringify(result));
        
        const leadId = result.lead._id;

        // --- TEST 2: Fetch Marketplace Leads (Driver) ---
        console.log("\n[2/4] GET /api/agent-leads/marketplace (Driver)");
        response = await fetch(`http://localhost:${port}/api/agent-leads/marketplace`, {
            headers: { 'Authorization': `Bearer ${driverToken}` }
        });
        result = await response.json();
        const foundLead = result.leads.find(l => l._id === leadId);
        console.log("Marketplace Leads Fetched:", result.success ? "✅ Success" : "❌ Failed");
        console.log("Is Customer Hidden?:", !foundLead.customerName && !foundLead.customerPhone ? "✅ YES (Secure)" : "❌ NO (Leaked)");

        // --- TEST 3: Accept Lead & Pay (Driver) ---
        console.log("\n[3/4] POST /api/agent-leads/:leadId/accept (Driver)");
        response = await fetch(`http://localhost:${port}/api/agent-leads/${leadId}/accept`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${driverToken}` }
        });
        result = await response.json();
        console.log("Accept Response:", result.success ? "✅ Success" : "❌ Failed", result.message);
        console.log("Customer Revealed?:", result.lead.customerName ? `✅ YES: ${result.lead.customerName} - ${result.lead.customerPhone}` : "❌ NO");

        // --- TEST 4: Complete Lead & Settle (Driver) ---
        console.log("\n[4/4] POST /api/agent-leads/:leadId/complete (Driver)");
        response = await fetch(`http://localhost:${port}/api/agent-leads/${leadId}/complete`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${driverToken}` }
        });
        result = await response.json();
        console.log("Complete Response:", result.success ? "✅ Success" : "❌ Failed", result.message);

        // Check DB for final balances
        const aFinal = await Admin.findById(admin._id);
        const vFinal = await Vendor.findById(vendor._id);
        const agFinal = await Agent.findById(agent._id);
        
        console.log(`\n--- FINAL SETTLEMENT BALANCES ---`);
        // Expected Logic: Commission 400. Admin Profit 10% = 40. Vendor cut 20% of 40 = 8.
        // Agent Wallet = 360. Vendor Wallet = 8. Admin Wallet gains +32 net.
        console.log(`Agent Wallet Earned: ₹${agFinal.walletBalance} (Expected 360)`);
        console.log(`Vendor Master Commission Earned: ₹${vFinal.walletBalance} (Expected 8)`);
        console.log(`Admin Wallet Final Balance: ₹${aFinal.walletBalance} (Expected 5032)`);

        server.close();
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
runTest();
