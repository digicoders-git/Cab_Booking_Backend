const Booking = require("../models/Booking");
const CarCategory = require("../models/CarCategory");
const User = require("../models/User");
const RideRequest = require("../models/RideRequest");
const tripController = require("./tripController");
const Driver = require("../models/Driver");
const { getIO } = require("../socket/socket");
const AreaPricing = require("../models/AreaPricing");
const serviceAreaController = require("./serviceAreaController");

// Helper: Calculate Area-specific pricing overrides
const getAreaSpecificRates = async (address, defaultBase, defaultPrivateRate, defaultSharedRate) => {
    try {
        let lookupAddress = address;

        // More robust: handle if address is an object {address: "..."} which is common in many Map apps
        if (address && typeof address === 'object') {
            lookupAddress = address.address || address.name || "";
        }

        if (!lookupAddress) return { baseFare: defaultBase, privateRate: defaultPrivateRate, sharedRate: defaultSharedRate, isSpecial: false };

        const lowerAddress = lookupAddress.toLowerCase();
        
        const activeAreas = await AreaPricing.find({ isActive: true }).sort({ priority: -1 });
        
        for (const area of activeAreas) {
            const areaNameLower = area.areaName.toLowerCase();
            
            // 🎯 SIMPLE LOGIC: Just check if address string contains the area name or any keyword
            const nameMatch = lowerAddress.includes(areaNameLower);
            const kwMatch = area.matchingKeywords.some(keyword => 
                lowerAddress.includes(keyword.toLowerCase())
            );

            if (nameMatch || kwMatch) {
                console.log(`✨ [PRICING] Match Found! Area: ${area.areaName} (via Simple String Match)`);
                // Apply Multipliers
                let finalBase = defaultBase * (area.baseFareMultiplier || 1);
                let finalPrivateRate = defaultPrivateRate * (area.privateRateMultiplier || 1);
                let finalSharedRate = defaultSharedRate * (area.sharedRateMultiplier || 1);

                return { 
                    baseFare: finalBase, 
                    privateRate: finalPrivateRate, 
                    sharedRate: finalSharedRate,
                    isSpecial: true, 
                    areaName: area.areaName 
                };
            }
        }
    } catch (error) {
        console.error("Area Pricing Lookup Error:", error.message);
    }
    return { baseFare: defaultBase, privateRate: defaultPrivateRate, sharedRate: defaultSharedRate, isSpecial: false };
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
        const { carCategoryId, distanceKm, rideType, seatsBooked } = req.body;

        if (!carCategoryId || !distanceKm || !rideType) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        // --- NEW: Service Availability Enforcement ---
        const addressToMatch = req.body.pickupAddress || req.body.pickup?.address || req.body.pickup;
        const isServiceable = await serviceAreaController.checkServiceAvailability(addressToMatch);
        
        if (!isServiceable) {
            return res.status(400).json({
                success: false,
                message: "No rides available at your location right now. Try again later or check nearby areas."
            });
        }

        const category = await CarCategory.findById(carCategoryId);
        if (!category) {
            return res.status(404).json({ success: false, message: "Car Category not found" });
        }

        // --- NEW: Area Wise Pricing Logic ---
        // handle both pickupAddress string and pickup object
        const rates = await getAreaSpecificRates(addressToMatch, category.baseFare, category.privateRatePerKm, category.sharedRatePerSeatPerKm);
        
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
            dropAddress,
            pickupLat,
            pickupLng,
            dropLat,
            dropLng
        } = req.body;

        if (!distanceKm) {
            return res.status(400).json({ success: false, message: "Distance from Google Maps is required" });
        }

        // --- NEW: Service Availability Enforcement ---
        let addressToMatch = (pickupAddress || req.body.pickup?.address || req.body.pickup);
        console.log("--------------------------------------------------");
        console.log("🚀 [BOOKING API] Search request received for address:", addressToMatch);

        const isServiceable = await serviceAreaController.checkServiceAvailability(addressToMatch);
        
        if (!isServiceable) {
            console.log("🚫 [BOOKING API] Service Denied for this address.");
            return res.status(400).json({
                success: false,
                message: "No rides available at your location right now. Try again later or check nearby areas."
            });
        }
        console.log("✅ [BOOKING API] Service Allowed. Proceeding to fare estimates...");

        const categories = await CarCategory.find({ isActive: true });
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

        // --- NEW: Area Wise Pricing Integration ---
        let matchedArea = null;
        addressToMatch = (pickupAddress || req.body.pickup?.address || req.body.pickup);
        
        if (addressToMatch) {
            const activeAreas = await AreaPricing.find({ isActive: true }).sort({ priority: -1 });
            const lookupStr = (typeof addressToMatch === 'object' ? (addressToMatch.address || "") : addressToMatch).toLowerCase();
            
            matchedArea = activeAreas.find(area => {
                const nameMatch = lookupStr.includes(area.areaName.toLowerCase());
                const kwMatch = area.matchingKeywords.some(kw => lookupStr.includes(kw.toLowerCase()));
                return nameMatch || kwMatch;
            });
        }

        const options = categories.map(category => {
            // Apply Area Specific Overrides if matched
            let base = category.baseFare;
            let privateRate = category.privateRatePerKm;
            let sharedRate = category.sharedRatePerSeatPerKm;

            if (matchedArea) {
                base *= (matchedArea.baseFareMultiplier || 1);
                privateRate *= (matchedArea.privateRateMultiplier || 1);
                sharedRate *= (matchedArea.sharedRateMultiplier || 1);
            }

            const privateFare = base + (privateRate * distanceKm);
            const sharedFare = base + (sharedRate * distanceKm * seats);

            // --- REAL ETA CALCULATION LOGIC ---
            let arrivalMins = 0;
            let minDriverDist = Infinity;

            // Find drivers specifically driving this Category of car
            const categoryDrivers = availableDrivers.filter(d =>
                d.carDetails && d.carDetails.carType && d.carDetails.carType.toString() === category._id.toString()
            );

            // Find the absolute nearest driver's distance to the pickup location
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
                    }
                });
            }

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
                // NEW: Added nearby drivers locations for Map display (Uber/Rapido style)
                nearbyDrivers: categoryDrivers.map(d => ({
                    id: d._id,
                    latitude: d.currentLocation.latitude,
                    longitude: d.currentLocation.longitude
                })).slice(0, 10) // Limit to 10 for map performance
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
        });

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
            isSpecialArea: !!matchedArea,
            areaDetected: matchedArea ? matchedArea.areaName : "Default",
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
            selectedSeats // NEW: If coming from shared flow
        } = req.body;

        // Validate basic inputs (Simplified for example)
        if (!passengerName || !pickupAddress || !dropAddress || !carCategoryId) {
            return res.status(400).json({ success: false, message: "Required fields missing" });
        }

        // --- NEW: Service Availability Enforcement ---
        let addressToMatch = (pickupAddress || req.body.pickup?.address || req.body.pickup);
        console.log("-----------------------------------------");
        console.log("📝 [BOOKING API] Create Booking Request for:", addressToMatch);

        const isServiceable = await serviceAreaController.checkServiceAvailability(addressToMatch);
        
        if (!isServiceable) {
            console.log("🚫 [BOOKING API] Booking Creation Denied.");
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

        // --- NEW: Area Wise Pricing Logic for consistency ---
        addressToMatch = (pickupAddress || req.body.pickup?.address || req.body.pickup);
        const areaRates = await getAreaSpecificRates(addressToMatch, category.baseFare, category.privateRatePerKm, category.sharedRatePerSeatPerKm);

        const normalizedRideType = rideType ? rideType.toLowerCase() : "";
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

        fareEstimate = Math.round(fareEstimate);

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
            pickupDate: pickupDate || new Date(),
            pickupTime: pickupTime || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            selectedSeats: selectedSeats || [], // Track chosen spots
            fareEstimate,
            tripData: { startOtp }
        };

        // If User is making the booking
        if (req.user && req.user.role === "user") {
            bookingData.user = req.user.id;
        }

        // If Agent is making the booking (Calculate their commission!)
        if (req.user && req.user.role === "agent") {
            bookingData.agent = req.user.id;

            // Example logic: Agent gets a flat 5% commission of the fare
            const commission = Math.round(fareEstimate * 0.05);
            bookingData.agentCommission = commission;
        }

        const newBooking = await Booking.create(bookingData);

        // --- SEQUENTIAL MATCHING LOGIC (The Waterfall) ---
        const matchInterval = 11000; // 11 seconds (1s buffer for frontend timer sync)
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
                        }
                        if (checkBooking.agent) {
                            io.to(`agent_${checkBooking.agent.toString()}`).emit("booking_update", {
                                bookingId: checkBooking._id,
                                status: "Expired",
                                message: "No driver accepted the request within the time limit."
                            });
                        }
                    } catch (err) {
                        console.error("Socket Error on Expire:", err.message);
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

        // Pehla attempt turant shuru karein (Agar Private ride hai ya Shared with seats hai)
        if (rideType === "Private" || (rideType === "Shared" && selectedSeats && selectedSeats.length > 0)) {
            attemptMatching();
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
            .populate("carCategory", "name image")
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
            .populate("assignedDriver", "_id name phone carDetails")
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
            .populate("carCategory", "name image")
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
