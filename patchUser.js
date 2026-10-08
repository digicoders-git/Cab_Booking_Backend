const fs = require('fs');
const file = 'c:/Users/vivekvkraj/OneDrive/Desktop/Cab booking/CapBokkin/controllers/userController.js';
let content = fs.readFileSync(file, 'utf8');

const exportPdfCode = `
exports.exportUserReportPdf = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findById(id).select("-password");
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        // Fetch regular bookings
        const regularBookings = await Booking.find({ user: id })
            .populate("carCategory", "name image")
            .populate("assignedDriver", "name phone image carDetails")
            .sort({ createdAt: -1 })
            .lean();

        // Fetch fixed package bookings
        const fixedBookings = await FixedBooking.find({ user: id })
            .populate("carCategory", "name icon")
            .populate("assignedDriver", "name phone image")
            .populate("fixedRoute", "name")
            .sort({ createdAt: -1 })
            .lean();

        // Standardize into unified ride history
        const formattedRegular = regularBookings.map(b => ({
            _id: b._id,
            bookingId: b._id.toString().slice(-8).toUpperCase(),
            type: "City Ride",
            rideType: b.rideType || "Private",
            carCategory: b.carCategory?.name || "Standard",
            carImage: b.carCategory?.image || null,
            pickup: b.pickup?.address || "N/A",
            drop: b.drop?.address || "N/A",
            fare: b.fare || 0,
            status: b.status || "Pending",
            paymentMethod: b.paymentMethod || "Cash",
            paymentStatus: b.paymentStatus || "Pending",
            createdAt: b.createdAt,
            date: b.createdAt,
            driver: b.assignedDriver ? {
                name: b.assignedDriver.name,
                phone: b.assignedDriver.phone,
                image: b.assignedDriver.image
            } : null
        }));

        const formattedFixed = fixedBookings.map(b => ({
            _id: b._id,
            bookingId: b._id.toString().slice(-8).toUpperCase(),
            type: "Package Ride",
            rideType: b.tripType || "Fixed Package",
            carCategory: b.carCategory?.name || "Standard",
            carImage: b.carCategory?.icon || null,
            pickup: b.pickupLocation || "N/A",
            drop: b.dropLocation || "N/A",
            fare: b.totalWithTax || b.price || 0,
            status: b.status || "Marketplace",
            paymentMethod: b.paymentMethod || "Cash",
            paymentStatus: b.paymentStatus || "Pending",
            createdAt: b.createdAt,
            date: b.pickupDate || b.createdAt,
            pickupTime: b.pickupTime || "",
            driver: b.assignedDriver ? {
                name: b.assignedDriver.name,
                phone: b.assignedDriver.phone,
                image: b.assignedDriver.image
            } : null
        }));

        const allRides = [...formattedRegular, ...formattedFixed].sort(
            (a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt)
        );

        // Stats calculation
        const totalRides = allRides.length;
        const completedRides = allRides.filter(r => r.status === "Completed").length;
        const cancelledRides = allRides.filter(r => r.status === "Cancelled").length;
        const totalSpent = allRides
            .filter(r => r.status === "Completed" || r.paymentStatus === "Completed")
            .reduce((sum, r) => sum + (Number(r.fare) || 0), 0);

        const joinDate = user.createdAt ? new Date(user.createdAt) : new Date();

        const userData = {
            ...user.toObject(),
            stats: {
                totalRides,
                completedRides,
                cancelledRides,
                totalSpent,
                joinedDate: joinDate
            },
            rides: allRides
        };

        const pdfGenerator = require("../utils/pdfGenerator");
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", \`attachment; filename="User_Report_\${user.name.replace(/\\s+/g, "_")}.pdf"\`);

        await pdfGenerator.generateUserReportPdf(userData, res);

    } catch (error) {
        console.error("Export User Report Error:", error);
        if(!res.headersSent) {
            res.status(500).json({ success: false, message: "Server Error", error: error.message });
        }
    }
};
`;

content += exportPdfCode;
fs.writeFileSync(file, content);
console.log('Added exportUserReportPdf successfully!');
