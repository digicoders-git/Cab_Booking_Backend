const Booking = require("../models/Booking");
const CarCategory = require("../models/CarCategory");
const User = require("../models/User");

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

// 2. Create Booking (User/Agent)
exports.createBooking = async (req, res) => {
    try {
        const {
            passengerName, passengerPhone,
            rideType, carCategoryId, seatsBooked,
            pickupAddress, pickupLat, pickupLng,
            dropAddress, dropLat, dropLng,
            distanceKm, pickupDate, pickupTime
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
            pickupDate,
            pickupTime,
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

        res.status(201).json({
            success: true,
            message: "Booking created successfully. Evaluating nearby drivers.",
            bookingId: newBooking._id,
            fareEstimate,
            startOtp // Shown to user/agent
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
            .populate("assignedDriver", "name phone carDetails")
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

        res.json({
            success: true,
            message: "Booking cancelled successfully",
            booking
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};
