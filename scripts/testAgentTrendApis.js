const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const Agent = require("../models/Agent");

async function runTest() {
    try {
        console.log("Connecting to Database...");
        await mongoose.connect(process.env.MONGO_URI);
        
        // Find any agent
        const agent = await Agent.findOne({ isActive: true });
        if (!agent) {
            console.log("No active agent found to test.");
            process.exit(1);
        }
        console.log(`Testing with Agent: ${agent.email}`);

        // Generate Token
        const token = jwt.sign(
            { id: agent._id, role: "agent" },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

        const headers = { Authorization: `Bearer ${token}` };
        const baseURL = "http://localhost:5000/api/agents";

        console.log("\n--- Testing GET /dashboard ---");
        try {
            const res = await fetch(`${baseURL}/dashboard`, { headers });
            const data = await res.json();
            if (!res.ok) throw new Error(JSON.stringify(data));
            console.log("Success! Dashboard Keys:", Object.keys(data.dashboard));
            if (data.dashboard.weeklyTrend) console.log("Weekly Trend Found!", data.dashboard.weeklyTrend);
            if (data.dashboard.peakHours) console.log("Peak Hours Found!", data.dashboard.peakHours);
            if (data.dashboard.monthlyTrend) console.log("Monthly Trend Found!", data.dashboard.monthlyTrend.length, "months");
        } catch (err) {
            console.error("Dashboard API Failed:", err.message);
        }

        console.log("\n--- Testing GET /report ---");
        try {
            const res = await fetch(`${baseURL}/report`, { headers });
            const data = await res.json();
            if (!res.ok) throw new Error(JSON.stringify(data));
            console.log("Success! Report Keys:", Object.keys(data.report));
            if (data.report.weeklyTrend) console.log("Weekly Trend Found!");
            if (data.report.peakHours) console.log("Peak Hours Found!", data.report.peakHours);
            if (data.report.monthlyTrend) console.log("Monthly Trend Found!");
        } catch (err) {
            console.error("Report API Failed:", err.message);
        }

        console.log("\n--- TEST COMPLETED ---");
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

runTest();
