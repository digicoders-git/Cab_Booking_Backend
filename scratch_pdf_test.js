const mongoose = require('mongoose');
require('dotenv').config();
const fs = require('fs');
const PDFDocument = require('pdfkit');

const connectDB = require('./config/db');
const Booking = require('./models/Booking');
const User = require('./models/User');
const Driver = require('./models/Driver');
const CarCategory = require('./models/CarCategory');
const pdfGenerator = require('./utils/pdfGenerator');

async function testDirect() {
    try {
        await connectDB();
        const booking = await Booking.findOne({}).populate('user carCategory driver').sort({ createdAt: -1 });
        
        console.log("Testing PDF generation for booking:", booking._id);

        const writable = fs.createWriteStream('test_direct_receipt.pdf');

        // Let's call the actual logic manually to see where it breaks
        await pdfGenerator.generateNormalBookingReceipt(booking, writable);
        console.log("PDF generated successfully via direct call.");
    } catch (e) {
        console.error("Direct Error:", e);
    } finally {
        mongoose.connection.close();
        process.exit(0);
    }
}

testDirect();
