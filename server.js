const express = require("express");
const cors = require("cors");
const http = require("http");
const connectDB = require("./config/db");
const { initSocket } = require("./socket/socket");
require("dotenv").config();
require("./config/firebaseAdmin"); // Initialize Firebase Admin SDK
const adminRoutes = require("./routes/adminRoutes");
const userRoutes = require("./routes/userRoutes");
const agentRoutes = require("./routes/agentRoutes");
const driverRoutes = require("./routes/driverRoutes");
const fleetRoutes = require("./routes/fleetRoutes");
const fleetDriverRoutes = require("./routes/fleetDriverRoutes");
const fleetCarRoutes = require("./routes/fleetCarRoutes");
const fleetAssignmentRoutes = require("./routes/fleetAssignmentRoutes");
const carCategoryRoutes = require("./routes/carCategoryRoutes");
const bookingRoutes = require("./routes/bookingRoutes"); // NEW: Booking Engine
const tripRoutes = require("./routes/tripRoutes"); // NEW: Trip Assignment & Execution
const notificationRoutes = require("./routes/notificationRoutes"); // NEW: Notification System
const walletRoutes = require("./routes/walletRoutes"); // NEW: Earning & Payout System
const supportRoutes = require("./routes/supportRoutes"); // NEW: Support System for all panels
const vendorRoutes = require("./routes/vendorRoutes"); // NEW: Vendor Panel
const areaPricingRoutes = require("./routes/areaPricingRoutes"); // NEW: Area Wise Pricing
const serviceAreaRoutes = require("./routes/serviceAreaRoutes"); // NEW: Service Availability Check
const bulkBookingRoutes = require("./routes/bulkBookingRoutes"); // NEW: Bulk Booking Marketplace

const app = express();
const server = http.createServer(app);

// Initialize Socket.io with the http server
initSocket(server);

app.use(cors());
app.use(express.json());

app.use("/uploads", express.static("uploads"));

connectDB();

app.get("/", (req, res) => {
    res.send("Cab Booking API Running");
});

app.use("/api/admin", adminRoutes);
app.use("/api/users", userRoutes);
app.use("/api/agents", agentRoutes);
app.use("/api/drivers", driverRoutes);
app.use("/api/fleet", fleetRoutes);
app.use("/api/fleet/drivers", fleetDriverRoutes);
app.use("/api/fleet/cars", fleetCarRoutes);
app.use("/api/fleet/assignment", fleetAssignmentRoutes);
app.use("/api/car-categories", carCategoryRoutes);
app.use("/api/bookings", bookingRoutes); // NEW
app.use("/api/trips", tripRoutes); // NEW: Auto-Match & Driver Trip Actions
app.use("/api/notifications", notificationRoutes); // NEW: App Notifications
app.use("/api/wallet", walletRoutes); // NEW: Earning & Payout Management
app.use("/api/support", supportRoutes); // NEW: Support System
app.use("/api/vendors", vendorRoutes);  // NEW: Vendor Panel
app.use("/api/area-pricing", areaPricingRoutes); // NEW: Area Wise Pricing
app.use("/api/service-areas", serviceAreaRoutes); // NEW: Service Availability Check
app.use("/api/bulk-bookings", bulkBookingRoutes); // NEW: Bulk Booking Marketplace


const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});