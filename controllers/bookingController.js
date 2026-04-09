const Booking = require("../models/Booking");
const CarCategory = require("../models/CarCategory");
const User = require("../models/User");
const RideRequest = require("../models/RideRequest");
const tripController = require("./tripController");
const Driver = require("../models/Driver");
const { getIO } = require("../socket/socket");

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

        const category = await CarCategory.findById(carCategoryId);
        if (!category) {
            return res.status(404).json({ success: false, message: "Car Category not found" });
        }

        let estimatedFare = 0;

        // Base concept: Private vs Shared Pricing
        if (rideType === "Private") {
            estimatedFare = category.baseFare + (category.privateRatePerKm * distanceKm);
        } else if (rideType === "Shared") {
            const seats = seatsBooked || 1; // Default to 1 seat if not provided

            if (seats > category.seatCapacity) {
                return res.status(400).json({
                    success: false,
                    message: `Requested seats (${seats}) exceed car capacity (${category.seatCapacity})`
                });
            }

            // Calculation: BaseFare + (Rate Per Seat Per Km * Distance * Number of Seats Booked)
            // (Note: Optional business logic: base fare could also be multiplied by seats if desired)
            estimatedFare = category.baseFare + (category.sharedRatePerSeatPerKm * distanceKm * seats);
        } else {
            return res.status(400).json({ success: false, message: "Invalid Ride Type" });
        }

        res.json({
            success: true,
            distanceKm,
            rideType,
            seatsBooked: rideType === "Private" ? category.seatCapacity : (seatsBooked || 1),
            estimatedFare: Math.round(estimatedFare) // Rounded to handle floating points cleanly
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

    const options = categories.map(category => {
        const privateFare = category.baseFare + (category.privateRatePerKm * distanceKm);
        const sharedFare = category.baseFare + (category.sharedRatePerSeatPerKm * distanceKm * seats);

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

        // Rate Card Lookup
        const category = await CarCategory.findById(carCategoryId);
        if (!category) {
            return res.status(404).json({ success: false, message: "Car Category not found" });
        }

        // Calculate Fare Internally to prevent tampering from Client side
        let fareEstimate = category.baseFare;
        let finalSeats = 1;

        if (rideType === "Private") {
            fareEstimate += (category.privateRatePerKm * distanceKm);
            finalSeats = category.seatCapacity; // Booking whole car
        } else if (rideType === "Shared") {
            finalSeats = seatsBooked || 1;
            fareEstimate += (category.sharedRatePerSeatPerKm * distanceKm * finalSeats);
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
        const matchInterval = 30000; // 30 seconds for each driver
        const maxTime = 120000;      // 2 minutes total wait time
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

                    console.log(`Booking ${newBooking._id} expired after 2 mins matching attempts.`);
                    return;
                }

                // 3. Purani pending requests ko timeout kar do (Water-fall effect)
                await RideRequest.updateMany({ booking: newBooking._id, status: "Pending" }, { status: "Timeout" });

                // 4. Agle nearest driver ko dhundho
                const matchResult = await tripController.autoMatchDriver(newBooking._id);

                if (matchResult.success) {
                    console.log(`[Waterfall] Request sent to Next Driver: ${matchResult.driverDetails.name}`);
                } else {
                    console.log(`[Waterfall] No more drivers found for now. Retrying in 30s...`);
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
            .populate("assignedDriver", "_id name phone carDetails")
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
            .populate("user", "name phone")
            .populate("agent", "name phone")
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

                    // 🎯 Live Notification to Driver
                    const io = getIO();
                    io.to(driver._id.toString()).emit("booking_update", {
                        bookingId: booking._id,
                        status: "Cancelled",
                        message: `Trip cancelled by ${booking.cancelledBy}`
                    });
                    console.log(`Driver notified via Socket about cancellation.`);
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
        } catch (err) {}

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
            .populate("assignedDriver", "_id name phone carDetails")
            .populate("user", "name phone");

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
