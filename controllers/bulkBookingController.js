process.on('uncaughtException', (err) => {
    require('fs').writeFileSync('crash_debug.log', err.stack || err.message);
});
process.on('unhandledRejection', (reason, promise) => {
    require('fs').writeFileSync('crash_debug.log', (reason && reason.stack) || String(reason));
});

const BulkBooking = require("../models/BulkBooking");
const CarCategory = require("../models/CarCategory");
const FleetCar = require("../models/FleetCar");
const FleetDriver = require("../models/FleetDriver");
const Fleet = require("../models/Fleet");
const { getIO } = require("../socket/socket");
const AreaPricing = require("../models/AreaPricing");
const serviceAreaController = require("./serviceAreaController");
const { sendPushNotification } = require("../utils/fcmNotification");
const Transaction = require("../models/Transaction");
const Admin = require("../models/Admin");
const Agent = require("../models/Agent");
const User = require("../models/User");
const { generateBulkBookingReceipt, generateDriverBulkPayoutReceipt } = require("../utils/pdfGenerator");

const Driver = require("../models/Driver");
const Vendor = require("../models/Vendor");
const { getAreaSpecificRates } = require("./bookingController");
// const { PaymentHandler, validateHMAC_SHA256 } = require("../utils/PaymentHandler");
// const paymentHandler = PaymentHandler.getInstance();
const { RazorpayHandler } = require("../utils/RazorpayHandler");
const razorpayHandler = RazorpayHandler.getInstance();


