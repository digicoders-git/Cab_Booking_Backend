const mongoose = require("mongoose");
const Driver = require("./models/Driver");
const Booking = require("./models/Booking");
const CarCategory = require("./models/CarCategory");
const BulkBooking = require("./models/BulkBooking");

async function check() {
    try {
        await mongoose.connect("mongodb://127.0.0.1:27017/Carbooking");
        
        const driver = await Driver.findOne({ email: "chaurasiyavivek557@gmail.com" }).populate("carDetails.carType");
        if (!driver) {
            console.log("Driver not found!");
            process.exit(0);
        }

        console.log("--- DRIVER STATUS ---");
        console.log(`Email: ${driver.email}`);
        
        const booking = await Booking.findOne({ bookingStatus: "Pending" }).sort({ createdAt: -1 }).populate("carCategory");
        if (!booking) {
            console.log("\nNo pending bookings found.");
            process.exit(0);
        } 
        
        console.log(`\n--- LATEST PENDING BOOKING ---`);
        console.log(`Booking ID: ${booking._id}`);
        console.log(`Car Category:`, booking.carCategory?.name);
        console.log(`Fare Estimate: ${booking.fareEstimate}`);
        console.log(`Previous Dues: ${booking.previousDues}`);
        console.log(`Estimated Distance: ${booking.estimatedDistanceKm}`);
        console.log(`Base Fare (Without Dues): ${booking.fareEstimate - (booking.previousDues || 0)}`);
        
        console.log(`\n--- USER WALLET STATUS ---`);
        const User = require("./models/User");
        if (booking.user) {
            const user = await User.findById(booking.user);
            console.log(`User ID: ${user._id}`);
            console.log(`User Wallet Balance: ${user.walletBalance}`);
        } else {
            console.log(`No user associated with this booking (Agent maybe?)`);
        }
        console.log(`Destination Filter Active: ${driver.destinationFilterActive}`);
        if (driver.destinationFilterActive) {
            console.log(`Preferred Destination:`, driver.preferredDestination);
            
            if (booking.drop && booking.drop.latitude) {
                // We need to import the calculation logic, but I can just paste the basic math here
                function calculateHeading(lat1, lon1, lat2, lon2) {
                    const toRadians = (deg) => deg * (Math.PI / 180);
                    const toDegrees = (rad) => rad * (180 / Math.PI);
                    const dLon = toRadians(lon2 - lon1);
                    lat1 = toRadians(lat1);
                    lat2 = toRadians(lat2);
                    const y = Math.sin(dLon) * Math.cos(lat2);
                    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
                    const brng = toDegrees(Math.atan2(y, x));
                    return (brng + 360) % 360;
                }
                
                function isHeadingSimilar(h1, h2, tolerance = 60) {
                    const diff = Math.abs(h1 - h2);
                    const actualDiff = Math.min(diff, 360 - diff);
                    return actualDiff <= tolerance;
                }

                const driverLat = driver.currentLocation.latitude;
                const driverLng = driver.currentLocation.longitude;
                const homeLat = driver.preferredDestination.latitude;
                const homeLng = driver.preferredDestination.longitude;
                const dropLat = booking.drop.latitude;
                const dropLng = booking.drop.longitude;

                const headingToHome = calculateHeading(driverLat, driverLng, homeLat, homeLng);
                const headingToDrop = calculateHeading(driverLat, driverLng, dropLat, dropLng);
                const isSimilar = isHeadingSimilar(headingToHome, headingToDrop, 60);

                console.log(`Heading To Home: ${headingToHome.toFixed(2)} degrees`);
                console.log(`Heading To Drop: ${headingToDrop.toFixed(2)} degrees`);
                console.log(`Are they similar (within 60 deg)? ${isSimilar ? 'YES' : 'NO'}`);
            }
        }

        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
check();
