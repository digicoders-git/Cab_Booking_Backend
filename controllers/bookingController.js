const Booking = require("../models/Booking");
const CarCategory = require("../models/CarCategory");
const User = require("../models/User");
const RideRequest = require("../models/RideRequest");
const tripController = require("./tripController");
const Driver = require("../models/Driver");
const { getIO } = require("../socket/socket");
const AreaPricing = require("../models/AreaPricing");
const serviceAreaController = require("./serviceAreaController");
const { sendPushNotification } = require("../utils/fcmNotification");
const Agent = require("../models/Agent");
const Offer = require("../models/Offer");
const stateTaxController = require("./stateTaxController");
const Transaction = require("../models/Transaction");
// Helper: Calculate Area-specific pricing overrides (GEO-SPATIAL VERSION)
const getAreaSpecificRates = async (pickupLat, pickupLng, defaultBase, defaultPrivateRate, defaultSharedRate) => {
    try {
        if (!pickupLat || !pickupLng) return { baseFare: defaultBase, privateRate: defaultPrivateRate, sharedRate: defaultSharedRate, bulkRateMultiplier: 1, isSpecial: false };

        // 🚀 SMART GEO SEARCH: Find zones near the rider (Max 50KM buffer)
        const now = new Date();
        const activeAreas = await AreaPricing.find({
            isActive: true,
            $or: [
                { validFrom: { $exists: false } },
                { validFrom: null },
                { validFrom: { $lte: now } }
            ],
            $or: [
                { validUntil: { $exists: false } },
                { validUntil: null },
                { validUntil: { $gte: now } }
            ],
            location: {
                $nearSphere: {
                    $geometry: {
                        type: "Point",
                        coordinates: [parseFloat(pickupLng), parseFloat(pickupLat)]
                    },
                    $maxDistance: 50000 // 50 KM Search Radius
                }
            }
        }).sort({ priority: -1 }); // Priority is still King for overlapping zones

        for (const area of activeAreas) {
            // --- NEW: Recurring Schedule Check ---
            const currentDayStr = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][now.getDay()];
            
            if (area.daysOfWeek && area.daysOfWeek.length > 0) {
                if (!area.daysOfWeek.includes(currentDayStr)) {
                    continue; // Skip this area rule because today is not a peak day
                }
            }

            if (area.startTime && area.endTime) {
                const currentHourMin = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
                if (currentHourMin < area.startTime || currentHourMin > area.endTime) {
                    continue; // Skip because current time is outside the peak hours
                }
            }

            // Calculate actual distance again to verify against custom Radius
            const distanceToCenter = getDistanceFromLatLonInKm(
                pickupLat, pickupLng, 
                area.centerLat, area.centerLng
            );

            // 🎯 CHECK IF USER IS INSIDE THE RADIUS (e.g., within 5KM of Charbagh)
            if (distanceToCenter <= (area.radiusKm || 5)) {
                console.log(`✨ [GEO-PRICING] Match Found! Zone: ${area.areaName} (${distanceToCenter.toFixed(2)} KM away)`);
                
                return { 
                    baseFare: defaultBase * (area.baseFareMultiplier || 1), 
                    privateRate: defaultPrivateRate * (area.privateRateMultiplier || 1), 
                    sharedRate: defaultSharedRate * (area.sharedRateMultiplier || 1),
                    bulkRateMultiplier: (area.bulkRateMultiplier || 1),
                    isSpecial: true, 
                    areaName: area.areaName 
                };
            }
        }
    } catch (error) {
        console.error("Geo Pricing Lookup Error:", error.message);
    }
    return { baseFare: defaultBase, privateRate: defaultPrivateRate, sharedRate: defaultSharedRate, bulkRateMultiplier: 1, isSpecial: false };
};

// Haversine helper to calculate distance between coordinates
function deg2rad(deg) { return deg * (Math.PI / 180); }

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
    const R = 6371; // Earth radius in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// 1. Estimate Fare