// 1. Create Bulk Booking Request
exports.createBulkBooking = async (req, res) => {
    try {
        let {
            pickup, drop, pickupDateTime, tripType, returnDateTime,
            numberOfDays, totalDistance, carsRequired, offeredPrice, notes,
            isOutstation, customerName, customerPhone
        } = req.body;

        // Validation
        if (!pickup || !drop || !pickupDateTime || !carsRequired || !offeredPrice) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        // --- NEW: Service Availability Enforcement (GPS VERSION) ---
        const isServiceable = await serviceAreaController.checkServiceAvailability(pickup.latitude, pickup.longitude);

        if (!isServiceable) {
            return res.status(400).json({
                success: false,
                message: "Bulk bookings are not available at this location yet. Please check back later."
            });
        }

        // --- NEW: State Tax / MCD Toll Lookup (Replaces old AreaPricing logic) ---
        let mcdStateTaxApplied = 0;
        let taxBreakdown = [];
        try {
            const stateTaxController = require("./stateTaxController");
            let totalTaxForBooking = 0;

            // Bulk booking can have multiple car categories
            for (const item of carsRequired) {
                const result = await stateTaxController.calculateTaxesInternal({
                    pickupAddress: pickup.address,
                    dropAddress: drop.address,
                    carCategoryId: item.category,
                    tripType: tripType,
                    pickupDate: pickupDateTime,
                    returnDate: returnDateTime
                });
                
                // Multiply the tax by the quantity of cars for this category
                totalTaxForBooking += (result.totalTax * (item.quantity || 1));
                if (result.taxBreakdown && result.taxBreakdown.length > 0) {
                    taxBreakdown.push({
                        carCategory: item.category,
                        quantity: item.quantity || 1,
                        taxes: result.taxBreakdown
                    });
                }
            }

            if (totalTaxForBooking > 0) {
                offeredPrice = Number(offeredPrice) + totalTaxForBooking;
                mcdStateTaxApplied = totalTaxForBooking;
                isOutstation = true; // Automatically mark as outstation if there's state tax
            }
        } catch (err) {
            console.error("State Tax Lookup Error for Bulk Booking:", err.message);
        }


        // --- NEW: Area Pricing for Bulk Bookings ---
        const areaRates = await getAreaSpecificRates(pickup.latitude, pickup.longitude, 1, 1, 1);
        const bulkMultiplier = areaRates.bulkRateMultiplier || 1;
        let appliedAreaPricing = null;
        if (areaRates.isSpecial) {
            appliedAreaPricing = {
                areaName: areaRates.areaName,
                appliedMultiplier: bulkMultiplier
            };
        }

        // Calculate System Estimated Price
        // Formula: Rate (per KM) * Quantity * Days * Distance * bulkMultiplier
        // If Round Trip, we double the distance
        let systemEstimatedPrice = 0;
        const distanceMultiplier = tripType === 'RoundTrip' ? 2 : 1;

        for (const item of carsRequired) {
            const category = await CarCategory.findById(item.category);
            if (category) {
                // Prevent booking if category is disabled in this zone
                if (isServiceable.disabledCategories && isServiceable.disabledCategories.some(id => id.toString() === category._id.toString())) {
                    return res.status(400).json({ success: false, message: `The vehicle category ${category.name} is not available in your area.` });
                }
                const rate = category.bulkBookingBasePrice || 0;
                const quantity = item.quantity || 1;
                const days = numberOfDays || 1;
                const actualKm = totalDistance * distanceMultiplier;
                
                if (tripType === 'RoundTrip') {
                    const minKmPerDay = category.minKmPerDay || 250;
                    const driverAllowancePerDay = category.driverAllowancePerDay || 300;
                    
                    const minimumKmRequired = minKmPerDay * days;
                    const chargeableKm = Math.max(actualKm, minimumKmRequired);
                    const totalDriverAllowance = driverAllowancePerDay * days;
                    
                    systemEstimatedPrice += ((chargeableKm * rate) + totalDriverAllowance) * quantity * bulkMultiplier;
                } else {
                    // One-Way Logic
                    systemEstimatedPrice += rate * quantity * actualKm * bulkMultiplier;
                }
            }
        }

        const priceModifiedPercentage = systemEstimatedPrice > 0
            ? ((offeredPrice - systemEstimatedPrice) / systemEstimatedPrice) * 100
            : 0;

        // --- NEW: Fetch dynamic percentages from Admin & Handle Wallet Bypass ---
        const adminSettings = await Admin.findOne({ role: 'SuperAdmin' });
        
        let advancePct = 25;
        let payViaBank = true;
        let maxNegativeWalletLimit = adminSettings?.maxNegativeWalletLimit ?? 3000;
        
        const userRole = req.user.role;
        const creatorModel = userRole === 'admin' ? 'Admin' :
                             userRole === 'agent' ? 'Agent' :
                             userRole === 'vendor' ? 'Vendor' :
                             userRole === 'fleet' ? 'Fleet' : 'User';

        if (adminSettings) {
            if (userRole === 'user') {
                advancePct = adminSettings.userBulkAdvancePct ?? 25;
                payViaBank = adminSettings.userPayViaBank ?? true;
            } else if (userRole === 'agent') {
                advancePct = adminSettings.agentBulkAdvancePct ?? 5;
                payViaBank = adminSettings.agentPayViaBank ?? false;
            } else if (userRole === 'vendor') {
                advancePct = adminSettings.vendorBulkAdvancePct ?? 15;
                payViaBank = adminSettings.vendorPayViaBank ?? true;
            } else if (userRole === 'admin') {
                advancePct = adminSettings.adminBulkAdvancePct ?? 0;
                payViaBank = adminSettings.adminPayViaBank ?? false;
            }
        }

        // --- NEW: First Ride Welcome Discount (Automatic for 1st Time Users) ---
        let firstRideDiscount = 0;
        let finalOfferedPrice = offeredPrice;
        if (creatorModel === 'User') {
            const firstRideHelper = require('../utils/firstRideHelper');
            firstRideDiscount = await firstRideHelper.checkAndCalculateFirstRideDiscount(req.user.id, finalOfferedPrice);
            if (firstRideDiscount > 0) {
                finalOfferedPrice = Math.max(0, finalOfferedPrice - firstRideDiscount);
            }
        }

        const advanceAmount = Math.round(finalOfferedPrice * (advancePct / 100));
        
        // Calculate GST
        const cgst = Math.round(finalOfferedPrice * 0.025);
        const sgst = Math.round(finalOfferedPrice * 0.025);
        const totalPriceWithTax = finalOfferedPrice + cgst + sgst;

        // Create Booking DB Record (Initially PendingPayment)
        const newBooking = await BulkBooking.create({
            createdBy: req.user.id,
            createdByModel: creatorModel,
            pickup, drop, pickupDateTime,
            tripType: tripType || 'OneWay',
            returnDateTime: tripType === 'RoundTrip' ? returnDateTime : null,
            numberOfDays: numberOfDays || 1,
            totalDistance: totalDistance || 0,
            carsRequired, systemEstimatedPrice, offeredPrice: finalOfferedPrice, priceModifiedPercentage, notes,
            firstRideDiscount,
            cgst, sgst, totalPriceWithTax,
            status: 'PendingPayment',
            advancePayment: { amount: advanceAmount, isPaid: false },
            isOutstation: isOutstation || false,
            mcdStateTaxApplied,
            taxBreakdown,
            appliedAreaPricing,
            customerName: customerName || null,
            customerPhone: customerPhone || null,
            startOtp: Math.floor(1000 + Math.random() * 9000).toString()
        });

        if (firstRideDiscount > 0 && creatorModel === 'User') {
            await require('../models/User').findByIdAndUpdate(req.user.id, { hasUsedFirstRideDiscount: true });
        }

        // --- BYPASS LOGIC: Wallet Deduction instead of Bank Gateway ---
        if (!payViaBank || advanceAmount <= 0) {
            // Check Wallet Balance & Limit
            let userRecord;
            if (creatorModel === 'User') userRecord = await require('../models/User').findById(req.user.id);
            else if (creatorModel === 'Agent') userRecord = await require('../models/Agent').findById(req.user.id);
            else if (creatorModel === 'Vendor') userRecord = await require('../models/Vendor').findById(req.user.id);
            else if (creatorModel === 'Admin') userRecord = await require('../models/Admin').findById(req.user.id);
            else if (creatorModel === 'Fleet') userRecord = await require('../models/Fleet').findById(req.user.id);

            if (userRecord) {
                const currentBalance = userRecord.walletBalance || 0;
                
                // If this deduction pushes them below the max negative limit
                if (currentBalance - advanceAmount < -maxNegativeWalletLimit) {
                    await BulkBooking.findByIdAndDelete(newBooking._id); // Revert booking creation
                    return res.status(400).json({ 
                        success: false, 
                        message: `Limit Reached! You cannot make this booking as it exceeds your wallet credit limit of -${maxNegativeWalletLimit}. Please clear your dues first.` 
                    });
                }

                // Proceed with Wallet Deduction
                userRecord.walletBalance = currentBalance - advanceAmount;
                await userRecord.save();

                // Credit Admin Wallet
                if (adminSettings) {
                    adminSettings.walletBalance = (adminSettings.walletBalance || 0) + advanceAmount;
                    adminSettings.totalEarnings = (adminSettings.totalEarnings || 0) + advanceAmount;
                    await adminSettings.save();

                    // Transaction: Admin Credit
                    await Transaction.create({
                        user: adminSettings._id, userModel: 'Admin', amount: advanceAmount,
                        type: 'Credit', category: 'Bulk Advance', status: 'Completed',
                        relatedBooking: newBooking._id, description: `Advance received (Wallet bypass) for Bulk Booking #${newBooking._id.toString().slice(-6)}`
                    });
                }

                // Transaction: User/Agent Debit
                await Transaction.create({
                    user: userRecord._id, userModel: creatorModel, amount: advanceAmount,
                    type: 'Debit', category: 'Bulk Advance', status: 'Completed',
                    relatedBooking: newBooking._id, description: `Advance paid from Wallet for Bulk Booking #${newBooking._id.toString().slice(-6)}`
                });

                // Update Booking Status to Marketplace
                newBooking.advancePayment.isPaid = true;
                newBooking.advancePayment.hdfcTransactionId = "WALLET_BYPASS";
                newBooking.status = 'Marketplace';
                await newBooking.save();

                // Notify Fleets (Socket + FCM)
                try {
                    const io = getIO();
                    const fleets = await require('../models/Fleet').find({ isActive: true });
                    let eligibleFleetIds = [];

                    for (const fleet of fleets) {
                        let isEveryRequirementMet = true;
                        for (const reqItem of newBooking.carsRequired) {
                            const availableCount = await require('../models/FleetCar').countDocuments({
                                fleetId: fleet._id, carType: reqItem.category, isApproved: true, isActive: true
                            });
                            if (availableCount < (reqItem.quantity || 1)) {
                                isEveryRequirementMet = false; break;
                            }
                        }
                        if (isEveryRequirementMet) eligibleFleetIds.push(fleet._id);
                    }

                    if (eligibleFleetIds.length > 0) {
                        eligibleFleetIds.forEach(fleetId => {
                            io.to(`fleet_${fleetId.toString()}`).emit("new_bulk_deal", {
                                bookingId: newBooking._id, pickup: newBooking.pickup.address, drop: newBooking.drop.address,
                                dateTime: newBooking.pickupDateTime, tripType: newBooking.tripType,
                                offeredPrice: newBooking.offeredPrice, cars: newBooking.carsRequired.length
                            });
                        });
                        
                        // Emit to Admin Panel as well
                        io.to('admin_room').emit("new_bulk_deal", {
                            bookingId: newBooking._id, pickup: newBooking.pickup.address, drop: newBooking.drop.address,
                            dateTime: newBooking.pickupDateTime, tripType: newBooking.tripType,
                            offeredPrice: newBooking.offeredPrice, cars: newBooking.carsRequired.length
                        });

                        for (const fleetId of eligibleFleetIds) {
                            const fleet = await require('../models/Fleet').findById(fleetId);
                            if (fleet?.fcmToken) {
                                await sendPushNotification(fleet.fcmToken, {
                                    title: `📦 New Bulk Deal: ₹${newBooking.offeredPrice}`,
                                    body: `New bulk request at ${newBooking.pickup.address.split(',')[0]}. Check marketplace!`,
                                    data: { bookingId: newBooking._id.toString(), type: "NEW_BULK_DEAL" }
                                });
                            }
                        }
                    }
                } catch (err) {
                    console.error("FCM/Socket Error during Bulk Advance Payment Bypass:", err.message);
                }

                let responseData = {
                    success: true,
                    message: "Bulk request created & published directly to Marketplace (Wallet Deduction).",
                    bookingId: newBooking._id,
                    advanceAmount: advanceAmount,
                    firstRideDiscount: firstRideDiscount,
                    walletDeducted: true
                };

                if (isOutstation) {
                    responseData.tollTaxMessage = "Note: Toll Tax is to be collected separately by the driver directly from the rider.";
                }

                return res.status(201).json(responseData);
            }
        }

        // --- NORMAL BANK PAYMENT FLOW ---
        const orderIdString = `bulk_adv_${newBooking._id.toString().slice(-6)}_${Date.now()}`;

        const fallbackUserUrl = process.env.FRONTEND_USER_URL || 'http://localhost:5173';
        const fallbackAgentUrl = process.env.FRONTEND_AGENT_URL || 'http://localhost:5176';

        const frontendOrigin = req.headers.origin || (req.user.role === 'agent' ? fallbackAgentUrl : fallbackUserUrl);
        const finalPath = req.user.role === 'agent' ? '/agent/my-bulk-bookings' : '/bulk-booking';
        const fullRedirectUrl = `${frontendOrigin}${finalPath}`;

        const protocol = req.get('host').includes('localhost') || req.get('host').includes('127.0.0.1') ? req.protocol : 'https';
        const returnUrl = `${protocol}://${req.get('host')}/api/bulk-bookings/payment-return?redirect=${encodeURIComponent(fullRedirectUrl)}`;

        // const sessionResponse = await paymentHandler.orderSession({
        const sessionResponse = await razorpayHandler.orderSession({
            order_id: orderIdString,
            amount: advanceAmount.toFixed(2),
            customer_id: req.user.id.toString(),
            customer_email: "test@example.com",
            customer_phone: "9999999999",
            return_url: returnUrl
        });

        newBooking.advancePayment.hdfcOrderId = orderIdString;
        await newBooking.save();

        let responseData = {
            success: true,
            message: "Bulk request created. Redirecting to payment...",
            bookingId: newBooking._id,
            advanceAmount: advanceAmount,
            firstRideDiscount: firstRideDiscount,
            paymentLinks: sessionResponse.payment_links || sessionResponse
        };

        if (isOutstation) {
            responseData.tollTaxMessage = "Note: Toll Tax is to be collected separately by the driver directly from the rider.";
        }

        res.status(201).json(responseData);

    } catch (error) {
        require('fs').writeFileSync('bulk_err.log', error.stack || error.message);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 2. Get Available Bulk Bookings for Fleets (Marketplace View)
exports.getMarketplace = async (req, res) => {
    try {
        const { id, role } = req.user;

        let query = {
            status: 'Marketplace',
            pickupDateTime: { $gte: new Date() } // Only show future bookings
        };

        // If it's a Fleet Owner, only show deals relevant to their approved cars
        if (role === 'fleet') {
            const approvedCategories = await FleetCar.distinct("carType", {
                fleetId: id,
                isApproved: true,
                isActive: true
            });
            query["carsRequired.category"] = { $in: approvedCategories };
        } else if (role === 'driver') {
            const driver = await Driver.findById(id);
            if (!driver || !driver.carDetails || !driver.carDetails.carType) {
                return res.json({ success: true, count: 0, bookings: [] });
            }
            const driverCategory = driver.carDetails.carType;
            query["carsRequired"] = { $size: 1 };
            query["carsRequired.0.quantity"] = 1;
            query["carsRequired.0.category"] = driverCategory;
        }

        // Admins see everything in Marketplace, Fleets see relevant with enough quantity, Drivers see 1-car bookings matching category
        const allBookings = await BulkBooking.find(query)
            .populate("carsRequired.category", "name image bulkBookingBasePrice")
            .populate("createdBy", "name phone image")
            .sort({ createdAt: -1 });

        if (role === 'fleet') {
            // Filter bookings where this fleet meets the quantity requirement for ALL cars in the request
            const filteredBookings = [];
            for (const booking of allBookings) {
                let canHandle = true;
                for (const reqItem of booking.carsRequired) {
                    const availableCount = await FleetCar.countDocuments({
                        fleetId: id,
                        carType: reqItem.category._id,
                        isApproved: true,
                        isActive: true
                    });
                    if (availableCount < (reqItem.quantity || 1)) {
                        canHandle = false;
                        break;
                    }
                }
                if (canHandle) filteredBookings.push(booking);
            }
            const adminSettings = await Admin.findOne({ role: 'SuperAdmin' });
            const securityPct = adminSettings?.fleetBulkSecurityPct ?? 20;
            return res.json({ success: true, count: filteredBookings.length, bookings: filteredBookings, securityPct });
        }

        if (role === 'driver') {
            // Hide customer details from drivers until accepted
            allBookings.forEach(b => {
                b.customerName = null;
                b.customerPhone = null;
            });
        }

        const adminSettings = await Admin.findOne({ role: 'SuperAdmin' });
        const securityPct = adminSettings?.fleetBulkSecurityPct ?? 20;

        res.json({ success: true, count: allBookings.length, bookings: allBookings, securityPct });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 3. Accept Bulk Booking (Fleet or Driver Action)
exports.acceptBulkBooking = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const userId = req.user.id;
        const role = req.user.role;

        const booking = await BulkBooking.findById(bookingId);
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        if (booking.status !== "Marketplace") {
            return res.status(400).json({ success: false, message: "Sorry, this deal is already taken or unavailable." });
        }

        // --- NEW ADMIN BYPASS LOGIC ---
        if (role === 'admin' || role === 'SuperAdmin') {
            booking.status = 'Accepted';
            booking.assignedAdmin = userId;
            booking.acceptedAt = new Date();
            await booking.save();

            try {
                const io = getIO();
                const creatorId = booking.createdBy.toString();

                io.to(creatorId).emit("bulk_booking_update", {
                    bookingId: booking._id, status: "Accepted", fleetName: "System Admin",
                    message: "Your bulk booking has been accepted by Admin!"
                });

                if (booking.createdByModel === 'Agent') {
                    io.to(`agent_${creatorId}`).emit("bulk_booking_update", {
                        bookingId: booking._id, status: "Accepted", fleetName: "System Admin"
                    });
                }
                
                io.emit("remove_bulk_deal", { bookingId: booking._id });
            } catch (err) {
                console.error("Admin Bypass Notification Error:", err.message);
            }

            return res.json({ 
                success: true, 
                message: "Bulk Deal accepted by Admin successfully (Zero Security).", 
                booking
            });
        }

        // --- Fetch dynamic percentages from Admin & Handle Wallet Bypass ---
        const adminSettings = await Admin.findOne({ role: 'SuperAdmin' });
        const securityPct = adminSettings?.fleetBulkSecurityPct ?? 20;
        const payViaBank = adminSettings?.fleetSecurityPayViaBank ?? true;
        const maxNegativeWalletLimit = adminSettings?.maxNegativeWalletLimit ?? 3000;
        
        const securityAmount = Math.round(booking.offeredPrice * (securityPct / 100));

        // --- BYPASS LOGIC: Wallet Deduction instead of Bank Gateway ---
        if (!payViaBank || securityAmount <= 0) {
            let userRecord;
            let userModelName;
            
            if (role === 'fleet') {
                userRecord = await Fleet.findById(userId);
                userModelName = 'Fleet';
            } else if (role === 'driver') {
                userRecord = await Driver.findById(userId);
                userModelName = 'Driver';
            }

            if (userRecord) {
                const currentBalance = userRecord.walletBalance || 0;
                
                // If deduction pushes below limit
                if (currentBalance - securityAmount < -maxNegativeWalletLimit) {
                    return res.status(400).json({ 
                        success: false, 
                        message: `Limit Reached! You cannot accept this deal as it exceeds your wallet credit limit of -${maxNegativeWalletLimit}. Please clear your dues first.` 
                    });
                }

                // Proceed with Wallet Deduction
                userRecord.walletBalance = currentBalance - securityAmount;
                await userRecord.save();

                // Credit Admin Wallet
                if (adminSettings) {
                    adminSettings.walletBalance = (adminSettings.walletBalance || 0) + securityAmount;
                    adminSettings.totalEarnings = (adminSettings.totalEarnings || 0) + securityAmount;
                    await adminSettings.save();

                    await Transaction.create({
                        user: adminSettings._id, userModel: 'Admin', amount: securityAmount,
                        type: 'Credit', category: 'Bulk Security', status: 'Completed',
                        relatedBooking: booking._id, description: `Security received (Wallet bypass) for Bulk Booking ${booking._id}`
                    });
                }

                // Debit Fleet/Driver Wallet
                await Transaction.create({
                    user: userRecord._id, userModel: userModelName, amount: securityAmount,
                    type: 'Debit', category: 'Bulk Security', status: 'Completed',
                    relatedBooking: booking._id, description: `Security paid from Wallet to accept Bulk Deal #${booking._id.toString().slice(-6)}`
                });

                booking.fleetSecurityPayment = {
                    amount: securityAmount,
                    isPaid: true,
                    hdfcOrderId: "WALLET_BYPASS",
                    fleetId: role === 'fleet' ? userId : null
                };
                
                booking.status = 'Accepted';
                if (role === 'fleet') {
                    booking.assignedFleet = userId;
                } else if (role === 'driver') {
                    booking.assignedDrivers.push({
                        driver: userId,
                        car: null, // Self-registered driver has no FleetCar
                        status: 'Pending',
                        assignedAt: new Date()
                    });
                }
                booking.acceptedAt = new Date();
                await booking.save();

                // Notify Creator
                try {
                    const io = getIO();
                    const creatorId = booking.createdBy.toString();
                    const acceptorName = role === 'fleet' ? userRecord.companyName : userRecord.name;

                    io.to(creatorId).emit("bulk_booking_update", {
                        bookingId: booking._id, status: "Accepted", fleetName: acceptorName,
                        message: "Your bulk booking has been accepted!"
                    });

                    if (booking.createdByModel === 'Agent') {
                        io.to(`agent_${creatorId}`).emit("bulk_booking_update", {
                            bookingId: booking._id, status: "Accepted", fleetName: acceptorName
                        });
                    }

                    let creator = null;
                    if (booking.createdByModel === 'User') creator = await User.findById(creatorId);
                    else if (booking.createdByModel === 'Agent') creator = await Agent.findById(creatorId);

                    if (creator && creator.fcmToken) {
                        await sendPushNotification(creator.fcmToken, {
                            title: "📦 Bulk Booking Accepted!",
                            body: `Your booking has been accepted by ${acceptorName}.`,
                            data: { bookingId: booking._id.toString(), type: "BULK_BOOKING_ACCEPTED" }
                        });
                    }

                    // Remove from other fleets' marketplace
                    io.emit("remove_bulk_deal", { bookingId: booking._id });
                } catch (err) {
                    console.error("Payment Success Notification Error (Bypass):", err.message);
                }

                return res.json({ 
                    success: true, 
                    message: "Security paid via Wallet! Deal assigned to you.", 
                    booking,
                    walletDeducted: true 
                });
            }
        }

        // --- NORMAL BANK PAYMENT FLOW ---
        const orderIdString = `bulk_sec_${booking._id.toString().slice(-6)}_${Date.now()}`;

        const frontendOrigin = req.headers.origin || process.env.FRONTEND_FLEET_URL || 'http://localhost:5178';
        const protocol = req.get('host').includes('localhost') || req.get('host').includes('127.0.0.1') ? req.protocol : 'https';
        const returnRedirectPath = role === 'driver' ? '/driver/bulk-marketplace' : '/bulk-marketplace';
        const returnUrl = `${protocol}://${req.get('host')}/api/bulk-bookings/payment-return?redirect=${encodeURIComponent(frontendOrigin + returnRedirectPath)}`;

        // const sessionResponse = await paymentHandler.orderSession({
        const sessionResponse = await razorpayHandler.orderSession({
            order_id: orderIdString,
            amount: securityAmount.toFixed(2),
            customer_id: userId.toString(),
            customer_email: role === 'driver' ? "driver@example.com" : "fleet@example.com",
            customer_phone: "9999999999",
            return_url: returnUrl
        });

        booking.fleetSecurityPayment = {
            amount: securityAmount,
            isPaid: false,
            hdfcOrderId: orderIdString,
            fleetId: userId
        };
        await booking.save();

        res.json({
            success: true,
            message: "To accept this deal, please pay security commission.",
            securityAmount,
            bookingId: booking._id,
            paymentLinks: sessionResponse.payment_links || sessionResponse
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 3.5. Verify Bulk Payment (Advance or Security)
exports.verifyBulkPayment = async (req, res) => {
    try {
        const { bookingId, paymentId, type } = req.body; // type: 'advance' or 'security'
        const booking = await BulkBooking.findById(bookingId);
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        const admin = await Admin.findOne();

        if (type === 'advance') {
            booking.advancePayment.isPaid = true;
            booking.advancePayment.hdfcTransactionId = paymentId;
            booking.status = 'Marketplace';
            await booking.save();

            // Credit Admin Wallet
            if (admin) {
                admin.walletBalance += (booking.advancePayment?.amount || 0);
                admin.totalEarnings += (booking.advancePayment?.amount || 0);
                await admin.save();

                // Record Admin Credit (for advance received)
                await Transaction.create({
                    user: admin._id, userModel: 'Admin', amount: booking.advancePayment.amount,
                    type: 'Credit', category: 'Bulk Advance', status: 'Completed',
                    relatedBooking: booking._id, description: `Advance received for Bulk Booking #${booking._id.toString().slice(-6)}`
                });
            }

            // 💰 Record Payer Debit (User or Agent)
            if (['User', 'Agent'].includes(booking.createdByModel)) {
                await Transaction.create({
                    user: booking.createdBy,
                    userModel: booking.createdByModel,
                    amount: booking.advancePayment.amount,
                    type: 'Debit',
                    category: 'Bulk Advance',
                    status: 'Completed',
                    relatedBooking: booking._id,
                    description: `Advance paid for Bulk Booking #${booking._id.toString().slice(-6)}`
                });
            }

            // 🛰️ NOTIFY FLEETS (Targeted Logic)
            try {
                const io = getIO();
                const fleets = await Fleet.find({ isActive: true });
                let eligibleFleetIds = [];

                for (const fleet of fleets) {
                    let isEveryRequirementMet = true;
                    for (const reqItem of booking.carsRequired) {
                        const availableCount = await FleetCar.countDocuments({
                            fleetId: fleet._id,
                            carType: reqItem.category,
                            isApproved: true,
                            isActive: true
                        });
                        if (availableCount < (reqItem.quantity || 1)) {
                            isEveryRequirementMet = false;
                            break;
                        }
                    }
                    if (isEveryRequirementMet) eligibleFleetIds.push(fleet._id);
                }

                if (eligibleFleetIds.length > 0) {
                    eligibleFleetIds.forEach(fleetId => {
                        io.to(`fleet_${fleetId.toString()}`).emit("new_bulk_deal", {
                            bookingId: booking._id,
                            pickup: booking.pickup.address,
                            drop: booking.drop.address,
                            dateTime: booking.pickupDateTime,
                            tripType: booking.tripType,
                            offeredPrice: booking.offeredPrice,
                            cars: booking.carsRequired.length
                        });
                    });

                    // Emit to Admin Panel as well
                    io.to('admin_room').emit("new_bulk_deal", {
                        bookingId: booking._id,
                        pickup: booking.pickup.address,
                        drop: booking.drop.address,
                        dateTime: booking.pickupDateTime,
                        tripType: booking.tripType,
                        offeredPrice: booking.offeredPrice,
                        cars: booking.carsRequired.length
                    });

                    // --- FCM PUSH NOTIFICATION ---
                    for (const fleetId of eligibleFleetIds) {
                        const fleet = await Fleet.findById(fleetId);
                        if (fleet?.fcmToken) {
                            await sendPushNotification(fleet.fcmToken, {
                                title: `📦 New Bulk Deal: ₹${booking.offeredPrice}`,
                                body: `New bulk request at ${booking.pickup.address.split(',')[0]}. Check marketplace!`,
                                data: {
                                    bookingId: booking._id.toString(),
                                    type: "NEW_BULK_DEAL"
                                }
                            });
                        }
                    }
                }
            } catch (err) {
                console.error("FCM/Socket Error during Bulk Advance Payment:", err.message);
            }

            return res.json({ success: true, message: "Advance paid! Published to Marketplace." });

        } else if (type === 'security') {
            booking.fleetSecurityPayment.isPaid = true;
            booking.fleetSecurityPayment.hdfcTransactionId = paymentId;
            booking.status = 'Accepted';
            if (req.user.role === 'fleet') {
                booking.assignedFleet = req.user.id;
            } else if (req.user.role === 'driver') {
                booking.assignedDrivers.push({
                    driver: req.user.id,
                    car: null,
                    status: 'Pending',
                    assignedAt: new Date()
                });
            }
            booking.acceptedAt = new Date();
            await booking.save();

            // Credit Admin Wallet
            if (admin) {
                admin.walletBalance += (booking.fleetSecurityPayment?.amount || 0);
                admin.totalEarnings += (booking.fleetSecurityPayment?.amount || 0);
                await admin.save();

                await Transaction.create({
                    user: admin._id, userModel: 'Admin', amount: booking.fleetSecurityPayment.amount,
                    type: 'Credit', category: 'Bulk Security', status: 'Completed',
                    relatedBooking: booking._id, description: `Security from Fleet for Bulk Booking ${booking._id}`
                });
            }

            // --- NEW: Debit Fleet/Driver Wallet Balance & History ---
            if (req.user.role === 'fleet') {
                const fleet = await Fleet.findById(req.user.id);
                if (fleet) {
                    fleet.walletBalance -= booking.fleetSecurityPayment.amount;
                    await fleet.save();
                }
            } else if (req.user.role === 'driver') {
                const driver = await Driver.findById(req.user.id);
                if (driver) {
                    driver.walletBalance -= booking.fleetSecurityPayment.amount;
                    await driver.save();
                }
            }

            await Transaction.create({
                user: req.user.id, userModel: req.user.role === 'driver' ? 'Driver' : 'Fleet', amount: booking.fleetSecurityPayment.amount,
                type: 'Debit', category: 'Bulk Security', status: 'Completed',
                relatedBooking: booking._id, description: `Security paid to accept Bulk Deal #${booking._id.toString().slice(-6)}`
            });

            // 🛰️ NOTIFY CREATOR & REMOVE FROM MARKETPLACE
            try {
                console.log("[DEBUG] Emitting Socket and FCM Notifications");
                const io = getIO();
                const fleet = await Fleet.findById(req.user.id);
                const creatorId = booking.createdBy.toString();

                // 1. Socket Notification to Creator
                io.to(creatorId).emit("bulk_booking_update", {
                    bookingId: booking._id,
                    status: "Accepted",
                    fleetName: fleet ? fleet.companyName : "A Fleet Owner",
                    message: "Your bulk booking has been accepted!"
                });

                if (booking.createdByModel === 'Agent') {
                    io.to(`agent_${creatorId}`).emit("bulk_booking_update", {
                        bookingId: booking._id,
                        status: "Accepted",
                        fleetName: fleet ? fleet.companyName : "A Fleet Owner"
                    });
                }

                // 2. FCM Push Notification to Creator
                let creator = null;
                if (booking.createdByModel === 'User') {
                    creator = await User.findById(creatorId);
                } else if (booking.createdByModel === 'Agent') {
                    creator = await Agent.findById(creatorId);
                }

                if (creator && creator.fcmToken) {
                    await sendPushNotification(creator.fcmToken, {
                        title: "📦 Bulk Booking Accepted!",
                        body: `Your booking has been accepted by ${fleet ? fleet.companyName : 'a Fleet Owner'}.`,
                        data: {
                            bookingId: booking._id.toString(),
                            type: "BULK_BOOKING_ACCEPTED"
                        }
                    });
                }

                // 3. Remove from other fleets' marketplace view
                io.emit("remove_bulk_deal", { bookingId: booking._id });

            } catch (err) {
                console.error("Payment Success Notification Error:", err.message);
            }

            console.log("[DEBUG] About to call res.json from originalVerifyBulkPayment!");
            return res.json({ success: true, message: "Security paid! Deal assigned to you.", booking });
        }

        res.status(400).json({ success: false, message: "Invalid payment type" });
    } catch (error) {
        console.error("[DEBUG] originalVerifyBulkPayment Error Caught:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// 3. Assign Drivers & Cars to Bulk Booking (Fleet Only)
exports.assignDriversToBulk = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { assignments } = req.body; // Expecting [{ driverId, carId }, ...]
        const userId = req.user.id;
        const userRole = req.user.role;
        const isAdmin = userRole === 'admin' || userRole === 'SuperAdmin';

        if (!assignments || !Array.isArray(assignments)) {
            return res.status(400).json({ success: false, message: "Invalid assignments format." });
        }

        const booking = await BulkBooking.findById(bookingId);
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        // Security Check
        const isAuthorized = isAdmin || 
            (booking.assignedAdmin?.toString() === userId) || 
            (booking.assignedFleet?.toString() === userId);

        if (!isAuthorized) {
            return res.status(403).json({ success: false, message: "You are not authorized to assign drivers to this booking." });
        }

        // 🛡️ SECURITY CHECK: Don't allow changing drivers that have already started or completed
        const existingAssignments = booking.assignedDrivers || [];
        const nonPendingAssignments = existingAssignments.filter(d => d.status !== 'Pending');

        const results = [];
        const errors = [];
        const newAssignmentsList = [...nonPendingAssignments]; // Keep ongoing/completed intact

        for (const item of assignments) {
            const { driverId, carId } = item;
            if (!driverId) continue;

            // Verify Driver
            let driver = await Driver.findById(driverId);
            if (!driver && !isAdmin) {
                const fleetDriver = await FleetDriver.findById(driverId);
                if (fleetDriver) driver = await Driver.findOne({ email: fleetDriver.email });
            }

            if (!driver) {
                errors.push(`Driver ${driverId} not found.`);
                continue;
            }

            if (!isAdmin && driver.createdBy?.toString() !== userId && driver.createdByModel !== "Fleet") {
                errors.push(`Driver ${driver.name} is not in your fleet.`);
                continue;
            }

            const actualDriverId = driver._id;

            // Verify Car (Optional for Admin if driver has own car)
            let actualCarId = null;
            if (carId) {
                const car = await FleetCar.findById(carId);
                if (car) {
                    if (!isAdmin && car.fleetId?.toString() !== userId) {
                        errors.push(`Car ${carId} not found or not in your fleet.`);
                        continue;
                    }
                    actualCarId = car._id;
                }
            }

            // Clash Detector (4-hour buffer check)
            const bufferHours = 4;
            const tripStartTime = new Date(booking.pickupDateTime);
            const bufferStart = new Date(tripStartTime.getTime() - bufferHours * 60 * 60 * 1000);
            const bufferEnd = new Date(tripStartTime.getTime() + bufferHours * 60 * 60 * 1000);

            const conflictingBooking = await BulkBooking.findOne({
                "assignedDrivers.driver": actualDriverId,
                status: { $in: ['Accepted', 'Ongoing'] },
                _id: { $ne: bookingId },
                pickupDateTime: { $gte: bufferStart, $lte: bufferEnd }
            });

            if (conflictingBooking) {
                errors.push(`Clash! Driver ${driver.name} is busy with another booking at ${conflictingBooking.pickupDateTime.toLocaleString()}.`);
                continue;
            }

            // Check if already in newAssignmentsList
            const isAlready = newAssignmentsList.some(d => 
                (d.driver?._id?.toString() || d.driver?.toString()) === actualDriverId.toString()
            );
            if (isAlready) {
                errors.push(`Driver ${driver.name} is already assigned to this booking.`);
                continue;
            }

            // Check if driver was already assigned previously
            const previouslyAssigned = existingAssignments.some(d => 
                (d.driver?._id?.toString() || d.driver?.toString()) === actualDriverId.toString()
            );

            // Determine category name if categoryId is provided
            let assignedCatName = null;
            if (item.categoryId) {
                try {
                    const catDoc = await CarCategory.findById(item.categoryId);
                    if (catDoc) assignedCatName = catDoc.name;
                } catch (e) { }
            }

            // Add assignment
            newAssignmentsList.push({
                driver: actualDriverId,
                car: actualCarId,
                category: item.categoryId || null,
                categoryName: assignedCatName,
                status: 'Pending',
                assignedAt: new Date()
            });
            results.push(driver.name);

            // Only notify if newly assigned
            if (!previouslyAssigned) {
                try {
                    const { getIO } = require("../socket/socket");
                    const io = getIO();
                    io.to(actualDriverId.toString()).emit("new_bulk_assignment", {
                        bookingId: booking._id,
                        pickup: booking.pickup.address,
                        dateTime: booking.pickupDateTime
                    });

                    if (driver.fcmToken) {
                        await sendPushNotification(driver.fcmToken, {
                            title: "📦 New Bulk Assignment",
                            body: `You are assigned to a bulk trip at ${booking.pickup.address.split(',')[0]}.`,
                            data: { bookingId: booking._id.toString(), type: "BULK_ASSIGNMENT" }
                        });
                    }
                } catch (err) { }
            }
        }

        booking.assignedDrivers = newAssignmentsList;
        await booking.save();

        res.json({
            success: true,
            message: errors.length > 0
                ? `Assigned: ${results.join(", ")}. Warnings: ${errors.join(" | ")}`
                : `Successfully updated driver assignments (${results.length} active)!`,
            assignedDrivers: booking.assignedDrivers
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getMyBulkBookings = async (req, res) => {
    try {
        const fleetId = req.user.id;
        const bookings = await BulkBooking.find({ assignedFleet: fleetId })
            .populate("carsRequired.category", "name image bulkBookingBasePrice")
            .populate("createdBy", "name phone image")
            .populate("assignedDrivers.driver", "name phone image carDetails")
            .populate("assignedDrivers.car", "carNumber carModel")
            .populate("assignedDrivers.category", "name image bulkBookingBasePrice")
            .sort({ acceptedAt: -1 });


        res.json({ success: true, count: bookings.length, bookings });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 5. Get Requests Created by Logged In User
exports.getMyCreatedRequests = async (req, res) => {
    try {
        const bookings = await BulkBooking.find({ createdBy: req.user.id })
            .populate("carsRequired.category", "name image bulkBookingBasePrice")
            .populate("createdBy", "name phone email")
            .populate("assignedFleet", "companyName phone name image")
            .populate("assignedDrivers.driver", "name phone image")
            .sort({ createdAt: -1 });

        res.json({ success: true, count: bookings.length, bookings });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 6. Cancel Bulk Request
exports.cancelBulkBooking = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const booking = await BulkBooking.findById(bookingId);

        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        // Only creator or admin can cancel
        if (booking.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: "Not authorized to cancel this booking" });
        }

        // Can only cancel if in Marketplace or Accepted (before ongoing)
        if (!['Marketplace', 'Accepted'].includes(booking.status)) {
            return res.status(400).json({ success: false, message: `Cannot cancel a ${booking.status} ride` });
        }

        booking.status = 'Cancelled';
        await booking.save();

        // Restore first ride discount eligibility if bulk ride cancelled
        if (booking.createdByModel === 'User' && booking.createdBy) {
            const firstRideHelper = require("../utils/firstRideHelper");
            await firstRideHelper.restoreFirstRideDiscountIfNeeded(booking.createdBy);
        }

        // Socket notify
        try {
            getIO().emit("remove_bulk_deal", { bookingId: booking._id });
        } catch (err) { }

        res.json({ success: true, message: "Booking cancelled successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 7. Hard Delete Bulk Booking (Admin Only)
exports.deleteBulkBooking = async (req, res) => {
    try {
        const { bookingId } = req.params;

        // Security check: Only Admins can delete
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: "Only Admins are allowed to delete bookings permanently." });
        }

        const booking = await BulkBooking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        // Strict Rule: Only Marketplace, Accepted, PendingPayment, Cancelled, or Expired rides can be deleted
        if (!['Marketplace', 'Accepted', 'PendingPayment', 'Cancelled', 'Expired'].includes(booking.status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete a ${booking.status} ride. Admin can only delete Marketplace, Accepted, PendingPayment, Cancelled, or Expired rides.`
            });
        }

        await BulkBooking.findByIdAndDelete(bookingId);

        res.json({
            success: true,
            message: "Bulk booking record deleted successfully from database."
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 8. Start Bulk Trip (OTP Search)
exports.startBulkBooking = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { otp } = req.body;

        const booking = await BulkBooking.findById(bookingId);
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        // Security: Only assigned fleet can start
        if (booking.assignedFleet?.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: "Not authorized. Only the assigned fleet can start this trip." });
        }

        if (booking.status !== "Accepted") {
            return res.status(400).json({ success: false, message: `Booking must be in 'Accepted' status to start. Current status: ${booking.status}` });
        }

        if (booking.startOtp !== otp) {
            return res.status(400).json({ success: false, message: "Invalid OTP! Please check with the customer." });
        }

        booking.status = "Ongoing";
        await booking.save();

        // Notify Creator
        try {
            getIO().to(booking.createdBy.toString()).emit("bulk_booking_update", {
                bookingId: booking._id,
                status: "Ongoing",
                message: "Your bulk trip has officially started!"
            });
        } catch (err) { }

        res.json({ success: true, message: "Trip started successfully! Enjoy the ride.", booking });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

/**
 * Helper: Calculate fair Category-wise payout share and commission for a driver assignment in Bulk Deal
 */
async function calculateCategoryPayoutShare(booking, assignment) {
    if (!booking || !assignment) return null;

    // Ensure carsRequired.category is populated
    if (booking.carsRequired && booking.carsRequired.length > 0 && !booking.carsRequired[0]?.category?.name) {
        await booking.populate("carsRequired.category");
    }

    // Expand categories slot-by-slot to align with each vehicle slot
    const slotCategories = [];
    (booking.carsRequired || []).forEach(req => {
        const cat = req.category;
        const qty = req.quantity || 1;
        for (let i = 0; i < qty; i++) {
            slotCategories.push(cat);
        }
    });

    const actualDriverId = assignment.driver?._id?.toString() || assignment.driver?.toString();
    let targetCat = null;

    // 1. Direct assignment.category match
    if (assignment.category) {
        const assignCatId = assignment.category?._id?.toString() || assignment.category?.toString();
        targetCat = slotCategories.find(c => c?._id?.toString() === assignCatId);
        if (!targetCat) {
            try { targetCat = await CarCategory.findById(assignCatId); } catch (e) { }
        }
    }

    // 2. By assignment index in slotCategories
    if (!targetCat && booking.assignedDrivers) {
        const assignIdx = booking.assignedDrivers.findIndex(d => 
            (d.driver?._id?.toString() || d.driver?.toString()) === actualDriverId
        );
        if (assignIdx >= 0 && assignIdx < slotCategories.length) {
            targetCat = slotCategories[assignIdx];
        }
    }

    // 3. By driver's registered vehicle category
    if (!targetCat && actualDriverId) {
        try {
            const driverDoc = await Driver.findById(actualDriverId).populate("carDetails.carType");
            const driverCarType = driverDoc?.carDetails?.carType;
            if (driverCarType) {
                const driverCarTypeId = driverCarType?._id?.toString() || driverCarType.toString();
                targetCat = slotCategories.find(c => c?._id?.toString() === driverCarTypeId);
                if (!targetCat) {
                    targetCat = driverCarType;
                }
            }
        } catch (e) { }
    }

    // 4. Fallback: first category
    if (!targetCat && slotCategories.length > 0) {
        targetCat = slotCategories[0];
    }

    // Include targetCat in slotCategories if missing so weights are proportional
    if (targetCat && !slotCategories.some(c => c?._id?.toString() === targetCat._id?.toString())) {
        slotCategories.push(targetCat);
    }

    // Weight calculation function for category fairness
    const getWeight = (cat) => {
        if (!cat) return 1000;
        const distanceMultiplier = booking.tripType === 'RoundTrip' ? 2 : 1;
        const dist = booking.totalDistance || 50;
        const actualKm = dist * distanceMultiplier;
        const basePrice = cat.bulkBookingBasePrice || 0;
        const kmRate = cat.privateRatePerKm || 12;

        if (basePrice > 200) {
            return basePrice;
        } else if (basePrice > 0) {
            return actualKm * basePrice;
        } else {
            return actualKm * kmRate;
        }
    };

    const totalBaseWeight = slotCategories.reduce((sum, c) => sum + getWeight(c), 0);
    const targetWeight = getWeight(targetCat);
    const totalDealPrice = booking.offeredPrice || booking.systemEstimatedPrice || 0;

    let grossShare = 0;
    if (totalBaseWeight > 0 && totalDealPrice > 0) {
        grossShare = Math.round((targetWeight / totalBaseWeight) * totalDealPrice);
    } else if (slotCategories.length > 0 && totalDealPrice > 0) {
        grossShare = Math.round(totalDealPrice / slotCategories.length);
    }

    // Commission calculation (default 10% or admin configured)
    let adminPercentage = 10;
    try {
        const adminDoc = await Admin.findOne({ role: 'SuperAdmin' }) || await Admin.findOne();
        if (adminDoc && adminDoc.defaultCommission !== undefined) {
            adminPercentage = adminDoc.defaultCommission;
        }
        if (booking.assignedFleet) {
            const fleet = await Fleet.findById(booking.assignedFleet);
            if (fleet && fleet.commissionPercentage !== undefined) {
                adminPercentage = fleet.commissionPercentage;
            }
        }
    } catch (e) { }

    const commissionAmount = Math.round(grossShare * (adminPercentage / 100));
    const netPayout = Math.max(0, grossShare - commissionAmount);
    const catName = targetCat?.name || assignment.categoryName || 'Vehicle';

    return {
        targetCat,
        catName,
        targetWeight,
        totalBaseWeight,
        grossShare,
        commissionAmount,
        adminPercentage,
        netPayout
    };
}

/**
 * Helper: Category-wise Driver Wallet Settlement for Bulk Deal
 */
async function settleDriverBulkPayout(booking, assignment) {
    try {
        if (!assignment || assignment.payoutSettled) return null;
        if (booking.assignedFleet) return null; // Fleets handle their own fleet drivers

        const actualDriverId = assignment.driver?._id || assignment.driver;
        if (!actualDriverId) return null;

        const driver = await Driver.findById(actualDriverId);
        if (!driver) return null;

        const calc = await calculateCategoryPayoutShare(booking, assignment);
        if (!calc || calc.netPayout <= 0) return null;

        const { netPayout, grossShare, commissionAmount, adminPercentage, catName } = calc;

        // Credit Driver Wallet
        driver.walletBalance = (driver.walletBalance || 0) + netPayout;
        driver.totalEarnings = (driver.totalEarnings || 0) + netPayout;
        await driver.save();

        // Record Driver Transaction
        await Transaction.create({
            user: driver._id,
            userModel: 'Driver',
            amount: netPayout,
            type: 'Credit',
            category: 'Bulk Earnings',
            status: 'Completed',
            relatedBooking: booking._id,
            description: `Bulk Trip Earning for ${catName} (Deal #${booking._id.toString().slice(-6)}) - Gross: ₹${grossShare} (Commission: ${adminPercentage}% / ₹${commissionAmount})`
        });

        // Mark assignment as settled
        assignment.payoutAmount = netPayout;
        assignment.grossShare = grossShare;
        assignment.commission = commissionAmount;
        assignment.categoryName = catName;
        assignment.payoutSettled = true;
        assignment.payoutSettledAt = new Date();

        // Debit Admin Wallet
        const adminDoc = await Admin.findOne({ role: 'SuperAdmin' }) || await Admin.findOne();
        if (adminDoc) {
            adminDoc.walletBalance = (adminDoc.walletBalance || 0) - netPayout;
            await adminDoc.save();
            await Transaction.create({
                user: adminDoc._id,
                userModel: 'Admin',
                amount: netPayout,
                type: 'Debit',
                category: 'Bulk Payout',
                status: 'Completed',
                relatedBooking: booking._id,
                description: `Driver Bulk Payout to ${driver.name} for ${catName} (Deal #${booking._id.toString().slice(-6)})`
            });
        }

        // Realtime Socket Notify
        try {
            const { getIO } = require("../socket/socket");
            const io = getIO();
            io.to(driver._id.toString()).emit("wallet_credit", {
                amount: netPayout,
                category: catName,
                message: `₹${netPayout} credited to your wallet for ${catName} Bulk Trip.`
            });
        } catch (err) { }

        // Push Notification
        if (driver.fcmToken) {
            try {
                await sendPushNotification(driver.fcmToken, {
                    title: "💰 Bulk Trip Earnings Credited",
                    body: `₹${netPayout} credited to your wallet for completing ${catName} bulk trip.`,
                    data: { bookingId: booking._id.toString(), type: "WALLET_CREDIT" }
                });
            } catch (err) { }
        }

        console.log(`[BULK SETTLEMENT] Settled ₹${netPayout} to Driver ${driver.name} (${catName}) for Deal #${booking._id}`);
        return { driverName: driver.name, netPayout, grossShare, catName };
    } catch (err) {
        console.error("Error in settleDriverBulkPayout:", err.message);
        return null;
    }
}

// 9. End Bulk Trip
exports.endBulkBooking = async (req, res) => {
    try {
        const { bookingId } = req.params;

        const booking = await BulkBooking.findById(bookingId);
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        const isAdmin = req.user.role === 'admin' || req.user.role === 'SuperAdmin';

        if (booking.assignedFleet?.toString() !== req.user.id && booking.assignedAdmin?.toString() !== req.user.id && !isAdmin) {
            return res.status(403).json({ success: false, message: "Not authorized to end this trip." });
        }

        if (booking.status !== "Ongoing" && !(isAdmin && booking.status === "Accepted")) {
            return res.status(400).json({ success: false, message: "Only Ongoing trips can be ended. Admins can end Accepted trips directly." });
        }

        booking.status = "Completed";

        if (booking.createdByModel === 'User' && booking.createdBy) {
            await require('../models/User').findByIdAndUpdate(booking.createdBy, { hasUsedFirstRideDiscount: true });
        }

        // 💰 AGENT COMMISSION LOGIC
        if (booking.createdByModel === 'Agent') {
            try {
                const agent = await Agent.findById(booking.createdBy);
                if (agent) {
                    const commissionPercent = agent.bulkCommissionPercentage || 5;

                    // Calculate from Admin Company Profit instead of total booking price
                    let adminPercentage = 10;
                    const adminDoc = await Admin.findOne({ role: 'SuperAdmin' }) || await Admin.findOne();
                    if (adminDoc) adminPercentage = adminDoc.defaultCommission || 10;
                    if (booking.assignedFleet) {
                        const fleet = await Fleet.findById(booking.assignedFleet);
                        if (fleet && fleet.commissionPercentage !== undefined) adminPercentage = fleet.commissionPercentage;
                    }
                    const totalCompanyProfit = Math.round((booking.offeredPrice || 0) * (adminPercentage / 100));
                    const commissionAmount = Math.round(totalCompanyProfit * (commissionPercent / 100));

                    agent.walletBalance += commissionAmount;
                    agent.totalEarnings += commissionAmount;
                    await agent.save();

                    booking.agentCommissionPaid = true;
                    booking.agentCommissionAmount = commissionAmount;

                    await Transaction.create({
                        user: agent._id, userModel: 'Agent', amount: commissionAmount,
                        type: 'Credit', category: 'Commission', status: 'Completed',
                        relatedBooking: booking._id, description: `Bulk deal commission (${commissionPercent}% of Company Profit)`
                    });

                    // Deduct from Admin or Fleet
                    if (booking.assignedAdmin) {
                        const Admin = require("../models/Admin");
                        const admin = await Admin.findById(booking.assignedAdmin);
                        if (admin) {
                            admin.walletBalance -= commissionAmount;
                            await admin.save();
                            await Transaction.create({
                                user: admin._id, userModel: 'Admin', amount: commissionAmount,
                                type: 'Debit', category: 'Commission', status: 'Completed',
                                relatedBooking: booking._id, description: `Paid Agent Commission for Bulk Deal #${booking._id.toString().slice(-6)}`
                            });
                        }
                    } else if (booking.assignedFleet) {
                        const Fleet = require("../models/Fleet");
                        const fleet = await Fleet.findById(booking.assignedFleet);
                        if (fleet) {
                            fleet.walletBalance -= commissionAmount;
                            await fleet.save();
                            await Transaction.create({
                                user: fleet._id, userModel: 'Fleet', amount: commissionAmount,
                                type: 'Debit', category: 'Commission', status: 'Completed',
                                relatedBooking: booking._id, description: `Paid Agent Commission for Bulk Deal #${booking._id.toString().slice(-6)}`
                            });
                        }
                    }
                }
            } catch (err) {
                console.error("Bulk Agent Commission Error:", err.message);
            }
        }

        // 💰 Category-Wise Driver Wallet Settlement for all assigned Drivers
        if (!booking.assignedFleet && booking.assignedDrivers && booking.assignedDrivers.length > 0) {
            try {
                for (const d of booking.assignedDrivers) {
                    if (d.status === 'Ongoing' || d.status === 'Pending') {
                        d.status = 'Completed';
                        d.endedAt = new Date();
                    }
                    if (!d.payoutSettled) {
                        await settleDriverBulkPayout(booking, d);
                    }
                }
            } catch (err) { console.error("Driver End Settlement Error:", err.message); }
        }

        await booking.save();

        // Notify Creator
        try {
            getIO().to(booking.createdBy.toString()).emit("bulk_booking_update", {
                bookingId: booking._id,
                status: "Completed",
                message: "Your bulk trip has been completed successfully."
            });
        } catch (err) { }

        res.json({ success: true, message: "Trip completed successfully!", booking });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 10. Get Bulk Assignments for a Specific Driver
exports.getDriverBulkAssignments = async (req, res) => {
    try {
        const driverId = req.user.id;

        // Find bulk bookings where this driver is in the assignedDrivers array
        const assignments = await BulkBooking.find({
            "assignedDrivers.driver": driverId
        })
            .populate("carsRequired.category")
            .populate("assignedDrivers.driver", "name phone image carDetails")
            .populate("assignedDrivers.car", "carNumber carModel")
            .populate("assignedDrivers.category", "name image bulkBookingBasePrice privateRatePerKm")
            .populate("createdBy", "name phone image")
            .sort({ pickupDateTime: 1 });

        // Transform results to only show the relevant assignment for this driver
        const myAssignments = await Promise.all(assignments.map(async ride => {
            const myPair = ride.assignedDrivers.find(d => 
                (d.driver?._id?.toString() || d.driver?.toString()) === driverId.toString()
            );
            const driverDoc = myPair?.driver;
            const fallbackCar = driverDoc?.carDetails ? {
                carNumber: driverDoc.carDetails.carNumber,
                carModel: driverDoc.carDetails.carModel || driverDoc.carDetails.vehicleType
            } : null;

            let payout = myPair?.payoutAmount || 0;
            let catName = myPair?.categoryName || myPair?.category?.name;
            let gross = myPair?.grossShare || 0;
            let commission = myPair?.commission || 0;

            // Compute estimate if not settled yet
            if (!myPair?.payoutSettled) {
                try {
                    const calc = await calculateCategoryPayoutShare(ride, myPair);
                    if (calc) {
                        payout = calc.netPayout;
                        gross = calc.grossShare;
                        commission = calc.commissionAmount;
                        if (!catName) catName = calc.catName;
                    }
                } catch (e) { }
            }

            return {
                ...ride.toObject(),
                myCar: myPair?.car || fallbackCar,
                myStatus: myPair?.status || 'Pending',
                myCategory: myPair?.category || catName,
                myCategoryName: catName,
                myPayoutAmount: payout,
                myPayoutSettled: myPair?.payoutSettled || false,
                myGrossShare: gross,
                myCommission: commission
            };
        }));

        res.json({ success: true, count: myAssignments.length, assignments: myAssignments });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 11. Individual Driver Start for Bulk Trip
exports.startIndividualDriverBulkTrip = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { otp } = req.body;
        const driverId = req.user.id;

        const booking = await BulkBooking.findById(bookingId);
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        // Verify main OTP
        if (booking.startOtp !== otp) {
            return res.status(400).json({ success: false, message: "Invalid OTP! Please check with the customer." });
        }

        // Find this driver's assignment
        const assignment = booking.assignedDrivers.find(d => d.driver.toString() === driverId.toString());
        if (!assignment) return res.status(403).json({ success: false, message: "You are not assigned to this booking." });

        if (assignment.status !== 'Pending') {
            return res.status(400).json({ success: false, message: `Trip is already ${assignment.status}` });
        }

        // Update individual status
        assignment.status = 'Ongoing';
        assignment.startedAt = new Date();

        // If it's the first driver to start, update overall booking status
        if (booking.status === 'Accepted') {
            booking.status = 'Ongoing';
        }

        await booking.save();

        res.json({ success: true, message: "Trip started successfully! Have a safe drive.", booking });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 12. Individual Driver End for Bulk Trip
exports.endIndividualDriverBulkTrip = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { paymentMode } = req.body; // 'Cash' or 'Online' - only required for last driver
        const driverId = req.user.id;

        const booking = await BulkBooking.findById(bookingId).populate("carsRequired.category");
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        const assignment = booking.assignedDrivers.find(d => d.driver.toString() === driverId.toString());
        if (!assignment) return res.status(403).json({ success: false, message: "Not assigned." });

        if (assignment.status !== 'Ongoing') {
            return res.status(400).json({ success: false, message: "Trip is not ongoing." });
        }

        // Check if this is the LAST driver
        const completedCount = booking.assignedDrivers.filter(d => d.status === 'Completed').length;
        const totalDrivers = booking.assignedDrivers.length;
        const isLastDriver = (completedCount === totalDrivers - 1);

        const displayPrice = booking.totalPriceWithTax || booking.offeredPrice;
        const remainingBalance = displayPrice - (booking.advancePayment?.amount || 0);

        if (isLastDriver && !paymentMode && remainingBalance > 0) {
            return res.status(400).json({
                success: false,
                message: "Last driver must specify payment mode.",
                isLastDriver: true,
                remainingBalance
            });
        }

        // If it's the last driver and online payment, DO NOT mark completed yet.
        if (isLastDriver && paymentMode === 'Online' && remainingBalance > 0) {
            // Create HDFC Order for Final Balance
            try {
                const orderIdString = `bulk_final_${bookingId.slice(-6)}_${Date.now()}`;
                const frontendOrigin = req.headers.origin || process.env.FRONTEND_DRIVER_URL || 'http://localhost:5174';
                // const sessionResponse = await paymentHandler.orderSession({
                const sessionResponse = await razorpayHandler.orderSession({
                    order_id: orderIdString,
                    amount: remainingBalance.toFixed(2),
                    customer_id: booking.createdBy ? booking.createdBy.toString() : "guest",
                    customer_email: "test@example.com",
                    customer_phone: "9999999999",
                    return_url: `${req.get('host').includes('localhost') || req.get('host').includes('127.0.0.1') ? req.protocol : 'https'}://${req.get('host')}/api/bulk-bookings/payment-return?redirect=${encodeURIComponent(frontendOrigin + '/scheduled-jobs')}`
                });

                // Save temporary orderId for webhook to find it
                booking.hdfcFinalOrderId = orderIdString;
                await booking.save();

                return res.json({
                    success: true,
                    isOnlinePayment: true,
                    hdfcOrderId: orderIdString,
                    amount: remainingBalance,
                    paymentLinks: sessionResponse.payment_links || sessionResponse,
                    bookingId: booking._id
                });
            } catch (err) {
                return res.status(500).json({ success: false, message: "HDFC Payment Error", error: err.message });
            }
        }

        // For Cash payment or non-last drivers, update driver specific status now
        assignment.status = 'Completed';
        assignment.endedAt = new Date();

        // 💰 Settle category-wise payout for this completed driver immediately
        await settleDriverBulkPayout(booking, assignment);

        if (isLastDriver) {
            booking.status = 'Completed';

            if (booking.createdByModel === 'User' && booking.createdBy) {
                await require('../models/User').findByIdAndUpdate(booking.createdBy, { hasUsedFirstRideDiscount: true });
            }

            // Record final payment info (Cash case)
            booking.finalPayment = {
                amount: remainingBalance,
                method: paymentMode || 'Cash',
                isPaid: true,
                at: new Date()
            };

            // 💰 CASH COLLECTION RECONCILIATION: Driver holds cash in hand, Admin ledger balances
            if (paymentMode === 'Cash' && remainingBalance > 0 && !booking.assignedFleet) {
                try {
                    const lastDriver = await Driver.findById(driverId);
                    if (lastDriver) {
                        lastDriver.walletBalance = (lastDriver.walletBalance || 0) - remainingBalance;
                        await lastDriver.save();

                        await Transaction.create({
                            user: lastDriver._id,
                            userModel: 'Driver',
                            amount: remainingBalance,
                            type: 'Debit',
                            category: 'Cash Collection',
                            status: 'Completed',
                            relatedBooking: booking._id,
                            description: `Cash collected from customer for Bulk Booking #${booking._id.toString().slice(-6)} (₹${remainingBalance})`
                        });

                        const adminDoc = await Admin.findOne({ role: 'SuperAdmin' }) || await Admin.findOne();
                        if (adminDoc) {
                            adminDoc.walletBalance = (adminDoc.walletBalance || 0) + remainingBalance;
                            await adminDoc.save();
                            await Transaction.create({
                                user: adminDoc._id,
                                userModel: 'Admin',
                                amount: remainingBalance,
                                type: 'Credit',
                                category: 'Bulk Cash Settlement',
                                status: 'Completed',
                                relatedBooking: booking._id,
                                description: `Cash collected by Driver ${lastDriver.name} for Bulk Booking #${booking._id.toString().slice(-6)}`
                            });
                        }
                    }
                } catch (err) {
                    console.error("Cash Collection Ledger Error:", err.message);
                }
            }

            // 💰 AUTOMATIC SETTLEMENT LOGIC 💰
            // (Imports like Admin, Agent, Transaction are already at the top of the file)

            // 1. Credit Agent Commission
            if (booking.createdByModel === 'Agent' && booking.createdBy) {
                try {
                    const agent = await Agent.findById(booking.createdBy);
                    if (agent) {
                        const commissionPercent = agent.bulkCommissionPercentage || 5;

                        // Calculate from Admin Company Profit instead of total booking price
                        let adminPercentage = 10;
                        const adminDoc = await Admin.findOne({ role: 'SuperAdmin' }) || await Admin.findOne();
                        if (adminDoc) adminPercentage = adminDoc.defaultCommission || 10;
                        if (booking.assignedFleet) {
                            const fleet = await Fleet.findById(booking.assignedFleet);
                            if (fleet && fleet.commissionPercentage !== undefined) adminPercentage = fleet.commissionPercentage;
                        }
                        const totalCompanyProfit = Math.round((booking.offeredPrice || 0) * (adminPercentage / 100));
                        const commissionAmount = Math.round(totalCompanyProfit * (commissionPercent / 100));

                        if (commissionAmount > 0) {
                            agent.walletBalance += commissionAmount;
                            agent.totalEarnings += commissionAmount;
                            await agent.save();

                            booking.agentCommissionPaid = true;
                            booking.agentCommissionAmount = commissionAmount;

                            await Transaction.create({
                                user: agent._id, userModel: 'Agent', amount: commissionAmount,
                                type: 'Credit', category: 'Commission', status: 'Completed',
                                relatedBooking: booking._id, description: `Bulk deal commission (${commissionPercent}% of Company Profit)`
                            });
                        }
                    }
                } catch (err) { console.error("Agent Commission Error:", err.message); }
            }

            // 2. Settlement with Fleet Owner (Refund part of Advance)
            try {
                if (booking.assignedFleet && booking.advancePayment?.isPaid) {
                    const fleet = await Fleet.findById(booking.assignedFleet);
                    if (fleet) {
                        const advanceAmount = booking.advancePayment.amount || 0;
                        const agentComm = booking.agentCommissionAmount || 0;
                        const refundToFleet = advanceAmount - agentComm;

                        if (refundToFleet > 0) {
                            fleet.walletBalance += refundToFleet;
                            await fleet.save();

                            await Transaction.create({
                                user: fleet._id, userModel: 'Fleet', amount: refundToFleet,
                                type: 'Credit', category: 'Refund', status: 'Completed',
                                relatedBooking: booking._id, description: `Advance refund (Deal #${booking._id.toString().slice(-6)})`
                            });

                            // 🔴 Debit Admin (Payout to Fleet)
                            const admin = await Admin.findOne();
                            if (admin) {
                                admin.walletBalance -= refundToFleet;
                                await admin.save();
                                await Transaction.create({
                                    user: admin._id, userModel: 'Admin', amount: refundToFleet,
                                    type: 'Debit', category: 'Bulk Payout', status: 'Completed',
                                    relatedBooking: booking._id, description: `Refunded advance to Fleet Owner (Deal #${booking._id.toString().slice(-6)})`
                                });
                            }
                        }
                    }
                }
            } catch (err) { console.error("Fleet Settlement Error:", err.message); }

            // 2.5 Category-Wise Settlement for all assigned Drivers
            try {
                if (!booking.assignedFleet && booking.assignedDrivers && booking.assignedDrivers.length > 0) {
                    for (const d of booking.assignedDrivers) {
                        if (!d.payoutSettled) {
                            await settleDriverBulkPayout(booking, d);
                        }
                    }
                }
            } catch (err) { console.error("Driver Settlement Error:", err.message); }

            // 3. Master Franchise Vendor Settlement
            try {
                const uniqueVendorIds = new Set();
                if (booking.createdByModel === 'Agent' && booking.createdBy) {
                    const agent = await Agent.findById(booking.createdBy);
                    if (agent && agent.createdByVendor) uniqueVendorIds.add(agent.createdByVendor.toString());
                }
                if (booking.assignedFleet) {
                    const fleet = await Fleet.findById(booking.assignedFleet);
                    if (fleet && fleet.createdByModel === "Vendor" && fleet.createdBy) uniqueVendorIds.add(fleet.createdBy.toString());
                }
                // Calculate admin profit from bulk deal (Security Deposit is the Admin's Profit)
                const adminBulkProfit = booking.fleetSecurityPayment?.amount || 0;
                if (adminBulkProfit > 0) {
                    const admin = await Admin.findOne();
                    if (admin) {
                        for (const vendorId of uniqueVendorIds) {
                            const vendor = await Vendor.findById(vendorId);
                            if (vendor) {
                                const commPct = vendor.commissionPercentage !== undefined ? vendor.commissionPercentage : 25;
                            const vendorCut = Math.round(adminBulkProfit * (commPct / 100));
                                if (vendorCut > 0) {
                                    admin.walletBalance -= vendorCut;
                                    await admin.save();
                                    await Transaction.create({
                                        user: admin._id, userModel: 'Admin', amount: vendorCut, type: 'Debit',
                                        category: 'Commission', status: 'Completed', relatedBooking: booking._id,
                                        description: `Master Franchise Bulk Cut to '${vendor.name}'`
                                    });
                                    vendor.walletBalance = (vendor.walletBalance || 0) + vendorCut;
                                    vendor.totalEarnings = (vendor.totalEarnings || 0) + vendorCut;
                                    await vendor.save();
                                    await Transaction.create({
                                        user: vendor._id, userModel: 'Vendor', amount: vendorCut, type: 'Credit',
                                        category: 'Commission', status: 'Completed', relatedBooking: booking._id,
                                        description: `Master Franchise Bulk Commission (Deal #${booking._id.toString().slice(-6)})`
                                    });
                                }
                            }
                        }
                    }
                }
            } catch (err) { console.error("Vendor Bulk Commission Error:", err.message); }
        }

        await booking.save();
        res.json({
            success: true,
            message: isLastDriver ? "Whole booking completed and settled!" : "Your individual trip completed!",
            booking
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// Update verifyBulkPayment to handle 'final'
const originalVerifyBulkPayment = exports.verifyBulkPayment;
exports.verifyBulkPayment = async (req, res) => {
    try {
        const { bookingId, paymentId, type } = req.body;
        if (type !== 'final') {
            return originalVerifyBulkPayment(req, res);
        }

        const booking = await BulkBooking.findById(bookingId).populate("carsRequired.category");
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        const displayPrice = booking.totalPriceWithTax || booking.offeredPrice;
        const remainingBalance = displayPrice - (booking.advancePayment?.amount || 0);

        booking.status = 'Completed';
        if (booking.createdByModel === 'User' && booking.createdBy) {
            await require('../models/User').findByIdAndUpdate(booking.createdBy, { hasUsedFirstRideDiscount: true });
        }
        // Mark any remaining Ongoing assignments as Completed
        if (booking.assignedDrivers && booking.assignedDrivers.length > 0) {
            booking.assignedDrivers.forEach(d => {
                if (d.status === 'Ongoing') {
                    d.status = 'Completed';
                    d.endedAt = new Date();
                }
            });
        }
        booking.finalPayment = {
            amount: remainingBalance,
            method: 'Online',
            isPaid: true,
            at: new Date(),
            hdfcTransactionId: paymentId
        };

        // 💰 NEW: Record Admin Credit for the Final Balance Received
        const admin = await Admin.findOne();
        if (admin) {
            admin.walletBalance += remainingBalance;
            await admin.save();
            await Transaction.create({
                user: admin._id, userModel: 'Admin', amount: remainingBalance,
                type: 'Credit', category: 'Bulk Advance', status: 'Completed',
                relatedBooking: booking._id, description: `Final balance received for Bulk Booking #${booking._id.toString().slice(-6)}`
            });
        }

        // 💰 NEW: Record User Debit (for final payment made)
        if (booking.createdByModel === 'User') {
            await Transaction.create({
                user: booking.createdBy, userModel: 'User', amount: remainingBalance,
                type: 'Debit', category: 'Bulk Advance', status: 'Completed',
                relatedBooking: booking._id, description: `Final balance paid for Bulk Booking #${booking._id.toString().slice(-6)}`
            });
        }

        // Logic for Agent Commission and Fleet Settlement (Same as endIndividualDriverBulkTrip)
        // 1. Agent
        if (booking.createdByModel === 'Agent' && booking.createdBy) {
            try {
                const agent = await Agent.findById(booking.createdBy);
                if (agent) {
                    const commissionPercent = agent.bulkCommissionPercentage || 5;

                    // Calculate from Admin Company Profit instead of total booking price
                    let adminPercentage = 10;
                    const adminDoc = await Admin.findOne({ role: 'SuperAdmin' }) || await Admin.findOne();
                    if (adminDoc) adminPercentage = adminDoc.defaultCommission || 10;
                    if (booking.assignedFleet) {
                        const fleet = await Fleet.findById(booking.assignedFleet);
                        if (fleet && fleet.commissionPercentage !== undefined) adminPercentage = fleet.commissionPercentage;
                    }
                    const totalCompanyProfit = Math.round((booking.offeredPrice || 0) * (adminPercentage / 100));
                    const commissionAmount = Math.round(totalCompanyProfit * (commissionPercent / 100));

                    if (commissionAmount > 0) {
                        agent.walletBalance += commissionAmount;
                        agent.totalEarnings += commissionAmount;
                        await agent.save();

                        booking.agentCommissionAmount = commissionAmount;
                        booking.agentCommissionPaid = true;

                        await Transaction.create({
                            user: agent._id, userModel: 'Agent', amount: commissionAmount,
                            type: 'Credit', category: 'Commission', status: 'Completed',
                            relatedBooking: booking._id, description: `Bulk deal commission (${commissionPercent}% of Company Profit)`
                        });
                    }
                }
            } catch (err) { console.error("Agent Verification Settlement Error:", err.message); }
        }

        // 2. Fleet
        if (booking.assignedFleet) {
            try {
                const fleet = await Fleet.findById(booking.assignedFleet);
                if (fleet) {
                    const totalPayToFleet = (booking.offeredPrice || 0) - (booking.agentCommissionAmount || 0);
                    if (totalPayToFleet > 0) {
                        fleet.walletBalance += totalPayToFleet;
                        await fleet.save();
                        await Transaction.create({
                            user: fleet._id, userModel: 'Fleet', amount: totalPayToFleet,
                            type: 'Credit', category: 'Bulk Earnings', status: 'Completed',
                            relatedBooking: booking._id, description: `Bulk deal earnings (Deal #${booking._id.toString().slice(-6)})`
                        });

                        // 🔴 Debit Admin (Payout to Fleet)
                        const admin = await Admin.findOne();
                        if (admin) {
                            admin.walletBalance -= totalPayToFleet;
                            await admin.save();
                            await Transaction.create({
                                user: admin._id, userModel: 'Admin', amount: totalPayToFleet,
                                type: 'Debit', category: 'Bulk Payout', status: 'Completed',
                                relatedBooking: booking._id, description: `Final Payout to Fleet Owner (Deal #${booking._id.toString().slice(-6)})`
                            });
                        }
                    }
                }
            } catch (err) { console.error("Fleet Verification Settlement Error:", err.message); }
        }

        // 2.5 Category-Wise Settlement for all assigned Drivers
        if (!booking.assignedFleet && booking.assignedDrivers && booking.assignedDrivers.length > 0) {
            try {
                for (const d of booking.assignedDrivers) {
                    if (!d.payoutSettled) {
                        await settleDriverBulkPayout(booking, d);
                    }
                }
            } catch (err) { console.error("Driver Verification Settlement Error:", err.message); }
        }

        // 3. Master Franchise Vendor Settlement (Online Payment)
        try {
            const uniqueVendorIds = new Set();
            if (booking.createdByModel === 'Agent' && booking.createdBy) {
                const agent = await Agent.findById(booking.createdBy);
                if (agent && agent.createdByVendor) uniqueVendorIds.add(agent.createdByVendor.toString());
            }
            if (booking.assignedFleet) {
                const fleet = await Fleet.findById(booking.assignedFleet);
                if (fleet && fleet.createdByModel === "Vendor" && fleet.createdBy) uniqueVendorIds.add(fleet.createdBy.toString());
            }
            
            // Security Deposit is the Admin's Profit in Bulk Bookings
            const adminBulkProfit = booking.fleetSecurityPayment?.amount || 0;
            if (adminBulkProfit > 0) {
                const admin = await Admin.findOne();
                if (admin) {
                    for (const vendorId of uniqueVendorIds) {
                        const vendor = await Vendor.findById(vendorId);
                        if (vendor) {
                            const commPct = vendor.commissionPercentage !== undefined ? vendor.commissionPercentage : 25;
                            const vendorCut = Math.round(adminBulkProfit * (commPct / 100));
                            if (vendorCut > 0) {
                                admin.walletBalance -= vendorCut;
                                await admin.save();
                                await Transaction.create({
                                    user: admin._id, userModel: 'Admin', amount: vendorCut, type: 'Debit',
                                    category: 'Commission', status: 'Completed', relatedBooking: booking._id,
                                    description: `Master Franchise Bulk Cut to '${vendor.name}'`
                                });
                                vendor.walletBalance = (vendor.walletBalance || 0) + vendorCut;
                                vendor.totalEarnings = (vendor.totalEarnings || 0) + vendorCut;
                                await vendor.save();
                                await Transaction.create({
                                    user: vendor._id, userModel: 'Vendor', amount: vendorCut, type: 'Credit',
                                    category: 'Commission', status: 'Completed', relatedBooking: booking._id,
                                    description: `Master Franchise Bulk Commission (Deal #${booking._id.toString().slice(-6)})`
                                });
                            }
                        }
                    }
                }
            }
        } catch (err) { console.error("Vendor Bulk Commission Online Error:", err.message); }

        await booking.save();
        res.json({ success: true, message: "Payment verified and booking completed!", booking });

    } catch (error) {
        console.error("Critical Verification Error:", error.message);
        res.status(500).json({ success: false, message: "Verification error", error: error.message });
    }
};

// 13. Auto-Expire Old Marketplace Bookings
exports.autoExpireBookings = async () => {
    try {
        const now = new Date();
        const result = await BulkBooking.updateMany(
            {
                status: 'Marketplace',
                pickupDateTime: { $lt: now }
            },
            {
                $set: { status: 'Expired' }
            }
        );

        if (result.modifiedCount > 0) {
            console.log(`[Auto-Expire] ${result.modifiedCount} bulk bookings marked as Expired.`);
        }
    } catch (error) {
        console.error("[Auto-Expire Error]", error.message);
    }
};

exports.paymentReturn = async (req, res) => {
    try {
        const payload = req.method === 'POST' ? req.body : req.query;
        console.log("Razorpay Bulk Payment Return Payload:", payload);

        const fallbackUserUrl = process.env.FRONTEND_USER_URL || 'http://localhost:5173';
        const fallbackAgentUrl = process.env.FRONTEND_AGENT_URL || 'http://localhost:5176';

        /* HDFC Code Commented Out:
        if (!payload || !payload.status) {
            return res.redirect((req.query.redirect || `${fallbackUserUrl}/bulk-booking`) + '?error=invalid_payload');
        }

        const isValid = validateHMAC_SHA256(payload, process.env.HDFC_RESPONSE_KEY);
        const isUAT = process.env.HDFC_BASE_URL && process.env.HDFC_BASE_URL.includes('uat');

        if (!isValid) {
            if (isUAT) {
                console.warn("⚠️ [UAT Mode] Invalid Signature detected, but proceeding for simulator testing!");
            } else {
                return res.redirect((req.query.redirect || `${fallbackUserUrl}/bulk-booking`) + '?error=invalid_signature');
            }
        }

        const orderId = payload.order_id;
        const status = payload.status ? payload.status.toUpperCase() : '';
        const statusId = payload.status_id ? String(payload.status_id) : '';

        if (status === 'CHARGED' || status === 'SUCCESS' || status === 'AUTHORIZING' || statusId === '21' || statusId === '28') {
        */

        if (!payload || !payload.razorpay_payment_link_status) {
            return res.redirect((req.query.redirect || `${fallbackUserUrl}/bulk-booking`) + '?error=invalid_payload');
        }

        const isValid = razorpayHandler.validateSignature(
            payload.razorpay_payment_id,
            payload.razorpay_payment_link_id,
            payload.razorpay_payment_link_reference_id,
            payload.razorpay_payment_link_status,
            payload.razorpay_signature
        );

        if (!isValid) {
             return res.redirect((req.query.redirect || `${fallbackUserUrl}/bulk-booking`) + '?error=invalid_signature');
        }

        const orderId = payload.razorpay_payment_link_reference_id;
        const status = payload.razorpay_payment_link_status ? payload.razorpay_payment_link_status.toUpperCase() : '';

        if (status === 'PAID') {
            const isFinal = orderId.startsWith('bulk_final_');
            const isSecurity = orderId.startsWith('bulk_sec_');

            let query = { "advancePayment.hdfcOrderId": orderId };
            if (isFinal) query = { hdfcFinalOrderId: orderId };
            if (isSecurity) query = { "fleetSecurityPayment.hdfcOrderId": orderId };

            const booking = await BulkBooking.findOne(query);

            if (!booking) {
                console.log(`\nBooking NOT FOUND for OrderID: ${orderId}\n`);
            }
            if (booking) {
                const pType = isFinal ? 'final' : (isSecurity ? 'security' : 'advance');
                req.body = { bookingId: booking._id.toString(), paymentId: payload.transaction_id || orderId, type: pType };

                // For final payment, the user is the driver who ended the trip
                // But bulk verify doesn't rely heavily on req.user for 'final' except admin
                // For security, req.user needs to be the fleet who accepted it! But in a webhook, req.user is empty!
                // Wait, if req.user is empty, verifyBulkPayment relies on req.user.id for security payment!
                // Let's set req.user to the assigned fleet if it's security, BUT wait, security payment assigns the fleet!
                let actualPayerId = payload.customer_id;
                let actualRole = booking.createdByModel ? booking.createdByModel.toLowerCase() : 'user';

                if (isSecurity && booking.fleetSecurityPayment) {
                    actualPayerId = booking.fleetSecurityPayment.fleetId;
                    const isFleet = await Fleet.findById(actualPayerId);
                    if (isFleet) {
                        actualRole = 'fleet';
                    } else {
                        const isDriver = await Driver.findById(actualPayerId);
                        if (isDriver) actualRole = 'driver';
                    }
                } else if (!actualPayerId) {
                    actualPayerId = booking.createdBy;
                }

                req.user = { id: actualPayerId, role: actualRole };

                const targetUrl = req.query.redirect || payload.redirect || (booking.createdByModel === 'Agent' ? `${fallbackAgentUrl}/agent/my-bulk-bookings` : `${fallbackUserUrl}/bulk-booking`);
                console.log("[DEBUG] Target URL determined:", targetUrl);

                const originalJson = res.json;
                res.json = function (data) {
                    console.log("[DEBUG] res.json OVERRIDE called with data:", JSON.stringify(data).substring(0, 200));
                    try {
                        if (data.success) {
                            console.log("[DEBUG] Executing res.redirect SUCCESS");
                            return res.redirect(`${targetUrl}?success=true`);
                        } else {
                            console.log("[DEBUG] Executing res.redirect ERROR");
                            return res.redirect(`${targetUrl}?error=${encodeURIComponent(data.message)}`);
                        }
                    } catch (redirectErr) {
                        console.error("[DEBUG] FATAL: res.redirect threw an error!", redirectErr.message);
                        throw redirectErr;
                    }
                };

                console.log("[DEBUG] Calling exports.verifyBulkPayment...");
                return exports.verifyBulkPayment(req, res);
            }
        }
        return res.redirect((req.query.redirect || `${fallbackUserUrl}/bulk-booking`) + '?error=payment_failed');
    } catch (error) {
        console.error("Payment Return Error:", error.message);
        res.redirect(`${process.env.FRONTEND_AGENT_URL || 'http://localhost:5176'}?error=payment_processing_failed`);
    }
};

// 15. Admin Only: Get All Bulk Bookings History
exports.getAllBulkBookingsForAdmin = async (req, res) => {
    try {
        const bookings = await BulkBooking.find({})
            .populate("carsRequired.category", "name image bulkBookingBasePrice")
            .populate("createdBy", "name phone email image")
            .populate("assignedFleet", "companyName ownerName phone email")
            .populate("assignedAdmin", "name email phone role")
            .populate("assignedDrivers.driver", "name phone email carDetails image")
            .populate("assignedDrivers.car", "carNumber carModel")
            .populate("assignedDrivers.category", "name image bulkBookingBasePrice")
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: bookings.length,
            bookings: bookings
        });
    } catch (error) {
        console.error("Error fetching all bulk bookings:", error.message);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// ==========================================
// Download Bulk Booking Receipt
// ==========================================
exports.downloadReceipt = async (req, res) => {
    try {
        const { bookingId } = req.params;

        // Ensure user is authorized to access (assuming auth middleware populates req.user)
        // We'll skip complex role checks here for simplicity, but auth middleware is assumed on the route
        
        const booking = await BulkBooking.findById(bookingId).populate('assignedFleet').populate('createdBy').populate('carsRequired.category');
        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        // Set Headers for PDF Download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="receipt-${bookingId}.pdf"`);

        // Generate and pipe PDF
        await generateBulkBookingReceipt(booking, res);
        
    } catch (error) {
        console.error("Error generating receipt:", error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: "Error generating receipt" });
        }
    }
};

// ==========================================
// Download Driver Payout Receipt
// ==========================================
exports.downloadDriverReceipt = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const driverId = req.user.id; // From auth middleware

        const booking = await BulkBooking.findById(bookingId).populate('assignedDrivers.driver');
        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        // Set Headers for PDF Download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="driver-payout-${bookingId}.pdf"`);

        // Generate and pipe PDF
        await generateDriverBulkPayoutReceipt(booking, driverId, res);
        
    } catch (error) {
        console.error("Error generating driver receipt:", error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: "Error generating driver receipt" });
        }
    }
};

exports.downloadSecurityReceipt = async (req, res) => {
    try {
        const { bookingId } = req.params;
        
        const booking = await BulkBooking.findById(bookingId).populate('assignedFleet').populate('createdBy').populate('carsRequired.category');
        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        const fileName = `KwikCabs_Security_${booking._id.toString().slice(-6).toUpperCase()}.pdf`;
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        const pdfGenerator = require('../utils/pdfGenerator');
        await pdfGenerator.generateSecurityReceipt(booking, res);
        
    } catch (error) {
        console.error("Error generating security receipt:", error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: "Error generating security receipt" });
        }
    }
};

// 16. Check Area Surcharge
exports.checkAreaSurcharge = async (req, res) => {
    try {
        const { latitude, longitude } = req.body;
        if (!latitude || !longitude) return res.json({ multiplier: 1 });
        const { getAreaSpecificRates } = require("./bookingController");
        const areaRates = await getAreaSpecificRates(latitude, longitude, 1, 1, 1);
        res.json({ multiplier: areaRates.bulkRateMultiplier || 1 });
    } catch (error) {
        console.error("Error checking area surcharge:", error.message);
        res.json({ multiplier: 1 });
    }
};
