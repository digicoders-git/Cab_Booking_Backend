const mongoose = require("mongoose");
const dotEnv = require("dotenv");
dotEnv.config();

const Admin = require("./models/Admin");

const test = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/capbokkin");
        console.log("Connected to MongoDB");

        const admin = await Admin.findOne();
        if (admin) {
            console.log("Admin Found:", admin.email);
            console.log("Password (Plane Text as per code):", admin.password);
        } else {
            console.log("No Admin found. Creating a test admin...");
            const newAdmin = await Admin.create({
                name: "Test Admin",
                email: "admin@test.com",
                password: "password123"
            });
            console.log("Test Admin Created: admin@test.com / password123");
        }
        process.exit(0);
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

test();
