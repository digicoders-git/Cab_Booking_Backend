const connectDB = require("./config/db");
const mongoose = require("mongoose");
const Admin = require("./models/Admin");
const User = require("./models/User");
const Driver = require("./models/Driver");
const jwt = require("jsonwebtoken");
const http = require("http");
require("dotenv").config();

// Helper to make an HTTP request
function makeRequest(path, method, token, data = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 5000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        };

        if (data) {
            const body = JSON.stringify(data);
            options.headers['Content-Length'] = Buffer.byteLength(body);
        }

        const req = http.request(options, (res) => {
            let resData = '';
            res.on('data', chunk => resData += chunk);
            res.on('end', () => resolve(JSON.parse(resData)));
        });

        req.on('error', reject);
        
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

async function runTest() {
    try {
        await connectDB();
        console.log("Database Connected!\n");

        // 1. Setup Admin, User, and Driver
        const admin = await Admin.findOne({ email: "testadmin@gmail.com" });
        const adminToken = jwt.sign({ id: admin._id, role: "admin" }, process.env.JWT_SECRET, { expiresIn: "10m" });

        const user = await User.findOneAndUpdate(
            { email: "testuser22@gmail.com" },
            { name: "Test User", email: "testuser22@gmail.com", phone: "8888888888", password: "pwd" },
            { upsert: true, new: true }
        );
        const userToken = jwt.sign({ id: user._id, role: "user" }, process.env.JWT_SECRET, { expiresIn: "10m" });

        const driver = await Driver.findOne({ email: "rajesh_driver@test.com" }); // From previous test
        const driverToken = jwt.sign({ id: driver._id, role: "driver" }, process.env.JWT_SECRET, { expiresIn: "10m" });

        console.log("--- 🎙️ ADMIN BROADCASING MESSAGES ---");
        
        // 2. Admin creates "ALL" message
        const allMsgData = {
            title: "Holi Dhamaka 🎨",
            message: "Happy Holi everyone! Grab your 10% discount today.",
            targetRoles: ["all"]
        };
        const resAll = await makeRequest("/api/notifications/create", "POST", adminToken, allMsgData);
        console.log("Admin Sent to 'ALL': ", resAll.message);

        // 3. Admin creates "DRIVER ONLY" message
        const driverMsgData = {
            title: "Surge Alert 🚗",
            message: "Drivers, high demand in Connaught Place! Connect now.",
            targetRoles: ["driver"]
        };
        const resDriver = await makeRequest("/api/notifications/create", "POST", adminToken, driverMsgData);
        console.log("Admin Sent to 'DRIVER ONLY': ", resDriver.message);

        console.log("\n--- 📱 CHECKING USER APP ---");
        // 4. User checks their app
        const userNotifs = await makeRequest("/api/notifications/my-notifications", "GET", userToken);
        console.log(`User sees ${userNotifs.count} notifications:`);
        userNotifs.notifications.forEach(n => console.log(` - [${n.title}] Target: ${n.targetRoles} => ${n.message}`));

        console.log("\n--- 🚕 CHECKING DRIVER APP ---");
        // 5. Driver checks their app
        const driverNotifs = await makeRequest("/api/notifications/my-notifications", "GET", driverToken);
        console.log(`Driver sees ${driverNotifs.count} notifications:`);
        driverNotifs.notifications.forEach(n => console.log(` - [${n.title}] Target: ${n.targetRoles} => ${n.message}`));

        console.log("\n✅ FLOW TESTED SUCCESSFULLY!");
        mongoose.connection.close();
        process.exit(0);

    } catch (error) {
        console.error("Test Failed: ", error);
        process.exit(1);
    }
}

// Small delay to ensure server.js is running if we started it recently
setTimeout(runTest, 1000);
