const mongoose = require("mongoose");
const RideRequest = require("./models/RideRequest");
const Booking = require("./models/Booking");
const Driver = require("./models/Driver");

async function check() {
    try {
        await mongoose.connect("mongodb://127.0.0.1:27017/Carbooking");
        const booking = await Booking.findOne({ bookingStatus: "Pending" }).sort({ createdAt: -1 });
        if (!booking) {
            console.log("No pending bookings found.");
            process.exit(0);
        }
        
        console.log(`Booking ID: ${booking._id}`);
        const requests = await RideRequest.find({ booking: booking._id }).populate('driver', 'name email');
        
        console.log(`\n--- RIDE REQUESTS FOR BOOKING ${booking._id} ---`);
        if (requests.length === 0) {
            console.log("No ride requests generated!");
        } else {
            requests.forEach(r => {
                console.log(`Request ID: ${r._id} | Driver ID: ${r.driver?._id} | Email: ${r.driver?.email} | Status: ${r.status}`);
            });
        }
        
        // Let's also find the driver explicitly
        const targetDriver = await Driver.findOne({ email: "chaurasiyavivek557@gmail.com" });
        if (targetDriver) {
            console.log(`\nTarget Driver ID is: ${targetDriver._id}`);
            const hasReq = requests.find(r => r.driver?._id?.toString() === targetDriver._id.toString());
            console.log(`Was Target Driver in the requests? ${hasReq ? 'YES' : 'NO'}`);
        }
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
check();
