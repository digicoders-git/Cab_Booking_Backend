const mongoose = require("mongoose");
const dns = require("dns");

// Fix for querySrv ECONNREFUSED with MongoDB Atlas on Windows/local ISPs
try {
    dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
} catch (e) {
    // Fallback if environment restricts setServers
}

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB Connected");
    } catch (error) {
        console.error("Database Connection Failed:", error.message);
        process.exit(1);
    }
};

module.exports = connectDB;