exports.estimateFare = async (req, res) => {
    try {
        const { carCategoryId, distanceKm, rideType, seatsBooked, pickupLat, pickupLng } = req.body;
        
        // --- NEW: Service Availability Enforcement (GPS VERSION) ---
        const serviceZone = await serviceAreaController.checkServiceAvailability(pickupLat, pickupLng);
        
        if (!serviceZone) {
            return res.status(400).json({
                success: false,
                message: "No rides available at your location right now. Try again later or check nearby areas."
            });
        }

        const category = await CarCategory.findById(carCategoryId);
        if (!category) {
            return res.status(404).json({ success: false, message: "Car Category not found" });
        }
        
        // Prevent booking if category is disabled in this zone
        if (serviceZone.disabledCategories && serviceZone.disabledCategories.some(id => id.toString() === carCategoryId.toString())) {
            return res.status(400).json({ success: false, message: "This car category is not available in your area." });
        }

        // --- NEW: Area Wise Pricing Logic ---
        // 🚀 GEO-SPATIAL PRICING: Match by coordinates
        const rates = await getAreaSpecificRates(
            pickupLat, 
            pickupLng,
            category.baseFare, 
            category.privateRatePerKm, 
            category.sharedRatePerSeatPerKm
        );
        
        let estimatedFare = 0;
        const normalizedRideType = rideType.toLowerCase();

        // Base concept: Private vs Shared Pricing using Dynamic Rates
        if (normalizedRideType === "private") {
            estimatedFare = rates.baseFare + (rates.privateRate * distanceKm);
        } else if (normalizedRideType === "shared") {
            const seats = seatsBooked || 1; 
            if (seats > category.seatCapacity) {
                return res.status(400).json({
                    success: false,
                    message: `Requested seats (${seats}) exceed car capacity (${category.seatCapacity})`
                });
            }
            estimatedFare = rates.baseFare + (rates.sharedRate * distanceKm * seats);
        } else {
            return res.status(400).json({ success: false, message: "Invalid Ride Type" });
        }

        res.json({
            success: true,
            distanceKm,
            rideType,
            isSpecialArea: rates.isSpecial,
            areaDetected: rates.areaName || "Default",
            seatsBooked: rideType === "Private" ? category.seatCapacity : (seatsBooked || 1),
            estimatedFare: Math.round(estimatedFare) 
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 1b. Search Cabs (Google-Ready Flow: Maps Data -> Fare Options)
exports.getAllFareEstimates = async (req, res) => {
    try {
        const {
            distanceKm,
            rideType,
            seatsBooked,
            pickupAddress,
            pickupPin, // 🚀 READ PIN
            dropAddress,
            pickupLat,
            pickupLng,
            dropLat,
            dropLng
        } = req.body;

        if (!distanceKm) {
            return res.status(400).json({ success: false, message: "Distance from Google Maps is required" });
        }

        // --- NEW: Service Availability Enforcement (GPS VERSION) ---
        console.log("--------------------------------------------------");
        console.log(`🚀 [BOOKING API] Search request GPS: ${pickupLat}, ${pickupLng}`);

        const serviceZone = await serviceAreaController.checkServiceAvailability(pickupLat, pickupLng);
        
        if (!serviceZone) {
            console.log("🚫 [BOOKING API] GPS outside service area.");
            return res.status(400).json({
                success: false,
                message: "No rides available at your location right now. Try again later or check nearby areas."
            });
        }
        console.log("✅ [BOOKING API] Service Allowed. Proceeding to fare estimates...");

        const disabledCats = serviceZone.disabledCategories || [];
        const categories = await CarCategory.find({ 
            isActive: true,
            _id: { $nin: disabledCats }
        });
        const seats = seatsBooked || 1;

        // Fetch all currently active, online drivers to calculate real ETA
        const availableDrivers = await Driver.find({
            isOnline: true,
            isActive: true,
            isAvailable: true,
            isApproved: true
        }).select("currentLocation carDetails.carType");

        // Normalize rideType to handle lowercase/uppercase (shaired, SHARED, etc.)
        const normalizedRideType = rideType ? rideType.toLowerCase() : null;

        const options = await Promise.all(categories.map(async (category) => {
            // 🚀 GEO-SPATIAL PRICING: Match by coordinates
            const areaRates = await getAreaSpecificRates(
                pickupLat, 
                pickupLng,
                category.baseFare, 
                category.privateRatePerKm, 
                category.sharedRatePerSeatPerKm
            );

            let base = areaRates.baseFare;
            let privateRate = areaRates.privateRate;
            let sharedRate = areaRates.sharedRate;

            let privateFare = base + (privateRate * distanceKm);
            let sharedFare = base + (sharedRate * distanceKm * seats);

            // --- NEW: Auto-Calculate State Tax ---
            const taxResult = await stateTaxController.calculateTaxesInternal({
                pickupAddress, 
                dropAddress, 
                carCategoryId: category._id, 
                tripType: "OneWay" // Default for cab search
            });

            if (taxResult && taxResult.totalTax > 0) {
                privateFare += taxResult.totalTax;
                sharedFare += taxResult.totalTax;
            }

            // --- Apply 5% Exclusive GST (2.5% CGST + 2.5% SGST) ---
            privateFare = privateFare * 1.05;
            sharedFare = sharedFare * 1.05;

            // --- REAL ETA CALCULATION LOGIC ---
            let arrivalMins = 0;
            let minDriverDist = Infinity;

            // Find drivers specifically driving this Category of car
            const categoryDrivers = availableDrivers.filter(d =>
                d.carDetails && d.carDetails.carType && d.carDetails.carType.toString() === category._id.toString()
            );

            // Find the absolute nearest driver's distance to the pickup location
            // And collect drivers with their distances for the map display
            let driversWithDistance = [];
            if (categoryDrivers.length > 0 && pickupLat && pickupLng) {
                categoryDrivers.forEach(driver => {
                    if (driver.currentLocation && driver.currentLocation.latitude && driver.currentLocation.longitude) {
                        const distToPickup = getDistanceFromLatLonInKm(
                            pickupLat, pickupLng,
                            driver.currentLocation.latitude, driver.currentLocation.longitude
                        );
                        if (distToPickup < minDriverDist) {
                            minDriverDist = distToPickup;
                        }
                        
                        // Add to our list for the map if within 10km radius
                        if (distToPickup <= 10) {
                            driversWithDistance.push({ driver, distToPickup });
                        }
                    }
                });
            }
            
            // Sort nearby drivers from nearest to farthest
            driversWithDistance.sort((a, b) => a.distToPickup - b.distToPickup);

            // Calculate time based on nearest driver distance (assume driver approaches at an avg city speed of 20 km/h)
            if (minDriverDist !== Infinity) {
                const approachingSpeedKmH = 20;
                arrivalMins = Math.round((minDriverDist / approachingSpeedKmH) * 60);
                if (arrivalMins < 1) arrivalMins = 1; // Minimum 1 min
            } else {
                // Fallback: No drivers available in this category right now
                // We show a higher default value indicating scarcity, e.g. 15-20 mins
                arrivalMins = Math.floor(Math.random() * (20 - 15 + 1)) + 15;
            }
            // --- END REAL ETA LOGIC ---

            const speed = category.avgSpeedKmH || 25;
            const travelTimeMins = Math.round((distanceKm / speed) * 60);

            const now = new Date();
            const dropTime = new Date(now.getTime() + (arrivalMins + travelTimeMins) * 60000);
            const dropTimeStr = dropTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            let cabOption = {
                _id: category._id, // Add this for frontend compatibility
                carCategoryId: category._id,
                name: category.name,
                image: category.image,
                seatCapacity: category.seatCapacity,
                arrivalMins: `${arrivalMins} mins away`,
                dropTime: `Drop ${dropTimeStr}`,
                description: category.name === "Auto" ? "Hassle-free Auto rides" : `Affordable ${category.name} rides`,
                tag: category.name === "Bike" ? "FASTEST" : (category.name === "Premium" ? "PREMIUM" : null),
                // NEW: Added nearby drivers locations for Map display (Filtered within 10km radius & Sorted)
                nearbyDrivers: driversWithDistance.map(d => ({
                    id: d.driver._id,
                    latitude: d.driver.currentLocation.latitude,
                    longitude: d.driver.currentLocation.longitude
                })).slice(0, 10), // Limit to 10 nearest drivers for map performance
                taxBreakdown: taxResult.taxBreakdown || [] // Added tax breakdown
            };

            // Only show the specific fare user asked for
            if (normalizedRideType === "private") {
                cabOption.fare = Math.round(privateFare);
                cabOption.rideType = "Private";
                cabOption.seatLayout = null;
            } else if (normalizedRideType === "shared") {
                cabOption.fare = Math.round(sharedFare);
                cabOption.rideType = "Shared";
                cabOption.seatLayout = category.seatLayout;
            } else {
                // If no specific choice, show both
                cabOption.privateFare = Math.round(privateFare);
                cabOption.sharedFare = Math.round(sharedFare);
                cabOption.rideType = "Both";
                cabOption.seatLayout = category.seatLayout;
            }

            return cabOption;
        }));

        res.json({
            success: true,
            mapsInfo: {
                pickup: pickupAddress || "Coordinates Provided",
                drop: dropAddress || "Coordinates Provided",
                distanceKm,
                coordinates: {
                    from: { lat: pickupLat, lng: pickupLng },
                    to: { lat: dropLat, lng: dropLng }
                }
            },
            selectedRideType: rideType || "Both Options Available",
            isSpecialArea: options.some(opt => opt.isSpecial),
            areaDetected: options.find(opt => opt.isSpecial)?.appliedArea || "Default",
            options
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 2. Create Booking (User/Agent)
exports.createBooking = async (req, res) => {
    try {
        const {
            passengerName, passengerPhone,
            rideType, carCategoryId, seatsBooked,
            pickupAddress, pickupLat, pickupLng,
            dropAddress, dropLat, dropLng,
            distanceKm, pickupDate, pickupTime,
            selectedSeats, // NEW: If coming from shared flow
            stops, // NEW: Multiple stoppages
            offerCode, // NEW: Promo code
            estimatedTimeMin // NEW: Traffic time logic
        } = req.body;

        // Validate basic inputs (Simplified for example)
        if (!passengerName || !pickupAddress || !dropAddress || !carCategoryId) {
            return res.status(400).json({ success: false, message: "Required fields missing" });
        }

        // --- NEW: Multi-Stop Shared Ride Backend Validation ---
        if (rideType && rideType.toLowerCase() === "shared" && stops && stops.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: "Stops are not allowed for Shared Rides. Please book a Private Ride for multiple destinations." 
            });
        }

        // --- NEW: Service Availability Enforcement (GPS VERSION) ---
        console.log("-----------------------------------------");
        console.log(`📝 [BOOKING API] Booking GPS Check: ${pickupLat}, ${pickupLng}`);

        const serviceZone = await serviceAreaController.checkServiceAvailability(pickupLat, pickupLng);
        
        if (!serviceZone) {
            console.log("🚫 [BOOKING API] GPS Denied.");
            return res.status(400).json({
                success: false,
                message: "No rides available at your location right now. Try again later or check nearby areas."
            });
        }
        console.log("✅ [BOOKING API] Booking Creation Authorized.");

        // Rate Card Lookup
        const category = await CarCategory.findById(carCategoryId);
        if (!category) {
            return res.status(404).json({ success: false, message: "Car Category not found" });
        }
        
        // Prevent booking if category is disabled in this zone
        if (serviceZone.disabledCategories && serviceZone.disabledCategories.some(id => id.toString() === carCategoryId.toString())) {
            return res.status(400).json({ success: false, message: "This car category is not available in your area." });
        }

        // --- NEW: Area Wise Pricing Logic (GEO-SPATIAL) ---
        const areaRates = await getAreaSpecificRates(
            pickupLat, 
            pickupLng,
            category.baseFare, 
            category.privateRatePerKm, 
            category.sharedRatePerSeatPerKm
        );

        const normalizedRideType = rideType ? rideType.toLowerCase() : "";
        
        // Traffic Surcharge / Free Time Logic
        let calculatedTimeMin = estimatedTimeMin;
        if (!calculatedTimeMin) {
            // Fallback if frontend didn't pass it: distance / speed * 60
            calculatedTimeMin = Math.ceil((distanceKm / category.avgSpeedKmH) * 60);
        }

        // Calculate Fare Internally to prevent tampering from Client side
        let fareEstimate = areaRates.baseFare;
        let finalSeats = 1;

        if (normalizedRideType === "private") {
            fareEstimate += (areaRates.privateRate * distanceKm);
            finalSeats = category.seatCapacity; // Booking whole car
        } else if (normalizedRideType === "shared") {
            finalSeats = seatsBooked || 1;
            fareEstimate += (areaRates.sharedRate * distanceKm * finalSeats);
        }

        // --- NEW: Auto-Calculate State Tax ---
        const taxResult = await stateTaxController.calculateTaxesInternal({
            pickupAddress, 
            dropAddress, 
            carCategoryId, 
            tripType: "OneWay" // Default
        });

        if (taxResult && taxResult.totalTax > 0) {
            fareEstimate += taxResult.totalTax;
        }

        // --- Apply 5% Exclusive GST (2.5% CGST + 2.5% SGST) ---
        fareEstimate = fareEstimate * 1.05;

        fareEstimate = Math.round(fareEstimate);

        // --- NEW: Offer/Promo Code Logic ---
        let discountAmount = 0;
        let appliedOfferId = null;

        if (offerCode) {
            const offer = await Offer.findOne({ code: offerCode.toUpperCase(), isActive: true });
            if (offer && new Date() <= new Date(offer.validTill) && offer.bookingType === "Normal") {
                if (req.user && req.user.role === "agent") {
                    return res.status(403).json({ success: false, message: "You cannot access/use this coupon. Only users can use offers." });
                }
                if (offer.discountType === "PERCENTAGE") {
                    let calculatedDiscount = (fareEstimate * offer.discountAmount) / 100;
                    if (offer.maxDiscountAmount && calculatedDiscount > offer.maxDiscountAmount) {
                        calculatedDiscount = offer.maxDiscountAmount;
                    }
                    discountAmount = Math.round(calculatedDiscount);
                } else {
                    discountAmount = offer.discountAmount;
                }
                appliedOfferId = offer._id;
            } else {
                return res.status(400).json({ success: false, message: "Invalid, expired, or inapplicable offer code." });
            }
        }

        if (discountAmount > 0) {
            fareEstimate = Math.max(0, fareEstimate - discountAmount); // Ensure it doesn't go below 0
        }

        // Security code for trip start (OTP)
        const startOtp = Math.floor(1000 + Math.random() * 9000).toString(); // e.g. "4592"

        // Create Booking Data
        const bookingData = {
            passengerDetails: { name: passengerName, phone: passengerPhone },
            rideType,
            carCategory: carCategoryId,
            seatsBooked: finalSeats,
            pickup: { address: pickupAddress, latitude: pickupLat, longitude: pickupLng },
            drop: { address: dropAddress, latitude: dropLat, longitude: dropLng },
            estimatedDistanceKm: distanceKm,
            estimatedTimeMin: calculatedTimeMin, // NEW: Traffic logic
            pickupDate: pickupDate || new Date(),
            pickupTime: pickupTime || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            selectedSeats: selectedSeats || [], // Track chosen spots
            stops: stops || [], // NEW: Multi-stop support
            fareEstimate,
            appliedOffer: appliedOfferId,
            discountAmount: discountAmount,
            tripData: { startOtp }
        };

        // If User is making the booking
        if (req.user && req.user.role === "user") {
            bookingData.user = req.user.id;
            
            // --- NEW: CARRY FORWARD PREVIOUS DUES ---
            try {
                const userDoc = await User.findById(req.user.id);
                if (userDoc && userDoc.walletBalance < 0) {
                    const dues = Math.abs(userDoc.walletBalance);
                    bookingData.previousDues = dues;
                    bookingData.fareEstimate += dues; // Add to current bill
                    fareEstimate += dues; // Update the local variable for response
                }
            } catch (err) {
                console.error("Error fetching user wallet for dues:", err.message);
            }
            // ----------------------------------------
        }

        // If Agent is making the booking (Calculate their commission!)
        if (req.user && req.user.role === "agent") {
            bookingData.agent = req.user.id;

            // Fetch real commission from Agent's DB record
            let commissionPercent = 5; // Default fallback
            try {
                const agentData = await Agent.findById(req.user.id);
                if (agentData && agentData.commissionPercentage !== undefined) {
                    commissionPercent = agentData.commissionPercentage;
                }
            } catch (err) {
                console.error("Error fetching agent for commission calculation:", err.message);
            }

            const commission = Math.round(fareEstimate * (commissionPercent / 100));
            bookingData.agentCommission = commission;
        }

        const newBooking = await Booking.create(bookingData);

        // --- SEQUENTIAL MATCHING LOGIC (The Waterfall) ---
        const matchInterval = 16000; // 16 seconds (1s buffer for frontend timer sync)
        const maxTime = 240000;      // 4 minutes total wait time 
        let timeElapsed = 0;

        const attemptMatching = async () => {
            try {
                // 1. Check current status: Booking abhi bhi pending hai?
                const checkBooking = await Booking.findById(newBooking._id);
                if (!checkBooking || checkBooking.bookingStatus !== "Pending") return;

                if (timeElapsed >= maxTime) {
                    // 2. 2 Minute over! Expire the booking
                    checkBooking.bookingStatus = "Expired";
                    checkBooking.cancelReason = "No driver nearby accepted the request";
                    await checkBooking.save();

                    // 📢 Emit Socket Event for Expiration
                    try {
                        const io = getIO();
                        if (checkBooking.user) {
                            io.to(checkBooking.user.toString()).emit("booking_update", {
                                bookingId: checkBooking._id,
                                status: "Expired",
                                message: "No driver accepted the request within the time limit."
                            });

                            // 🚀 FCM Push to Rider about Expiration
                            const rider = await User.findById(checkBooking.user);
                            if (rider && rider.fcmToken) {
                                await sendPushNotification(rider.fcmToken, {
                                    title: "⚠️ No Driver Found",
                                    body: "Sorry, we couldn't find a driver for your request. Please try again.",
                                    data: { type: "RIDE_EXPIRED", bookingId: checkBooking._id.toString() }
                                });
                            }
                        }
                        if (checkBooking.agent) {
                            io.to(`agent_${checkBooking.agent.toString()}`).emit("booking_update", {
                                bookingId: checkBooking._id,
                                status: "Expired",
                                message: "No driver accepted the request within the time limit."
                            });
                        }

                        // 🚀 FCM Push to all currently notified drivers about Expiration
                        const pendingReqsForFCM = await RideRequest.find({ booking: checkBooking._id, status: "Pending" }).populate('driver');
                        for (let r of pendingReqsForFCM) {
                            if (r.driver && r.driver.fcmToken) {
                                await sendPushNotification(r.driver.fcmToken, {
                                    title: "⚠️ Request Expired",
                                    body: "A ride request you were viewing has expired.",
                                    data: { type: "RIDE_EXPIRED", bookingId: checkBooking._id.toString() }
                                });
                            }
                        }
                    } catch (err) {
                        console.error("Socket/FCM Error on Expire:", err.message);
                    }

                    console.log(`Booking ${newBooking._id} expired after 4 mins matching attempts.`);
                    return;
                }

                // 3. Purani pending requests ko timeout kar do (Water-fall effect) - Emit Socket Event before updating
                const pendingRequestsToTimeout = await RideRequest.find({ booking: newBooking._id, status: "Pending" });
                const io = getIO();
                pendingRequestsToTimeout.forEach(r => {
                    io.to(r.driver.toString()).emit("ride_request_timeout", {
                        requestId: r._id,
                        bookingId: newBooking._id
                    });
                });
                await RideRequest.updateMany({ booking: newBooking._id, status: "Pending" }, { status: "Timeout" });

                // 4. Agle nearest driver ko dhundho
                const matchResult = await tripController.autoMatchDriver(newBooking._id);

                if (matchResult.success) {
                    console.log(`[Waterfall] Request sent to Next Driver: ${matchResult.driverDetails.name}`);
                } else {
                    console.log(`[Waterfall] No more drivers found for now. Retrying in ${matchInterval/1000}s...`);
                }

                // 5. Agle attempt ke liye timer set karein (Recursive)
                timeElapsed += matchInterval;
                setTimeout(attemptMatching, matchInterval);

            } catch (err) {
                console.error("Error in matching loop:", err.message);
            }
        };

        // Pehla attempt turant shuru karein (Case-Insensitive check)
        const isMatchedType = normalizedRideType === "private" || (normalizedRideType === "shared" && selectedSeats && selectedSeats.length > 0);
        
        console.log(`📡 [BOOKING ENGINE] Attempting to start matching. RideType: ${normalizedRideType}, Matches: ${isMatchedType}`);

        if (isMatchedType) {
            console.log("🚀 [BOOKING ENGINE] Waterfall matching started successfully!");
            attemptMatching();
        } else {
            console.warn("⚠️ [BOOKING ENGINE] Matching NOT started. Check rideType or selectedSeats.");
        }

        res.status(201).json({
            success: true,
            message: "Booking created. We are connecting you to the nearest drivers one by one.",
            bookingId: newBooking._id,
            fareEstimate,
            startOtp
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 3. Get User/Agent Bookings (For "My Bookings" page)
exports.getMyBookings = async (req, res) => {
    try {
        let filter = {};

        if (req.user.role === "user") {
            filter.user = req.user.id;
        } else if (req.user.role === "agent") {
            filter.agent = req.user.id;
        } else {
            return res.status(403).json({ success: false, message: "Not authorized for this operation" });
        }

        const bookings = await Booking.find(filter)
            .populate("carCategory", "name image freeWaitingMin waitingChargePerMin")
            .populate("assignedDriver", "_id name phone image carDetails")
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: bookings.length,
            bookings
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 3b. Admin: Get All Bookings in System
exports.getAllBookings = async (req, res) => {
    try {
        const bookings = await Booking.find()
            .populate("carCategory", "name image")
            .populate("assignedDriver", "_id name phone image carDetails")
            .populate("user", "name phone image")
            .populate("agent", "name phone image")
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: bookings.length,
            bookings
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 4. Cancel Booking
exports.cancelBooking = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { reason } = req.body;

        const booking = await Booking.findById(bookingId);

        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        // Only allow cancellation if it hasn't started
        if (["Ongoing", "Completed", "Cancelled"].includes(booking.bookingStatus)) {
            return res.status(400).json({
                success: false,
                message: `Cannot cancel a booking that is currently ${booking.bookingStatus}`
            });
        }

        booking.bookingStatus = "Cancelled";
        booking.cancelReason = reason || "No reason provided";
        booking.cancelledBy = req.user.role === "user" ? "User" : (req.user.role === "agent" ? "Agent" : "Admin");

        // --- NEW: LATE CANCELLATION PENALTY LOGIC ---
        if (booking.tripData && booking.tripData.arrivedAt && booking.cancelledBy === "User") {
            try {
                const penaltyAmount = 50; // Fixed penalty
                const userDoc = await User.findById(booking.user);
                
                if (userDoc) {
                    // Deduct from User Wallet
                    userDoc.walletBalance = (userDoc.walletBalance || 0) - penaltyAmount;
                    await userDoc.save();
                    
                    // Log Transaction for User
                    await Transaction.create({
                        user: userDoc._id,
                        userModel: "User",
                        amount: penaltyAmount,
                        type: "Debit",
                        category: "Wallet Recharge", // Or "Adjustment" depending on allowed enums, using Wallet Recharge temporarily if Adjustment fails enum check, actually let's use Admin Adjustment if that's an enum, wait Transaction category enum check! Let's check Transaction model.
                        // I will assume "Trip" or "Fine" is allowed. For now I will omit category if it has default or use a generic one. Wait, in walletController they use "Admin Adjustment". I will use "Admin Adjustment" for safety.
                        category: "Admin Adjustment",
                        status: "Completed",
                        description: "Late Cancellation Penalty"
                    });

                    // Add to Driver Wallet
                    if (booking.assignedDriver) {
                        const driverDoc = await Driver.findById(booking.assignedDriver);
                        if (driverDoc) {
                            driverDoc.walletBalance = (driverDoc.walletBalance || 0) + penaltyAmount;
                            driverDoc.totalEarnings = (driverDoc.totalEarnings || 0) + penaltyAmount;
                            await driverDoc.save();

                            // Log Transaction for Driver
                            await Transaction.create({
                                user: driverDoc._id,
                                userModel: "Driver",
                                amount: penaltyAmount,
                                type: "Credit",
                                category: "Admin Adjustment",
                                status: "Completed",
                                description: "Cancellation Compensation"
                            });
                            
                            // Deduct from Admin Wallet (Since Admin is paying the driver now, and will recover later from User)
                            const Admin = require("../models/Admin");
                            const adminDoc = await Admin.findOne();
                            if (adminDoc) {
                                adminDoc.walletBalance = (adminDoc.walletBalance || 0) - penaltyAmount;
                                await adminDoc.save();
                                await Transaction.create({
                                    user: adminDoc._id,
                                    userModel: "Admin",
                                    amount: penaltyAmount,
                                    type: "Debit",
                                    category: "Admin Adjustment",
                                    status: "Completed",
                                    description: `Cancellation Compensation paid to Driver ${driverDoc.name}`
                                });
                            }
                        }
                    }
                    console.log(`Penalty of ₹${penaltyAmount} applied to User ${userDoc._id} and credited to Driver ${booking.assignedDriver}`);
                }
            } catch (penaltyError) {
                console.error("Error applying cancellation penalty:", penaltyError.message);
            }
        }
        // --------------------------------------------

        await booking.save();

        // 🟢 FIX: Reset Driver Availability
        if (booking.assignedDriver) {
            try {
                const driver = await Driver.findById(booking.assignedDriver);
                if (driver) {
                    // Give seats back if it was shared?
                    // For now, if single ride, car is free.
                    // 🔄 FULL RESET (So driver is visible for new bookings!)
                    driver.isAvailable = true;
                    driver.currentRideType = null;
                    driver.availableSeats = 0;
                    driver.currentHeading = null;

                    // Reset shared seats if any
                    if (driver.seatMap && driver.seatMap.length > 0) {
                        driver.seatMap.forEach(s => {
                            if (s.bookingId && s.bookingId.toString() === booking._id.toString()) {
                                s.isBooked = false;
                                s.bookingId = null;
                            }
                        });
                    }

                    await driver.save();
                    console.log(`Driver ${driver._id} is now FULLY RESET after cancellation ✅`);

                    // 🎯 Live Notification to Admin & Driver
                    const io = getIO();

                    // Admin Update
                    io.to('admin_room').emit("driver_location_update", {
                        driverId: driver._id.toString(),
                        status: "Idle",
                        latitude: driver.currentLocation?.latitude,
                        longitude: driver.currentLocation?.longitude
                    });

                    // Driver Notification
                    io.to(driver._id.toString()).emit("booking_update", {
                        bookingId: booking._id,
                        status: "Cancelled",
                        message: `Trip cancelled by ${booking.cancelledBy}`
                    });

                    // 🚀 FCM Push Notification to Driver for Cancellation
                    if (driver.fcmToken) {
                        await sendPushNotification(driver.fcmToken, {
                            title: "🚨 Ride Cancelled",
                            body: `Trip ${booking._id.toString().slice(-6)} has been cancelled by the rider.`,
                            data: {
                                type: "RIDE_CANCELLED",
                                bookingId: booking._id.toString()
                            }
                        });
                        console.log(`FCM Cancel Push sent to Driver ${driver.name} ✅`);
                    }

                    console.log(`Admin & Driver notified via Socket about cancellation.`);
                }
            } catch (err) {
                console.error("Driver Reset/Notify Error on Cancel:", err.message);
            }
        }

        // Live Notification to Agent/User (if someone else cancelled)
        try {
            const io = getIO();
            if (booking.agent) {
                io.to(`agent_${booking.agent.toString()}`).emit("booking_update", {
                    bookingId: booking._id,
                    status: "Cancelled"
                });
            }
            if (booking.user) {
                io.to(booking.user.toString()).emit("booking_update", {
                    bookingId: booking._id,
                    status: "Cancelled"
                });
            }
        } catch (err) { }

        res.json({
            success: true,
            message: "Booking cancelled successfully",
            booking
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 5. Get Single Booking Details
exports.getSingleBooking = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const booking = await Booking.findById(bookingId)
            .populate("carCategory", "name image freeWaitingMin waitingChargePerMin")
            .populate("assignedDriver", "_id name phone image carDetails")
            .populate("user", "name phone image")
            .populate("agent", "name phone image");

        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        res.json({
            success: true,
            booking
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 6. Delete Booking (Admin Only)
exports.deleteBooking = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const booking = await Booking.findById(bookingId);

        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        // Optional: Integrity check. Maybe don't allow deleting ongoing trips?
        if (booking.bookingStatus === "Ongoing") {
            return res.status(400).json({
                success: false,
                message: "Cannot delete an ongoing booking. Please cancel it first."
            });
        }

        await Booking.findByIdAndDelete(bookingId);

        res.json({
            success: true,
            message: "Booking record deleted successfully"
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 7. Rate Driver (by User/Agent)
exports.rateDriver = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { rating, review } = req.body;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, message: "Valid rating (1-5) is required" });
        }

        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        if (booking.bookingStatus !== "Completed") {
            return res.status(400).json({ success: false, message: "Can only rate completed rides" });
        }

        if (booking.driverRating) {
            return res.status(400).json({ success: false, message: "Driver already rated for this trip" });
        }

        booking.driverRating = rating;
        booking.driverReview = review || null;
        await booking.save();

        if (booking.assignedDriver) {
            const Driver = require("../models/Driver");
            const driver = await Driver.findById(booking.assignedDriver);
            if (driver) {
                const currentTotal = driver.totalRatings || 0;
                const currentRating = driver.rating || 0;
                const newTotal = currentTotal + 1;
                const newAvg = ((currentRating * currentTotal) + rating) / newTotal;
                driver.totalRatings = newTotal;
                driver.rating = parseFloat(newAvg.toFixed(2));
                await driver.save();
            }
        }

        res.json({ success: true, message: "Driver rated successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 8. Rate User (by Driver)
exports.rateUser = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { rating, review } = req.body;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, message: "Valid rating (1-5) is required" });
        }

        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        if (booking.bookingStatus !== "Completed") {
            return res.status(400).json({ success: false, message: "Can only rate completed rides" });
        }

        if (booking.userRating) {
            return res.status(400).json({ success: false, message: "User already rated for this trip" });
        }

        booking.userRating = rating;
        booking.userReview = review || null;
        await booking.save();

        if (booking.user) {
            const User = require("../models/User");
            const user = await User.findById(booking.user);
            if (user) {
                const newTotal = user.totalRatings + 1;
                const newAvg = ((user.averageRating * user.totalRatings) + rating) / newTotal;
                user.totalRatings = newTotal;
                user.averageRating = parseFloat(newAvg.toFixed(2));
                await user.save();
            }
        }

        res.json({ success: true, message: "User rated successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// GET USER REVIEWS
exports.getUserReviews = async (req, res) => {
    try {
        const { userId } = req.params;
        const reviews = await Booking.find({ 
            user: userId, 
            bookingStatus: 'Completed',
            userRating: { $gt: 0 } 
        }).populate("assignedDriver", "name image").sort({ createdAt: -1 });

        res.status(200).json({ success: true, data: reviews });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// GET DRIVER REVIEWS
exports.getDriverReviews = async (req, res) => {
    try {
        const { driverId } = req.params;
        const reviews = await Booking.find({ 
            assignedDriver: driverId, 
            bookingStatus: 'Completed',
            driverRating: { $gt: 0 } 
        }).populate("user", "name image").sort({ createdAt: -1 });

        res.status(200).json({ success: true, data: reviews });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// GET ACTIVE BOOKING
exports.getActiveBooking = async (req, res) => {
    try {
        const activeBooking = await Booking.findOne({
            user: req.user.id,
            bookingStatus: { $in: ["Pending", "Accepted", "Ongoing", "Payment_Pending"] }
        })
        .populate("assignedDriver", "-password")
        .populate("carCategory", "name image type")
        .populate("assignedCar", "vehicleNumber model color")
        .sort({ createdAt: -1 }); // Get the most recent one

        if (!activeBooking) {
            return res.status(200).json({ success: true, data: null, message: "No active bookings" });
        }

        res.status(200).json({ success: true, data: activeBooking });
    } catch (error) {
        console.error("Get Active Booking Error:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

exports.getAreaSpecificRates = getAreaSpecificRates;

// Download Normal Booking Receipt
exports.downloadReceipt = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const booking = await Booking.findById(bookingId).populate('user carCategory assignedDriver');

        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        const fileName = `KwikCabs_Receipt_${booking._id.toString().slice(-6).toUpperCase()}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        const pdfGenerator = require('../utils/pdfGenerator');
        await pdfGenerator.generateNormalBookingReceipt(booking, res);

    } catch (error) {
        console.error("Receipt generation error:", error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: "Error generating receipt" });
        }
    }
};
