const Booking = require("../models/Booking");
const Driver = require("../models/Driver");
const RideRequest = require("../models/RideRequest");
const Transaction = require("../models/Transaction");
const Agent = require("../models/Agent");
const Admin = require("../models/Admin");
const Fleet = require("../models/Fleet");

// Haversine formula to get distance between two points in km
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity; // Return infinite if missing data
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
        ;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return d;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

// Calculate compass heading between two points (0 to 360 degrees)
function calculateHeading(lat1, lon1, lat2, lon2) {
    const dLon = deg2rad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(deg2rad(lat2));
    const x = Math.cos(deg2rad(lat1)) * Math.sin(deg2rad(lat2)) -
              Math.sin(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.cos(dLon);
    let brng = Math.atan2(y, x);
    brng = brng * (180 / Math.PI);
    brng = (brng + 360) % 360;
    return brng;
}

// Check difference between two headings (tolerance in degrees)
function isHeadingSimilar(heading1, heading2, maxTolerance = 45) {
    if (heading1 === null || heading2 === null) return true; // If no previous heading (first ride)
    let diff = Math.abs(heading1 - heading2);
    if (diff > 180) diff = 360 - diff;
    return diff <= maxTolerance;
}

// 1. Core Background Logic: Find Nearest Driver and Send Request
// (This is usually called internally right after a booking is made, or by a cron job)
exports.findAndAssignDriver = async (req, res) => {
    try {
        const { bookingId } = req.params;

        const booking = await Booking.findById(bookingId);
        if (!booking || booking.bookingStatus !== "Pending") {
            return res.status(400).json({ success: false, message: "Booking not found or not in Pending status" });
        }

        // Find all drivers who previously rejected or missed this request
        const previousRequests = await RideRequest.find({ booking: bookingId }).select("driver");
        const excludedDriverIds = previousRequests.map(r => r.driver.toString());

        // Base query for matching
        let driverQuery = {
            isOnline: true,
            isAvailable: true,
            isActive: true,
            isApproved: true,
            "carDetails.carType": booking.carCategory
        };

        // Shared Engine matching rules:
        if (booking.rideType === "Private") {
            driverQuery.currentRideType = null; // Must be completely empty
        } else if (booking.rideType === "Shared") {
            driverQuery.$or = [
                { currentRideType: null }, // Completely empty is fine
                { currentRideType: "Shared", availableSeats: { $gte: booking.seatsBooked } } // Sharing with enough space
            ];
        }

        // Find available online drivers with matching car category and Ride Type
        const availableDrivers = await Driver.find(driverQuery)
            .populate("carDetails.carType")
            .select("_id name phone currentLocation availableSeats currentRideType currentHeading carDetails isAvailable");

        // Calculate heading (direction) for the NEW booking
        const newBookingHeading = calculateHeading(
            booking.pickup.latitude, booking.pickup.longitude,
            booking.drop.latitude, booking.drop.longitude
        );

        // Filter out those who already rejected, and calculate distance
        let nearestDriver = null;
        let minDistance = 10; // Max radius to search: 10 KM limit for testing

        for (const driver of availableDrivers) {
            if (excludedDriverIds.includes(driver._id.toString())) continue;

            // NEW: Shared Ride Direction/Heading Check!
            // If the driver is already on a Shared ride, compare directions
            if (booking.rideType === "Shared" && driver.currentHeading !== null) {
                // Must be going in roughly the same direction (e.g. within 45 degrees)
                if (!isHeadingSimilar(driver.currentHeading, newBookingHeading, 45)) {
                    continue; // SKIP this driver! They are going the wrong way!
                }
            }

            const dist = getDistanceFromLatLonInKm(
                booking.pickup.latitude, booking.pickup.longitude,
                driver.currentLocation.latitude, driver.currentLocation.longitude
            );

            // Find the closest one within limits
            if (dist < minDistance) {
                minDistance = dist;
                nearestDriver = driver;
            }
        }

        if (!nearestDriver) {
            // No drivers found. Usually goes to a waiting queue or notifies user
            return res.status(404).json({ success: false, message: "No available nearby drivers found for this car category" });
        }

        // Create a new Ride Request
        const newRequest = await RideRequest.create({
            booking: booking._id,
            driver: nearestDriver._id,
            status: "Pending" // Waiting for Driver to say Yes/No
        });

        res.json({
            success: true,
            message: "Request sent to nearest driver",
            driverDetails: { id: nearestDriver._id, name: nearestDriver.name, distanceKn: Math.round(minDistance * 10) / 10 },
            requestId: newRequest._id
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 2. Used by Driver App: Fetch New Pending Ride Requests (Screen: "New Ride Requests")
exports.getPendingRequests = async (req, res) => {
    try {
        const driverId = req.user.id; // From Auth Token

        const requests = await RideRequest.find({ driver: driverId, status: "Pending" })
            .populate("booking")
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            requests
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 3. Driver App Action: Accept or Reject the Ride
exports.respondToRequest = async (req, res) => {
    try {
        const { requestId } = req.params;
        const { action } = req.body; // "Accept" or "Reject"
        const driverId = req.user.id;

        const request = await RideRequest.findOne({ _id: requestId, driver: driverId });
        if (!request) return res.status(404).json({ success: false, message: "Request not found" });

        if (request.status !== "Pending") {
            return res.status(400).json({ success: false, message: "You already responded to this or it expired" });
        }

        const booking = await Booking.findById(request.booking);

        if (action === "Accept") {
            // Did someone else already accept it?
            if (booking.bookingStatus !== "Pending") {
                request.status = "Cancelled";
                await request.save();
                return res.status(400).json({ success: false, message: "Sorry, this ride is no longer available." });
            }

            // Mark driver accepted
            request.status = "Accepted";
            await request.save();

            // Lock the booking
            booking.bookingStatus = "Accepted";
            booking.assignedDriver = driverId;
            
            const driver = await Driver.findById(driverId).populate("carDetails.carType");
            booking.assignedCar = null; // Normally set to FleetCar id if fleet

            await booking.save();

            // ============================================
            // SHARED RIDE VS PRIVATE RIDE CORE LOGIC
            // ============================================
            
            if (booking.rideType === "Private") {
                // Completely locked. Driver becomes busy.
                driver.currentRideType = "Private";
                driver.isAvailable = false;
                driver.availableSeats = 0;
                driver.currentHeading = null;
            } else if (booking.rideType === "Shared") {
                // If car was completely empty, setup capacity first
                const capacity = driver.carDetails?.carType?.seatCapacity || 4;
                
                if (driver.currentRideType !== "Shared") {
                    driver.currentRideType = "Shared";
                    driver.availableSeats = capacity;
                    
                    // Set heading based on first passenger's route!
                    driver.currentHeading = calculateHeading(
                        booking.pickup.latitude, booking.pickup.longitude,
                        booking.drop.latitude, booking.drop.longitude
                    );
                }

                // EXACT SEAT LOCKING:
                if (booking.selectedSeats && booking.selectedSeats.length > 0) {
                    for (let seatName of booking.selectedSeats) {
                        const seatEntry = driver.seatMap.find(s => s.seatName === seatName);
                        if (seatEntry) {
                            seatEntry.isBooked = true;
                            seatEntry.bookingId = booking._id; // Mark locked permanently
                        }
                    }
                }

                // Occupy the newly booked seats numerically
                driver.availableSeats -= booking.seatsBooked;

                // Important logic: Is the car fully packed now?
                if (driver.availableSeats <= 0) {
                    driver.isAvailable = false; // Driver is full, stop receiving new ride requests
                } else {
                    driver.isAvailable = true;  // Driver still has empty seats for more passengers!
                }
            }

            await driver.save();

            return res.json({ success: true, message: "Ride Accepted! Proceed to pickup.", booking });

        } else if (action === "Reject") {
            request.status = "Rejected";
            await request.save();
            return res.json({ success: true, message: "Ride Rejected. Waiting for next request." });
        } else {
            return res.status(400).json({ success: false, message: "Invalid action. Use Accept or Reject" });
        }

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 4. Start Trip: Driver enters the OTP customer provided
exports.startTrip = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { otp } = req.body;
        const driverId = req.user.id;

        const booking = await Booking.findOne({ _id: bookingId, assignedDriver: driverId });
        if (!booking) return res.status(404).json({ success: false, message: "Booking not assigned to you" });

        if (booking.bookingStatus !== "Accepted") {
            return res.status(400).json({ success: false, message: "Booking must be Accepted to start" });
        }

        if (booking.tripData.startOtp !== otp) {
            return res.status(400).json({ success: false, message: "Invalid OTP! Customer must provide correct OTP to start." });
        }

        booking.bookingStatus = "Ongoing";
        booking.tripData.startedAt = new Date();
        await booking.save();

        res.json({ success: true, message: "Trip Started Successfully!", booking });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// 5. End Trip: Complete the ride
exports.endTrip = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { paymentMethod } = req.body; // Driver chooses this at the end
        const driverId = req.user.id;

        if (!paymentMethod || !['Cash', 'Online'].includes(paymentMethod)) {
            return res.status(400).json({ 
                success: false, 
                message: "Please choose payment method (Cash or Online) to end trip" 
            });
        }

        const booking = await Booking.findOne({ _id: bookingId, assignedDriver: driverId });
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        if (booking.bookingStatus !== "Ongoing") {
            return res.status(400).json({ success: false, message: "Only Ongoing trips can be ended" });
        }

        // Setup completion
        booking.bookingStatus = "Completed";
        booking.tripData.endedAt = new Date();
        
        // Finalize fare and payment method
        booking.actualFare = booking.fareEstimate;
        booking.paymentMethod = paymentMethod;
        booking.paymentStatus = "Completed"; // Since it's handled at destination
        await booking.save();

        // Released the driver or add back empty seats
        const driver = await Driver.findById(driverId).populate("carDetails.carType");

        // ===============================================
        // PHASE 4: MONEY SPLIT (The Financial Engine)
        // ===============================================

        const totalFare = booking.actualFare;
        
        // 1. Calculate Agent Commission (if booking by Agent)
        let agentCut = 0;
        if (booking.agent) {
            const agent = await Agent.findById(booking.agent);
            if (agent) {
                // We use the booking's pre-calculated commission
                agentCut = booking.agentCommission || 0;
                agent.walletBalance += agentCut;
                agent.totalEarnings += agentCut;
                agent.totalBookings += 1;
                await agent.save();

                // Record Agent Transaction
                await Transaction.create({
                    user: agent._id, userModel: 'Agent', amount: agentCut, type: 'Credit',
                    category: 'Commission', status: 'Completed', relatedBooking: booking._id,
                    description: `Commission for booking ${booking._id}`
                });
            }
        }

        // 2. Calculate Admin Commission (DYNAMIC)
        let adminPercentage = 10; // Fallback
        
        let admin = await Admin.findOne();
        if (admin) {
            adminPercentage = admin.defaultCommission || 10;
        }

        // If driver is from a Fleet, Admin might have a different deal with that Fleet!
        if (driver.createdByModel === "Fleet") {
            const fleet = await Fleet.findById(driver.createdBy);
            if (fleet && fleet.commissionPercentage !== undefined) {
                adminPercentage = fleet.commissionPercentage;
            }
        }

        const adminCut = Math.round(totalFare * (adminPercentage / 100)); 
        
        if (admin) {
            admin.walletBalance = (admin.walletBalance || 0) + adminCut;
            admin.totalEarnings = (admin.totalEarnings || 0) + adminCut;
            await admin.save();
            
            await Transaction.create({
                user: admin._id, userModel: 'Admin', amount: adminCut, type: 'Credit',
                category: 'Commission', status: 'Completed', relatedBooking: booking._id,
                description: `Admin fee for trip ${booking._id}`
            });
        } else {
            console.log("CRITICAL: No Admin found in database for commission split!");
        }

        // 3. Driver/Fleet Earning or Debt Calculation
        const isCash = booking.paymentMethod === 'Cash';
        const commissionTotal = agentCut + adminCut;
        const driverProfit = totalFare - commissionTotal; // What driver actually kept in pocket (if cash) or gets (if online)

        if (driver.createdByModel === "Fleet") {
            const fleet = await Fleet.findById(driver.createdBy);
            if (fleet) {
                if (isCash) {
                    // Driver kept the cash, so Fleet owes the commission to Admin/Agent
                    fleet.walletBalance -= commissionTotal;
                    
                    await Transaction.create({
                        user: fleet._id, userModel: 'Fleet', amount: commissionTotal, type: 'Debit',
                        category: 'Commission', status: 'Completed', relatedBooking: booking._id,
                        description: `Commission debt for Cash Trip ${booking._id}`
                    });
                } else {
                    // Online: Admin has the money, so credit the profit to Fleet
                    fleet.walletBalance += driverProfit;
                    fleet.totalEarnings += driverProfit;
                    
                    await Transaction.create({
                        user: fleet._id, userModel: 'Fleet', amount: driverProfit, type: 'Credit',
                        category: 'Ride Earning', status: 'Completed', relatedBooking: booking._id,
                        description: `Earning from Fleet Driver ${driver.name}`
                    });
                }
                await fleet.save();
            }
        } else {
            // Independent Driver
            if (isCash) {
                // Driver kept the cash, subtract commission as debt
                driver.walletBalance -= commissionTotal;

                await Transaction.create({
                    user: driver._id, userModel: 'Driver', amount: commissionTotal, type: 'Debit',
                    category: 'Commission', status: 'Completed', relatedBooking: booking._id,
                    description: `Commission debt for Cash Trip ${booking._id}`
                });
            } else {
                // Online payout
                driver.walletBalance += driverProfit;
                driver.totalEarnings += driverProfit;

                await Transaction.create({
                    user: driver._id, userModel: 'Driver', amount: driverProfit, type: 'Credit',
                    category: 'Ride Earning', status: 'Completed', relatedBooking: booking._id,
                    description: `Earning from completed trip ${booking._id}`
                });
            }
        }

        // 4. Update Driver Stats & Check Debt Limit (Suspension)
        driver.totalTrips += 1;
        
        // Safety Check: If account goes too far into negative, suspend!
        if (driver.walletBalance < (driver.debtLimit || -500)) {
            driver.isActive = false;
            driver.isOnline = false;
        }
        
        await driver.save();
        
        // Logic for Shared/Private released
        if (booking.rideType === "Private") {
            driver.isAvailable = true;
            driver.currentRideType = null;
            driver.availableSeats = 0;
            driver.currentHeading = null;
        } else if (booking.rideType === "Shared") {
            // EXACT SEAT UNLOCKING:
            if (booking.selectedSeats && booking.selectedSeats.length > 0) {
                for (let seatName of booking.selectedSeats) {
                    const seatEntry = driver.seatMap.find(s => s.seatName === seatName);
                    // Match booking ID so user A doesnt delete user B's lock
                    if (seatEntry && seatEntry.bookingId && seatEntry.bookingId.toString() === booking._id.toString()) {
                        seatEntry.isBooked = false;
                        seatEntry.bookingId = null;
                    }
                }
            }

            // Give seats back to driver since passenger stepped out!
            driver.availableSeats += booking.seatsBooked;
            
            const capacity = driver.carDetails?.carType?.seatCapacity || 4;
            
            if (driver.availableSeats >= capacity) {
                // Car is completely empty again
                driver.isAvailable = true;
                driver.currentRideType = null;
                driver.availableSeats = 0;
                driver.currentHeading = null;
                // Double safety reset seatMap
                driver.seatMap.forEach(s => { s.isBooked = false; s.bookingId = null; });
            } else {
                // Car still has other shared passengers dropping later, but now we have some room to take new ones!
                driver.isAvailable = true; 
            }
        }

        driver.totalTrips += 1;
        // In actual Phase 4, driver earning splits happen here!
        await driver.save();

        res.json({ success: true, message: "Trip Ended! Passenger can make payment now.", finalFare: booking.actualFare });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

// ===============================================
// PHASE 2 SYSTEM: MARKETPLACE & SEAT SELECTION
// ===============================================

// Step 2 of Phase 2 logic: Search specific seats!
exports.searchSharedRides = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const booking = await Booking.findById(bookingId).populate("carCategory");
        if (!booking || booking.rideType !== "Shared") {
            return res.status(400).json({ success: false, message: "Only Shared bookings can search for seat maps." });
        }

        // Base query - only drivers with matching car category
        let driverQuery = {
            isOnline: true,
            isAvailable: true,
            isActive: true,
            isApproved: true,
            "carDetails.carType": booking.carCategory._id
        };

        const availableDrivers = await Driver.find(driverQuery)
            .populate("carDetails.carType");

        const newBookingHeading = calculateHeading(
            booking.pickup.latitude, booking.pickup.longitude,
            booking.drop.latitude, booking.drop.longitude
        );

        let matchingDrivers = [];

        for (const driver of availableDrivers) {
            // Filter by Heading if already doing shared
            if (driver.currentRideType !== null) {
                if (!isHeadingSimilar(driver.currentHeading, newBookingHeading, 45)) continue;
            }

            // Distance filtering
            const dist = getDistanceFromLatLonInKm(
                booking.pickup.latitude, booking.pickup.longitude,
                driver.currentLocation.latitude, driver.currentLocation.longitude
            );
            if (dist > 15) continue; // Skip too far

            // INITIALIZE SEAT MAP (If new driver / fresh day)
            let finalSeatMap = driver.seatMap;
            const layout = driver.carDetails.carType.seatLayout;
            
            if (!finalSeatMap || finalSeatMap.length === 0) {
                if (layout && layout.length > 0) {
                    finalSeatMap = layout.map(s => ({ seatName: s, isBooked: false, bookingId: null }));
                    driver.seatMap = finalSeatMap;
                    await driver.save();
                }
            } else if (finalSeatMap.length !== layout.length) {
                console.log("WARN: Mismatch between layout & driver map");
            }

            // Count free available seats accurately
            const freeSeatsCount = finalSeatMap.filter(s => !s.isBooked).length;
            if (freeSeatsCount < booking.seatsBooked) continue; // Skip if 2 people want seat but only 1 free

            matchingDrivers.push({
                driverId: driver._id,
                driverName: driver.name,
                distanceKm: Math.round(dist * 10) / 10,
                seatMap: finalSeatMap,
                carModel: driver.carDetails.carModel
            });
        }

        res.json({ success: true, count: matchingDrivers.length, drivers: matchingDrivers });
    } catch(err) {
         res.status(500).json({ success: false, message: "Server Error", error: err.message });
    }
};

// Step 3 of Phase 2 Logic: Select & Lock Seat!
exports.requestSpecificSharedDriver = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { driverId, selectedSeats } = req.body; // Expects array: ["Front", "Back-Left"]

        const booking = await Booking.findById(bookingId);
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

        if (booking.rideType !== "Shared") {
            return res.status(400).json({ success: false, message: "Private rides are auto-assigned natively." });
        }

        if (!selectedSeats || selectedSeats.length !== booking.seatsBooked) {
             return res.status(400).json({ success: false, message: `Please select exactly ${booking.seatsBooked} seats to continue.` });
        }

        const driver = await Driver.findById(driverId);
        if (!driver) return res.status(404).json({ success: false, message: "Driver not found" });

        // CHECK AVAILABILITY OF SELECTED SEATS IMMEDIATELY
        let allFree = true;
        for (let sName of selectedSeats) {
             const seat = driver.seatMap.find(s => s.seatName === sName);
             if (!seat || seat.isBooked) {
                 allFree = false;
                 break;
             }
        }
        
        if (!allFree) {
            return res.status(400).json({ success: false, message: "Uh-oh! One or more of the seats you selected were literally just taken. Please select again." });
        }

        // Lock seats to this Booking (Memories attached)
        booking.selectedSeats = selectedSeats;
        await booking.save();

        // Check if a request already exists
        const existingReq = await RideRequest.findOne({ booking: booking._id, driver: driver._id });
        if (existingReq) {
            return res.status(400).json({ success: false, message: "Request already underway for this driver!" });
        }

        // Send Targeted Notification to ONLY this driver!
        const newRequest = await RideRequest.create({
            booking: booking._id,
            driver: driver._id,
            status: "Pending" 
        });

        res.json({ 
            success: true, 
            message: "Temporary Hold Applied! Direct request sent to the specific driver's Screen.", 
            requestId: newRequest._id,
            selectedSeats: selectedSeats
        });

    } catch (err) {
        res.status(500).json({ success: false, message: "Server error", error: err.message });
    }
};
