const mongoose = require("mongoose");
const bookingController = require("./controllers/bookingController");
const tripController = require("./controllers/tripController");
const User = require("./models/User");
const Driver = require("./models/Driver");
const Admin = require("./models/Admin");
const Booking = require("./models/Booking");
const CarCategory = require("./models/CarCategory");

async function runTest() {
    try {
        await mongoose.connect("mongodb://127.0.0.1:27017/Carbooking");
        console.log("Connected to DB...");

        // 1. Setup Data
        let admin = await Admin.findOne();
        if (!admin) admin = await Admin.create({ email: "admin@test.com", password: "123", name: "Admin" });
        
        let category = await CarCategory.findOne({ name: "Mini_Test_Fresh" });
        if (!category) category = await CarCategory.create({ name: "Mini_Test_Fresh", baseFare: 50, privateRatePerKm: 10, seatCapacity: 4 });

        let user = await User.findOne({ phone: "9999999999" });
        if (!user) user = await User.create({ name: "Test User", phone: "9999999999", walletBalance: 0 });
        else { user.walletBalance = 0; await user.save(); }

        let driver = await Driver.findOne({ phone: "8888888888" });
        if (!driver) driver = await Driver.create({ 
            name: "Test Driver", phone: "8888888888", email: "driver@test.com", password: "123", walletBalance: 0, totalEarnings: 0, 
            isAvailable: true, isOnline: true, isApproved: true,
            carDetails: { carType: category._id }
        });
        else { driver.walletBalance = 0; driver.totalEarnings = 0; await driver.save(); }

        const startAdminWallet = admin.walletBalance || 0;

        const ServiceArea = require("./models/ServiceArea");
        const area = await ServiceArea.findOne({ isActive: true });
        let testLat = 28.7041;
        let testLng = 77.1025; // Default Delhi
        if (area && area.centerCoordinates) {
            testLat = area.centerCoordinates.latitude;
            testLng = area.centerCoordinates.longitude;
            area.disabledCategories = [];
            await area.save();
        }

        console.log("\n--- INITIAL STATE ---");
        console.log(`User Wallet: ${user.walletBalance}`);
        console.log(`Driver Wallet: ${driver.walletBalance} | Earnings: ${driver.totalEarnings}`);
        console.log(`Admin Wallet: ${startAdminWallet}`);

        // Mock req/res
        const createMockRes = () => {
            return {
                statusCode: 200,
                data: null,
                status: function(s) { this.statusCode = s; return this; },
                json: function(d) { this.data = d; return this; }
            };
        };

        // --- SCENARIO 1: CANCEL BEFORE ARRIVAL ---
        console.log("\n>>> SCENARIO 1: Cancel BEFORE Arrival <<<");
        let req1 = {
            user: { id: user._id, role: "user" },
            body: {
                passengerName: "Test User",
                passengerPhone: "9999999999",
                pickupAddress: "A",
                pickupLat: testLat,
                pickupLng: testLng,
                dropAddress: "B",
                dropLat: testLat + 0.01,
                dropLng: testLng + 0.01,
                carCategoryId: category._id,
                rideType: "Private",
                distanceKm: 5
            }
        };
        let res1 = createMockRes();
        await bookingController.createBooking(req1, res1);
        if (!res1.data || !res1.data.bookingId) {
            console.error("Failed to create booking:", res1.data);
            process.exit(1);
        }
        let bookingId1 = res1.data.bookingId;

        // Accept
        await Booking.findByIdAndUpdate(bookingId1, { assignedDriver: driver._id, bookingStatus: "Accepted" });
        
        // Cancel
        let cancelReq1 = { user: { id: user._id, role: "user" }, params: { bookingId: bookingId1 }, body: { reason: "Changed mind" } };
        let cancelRes1 = createMockRes();
        await bookingController.cancelBooking(cancelReq1, cancelRes1);

        user = await User.findById(user._id);
        driver = await Driver.findById(driver._id);
        console.log(`User Wallet: ${user.walletBalance} (Expected 0)`);
        console.log(`Driver Wallet: ${driver.walletBalance} (Expected 0)`);

        // --- SCENARIO 2: CANCEL AFTER ARRIVAL ---
        console.log("\n>>> SCENARIO 2: Cancel AFTER Arrival <<<");
        let req2 = { ...req1 };
        let res2 = createMockRes();
        await bookingController.createBooking(req2, res2);
        let bookingId2 = res2.data.bookingId;

        // Accept & Arrive
        await Booking.findByIdAndUpdate(bookingId2, { 
            assignedDriver: driver._id, 
            bookingStatus: "Accepted",
            tripData: { arrivedAt: new Date() }
        });

        // Cancel
        let cancelReq2 = { user: { id: user._id, role: "user" }, params: { bookingId: bookingId2 }, body: { reason: "Late" } };
        let cancelRes2 = createMockRes();
        await bookingController.cancelBooking(cancelReq2, cancelRes2);

        user = await User.findById(user._id);
        driver = await Driver.findById(driver._id);
        admin = await Admin.findById(admin._id);
        console.log(`User Wallet: ${user.walletBalance} (Expected -50)`);
        console.log(`Driver Wallet: ${driver.walletBalance} | Earnings: ${driver.totalEarnings} (Expected 50)`);
        console.log(`Admin Wallet: ${admin.walletBalance} (Expected ${startAdminWallet - 50})`);

        // --- SCENARIO 3: NEXT BOOKING WITH DUES ---
        console.log("\n>>> SCENARIO 3: Next Booking (Checking Bill) <<<");
        let req3 = { ...req1 };
        let res3 = createMockRes();
        await bookingController.createBooking(req3, res3);
        let bookingId3 = res3.data.bookingId;
        
        let createdBooking3 = await Booking.findById(bookingId3);
        console.log(`New Booking Base Fare: ${createdBooking3.fareEstimate - createdBooking3.previousDues}`);
        console.log(`Previous Dues Added: ${createdBooking3.previousDues}`);
        console.log(`Total Bill (fareEstimate): ${createdBooking3.fareEstimate}`);

        // Accept & Complete the 3rd Trip
        await Booking.findByIdAndUpdate(bookingId3, { 
            assignedDriver: driver._id, 
            bookingStatus: "Ongoing",
            tripData: { arrivedAt: new Date() }
        });

        // Driver initiates trip completion
        let completionReq = { user: { id: driver._id }, params: { bookingId: bookingId3 }, body: { actualDistanceKm: 10 } };
        let completionRes = createMockRes();
        await tripController.initiateTripCompletion(completionReq, completionRes);

        // Driver Collects Cash and Ends Trip
        let endReq = { user: { id: driver._id }, params: { bookingId: bookingId3 }, body: { paymentMethod: "Cash" } };
        let endRes = createMockRes();
        await tripController.endTrip(endReq, endRes);

        user = await User.findById(user._id);
        driver = await Driver.findById(driver._id);
        admin = await Admin.findById(admin._id);
        
        console.log("\n>>> FINAL WALLET BALANCES AFTER 3RD RIDE (CASH PAYMENT) <<<");
        console.log(`User Wallet: ${user.walletBalance} (Expected 0 since debt was paid in cash)`);
        console.log(`Driver Wallet: ${driver.walletBalance} | Earnings: ${driver.totalEarnings}`);
        console.log(`Admin Wallet: ${admin.walletBalance} (Expected ${startAdminWallet} + adminCut)`);

        console.log("\nTest Completed successfully.");
        process.exit(0);

    } catch (e) {
        console.error("Test Error:", e);
        process.exit(1);
    }
}

runTest();
