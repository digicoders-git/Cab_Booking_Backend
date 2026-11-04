const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch(e){}
const mongoose = require('mongoose');
require('dotenv').config({ path: __dirname + '/../.env' });
const FixedBooking = require('../models/FixedBooking');

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB');
    const bookings = await FixedBooking.find().sort({ createdAt: -1 }).limit(10).lean();
    console.log('Found', bookings.length, 'bookings:');
    for (const b of bookings) {
      console.log('----------------------------------------');
      console.log('ID:', b._id);
      console.log('Invoice/BookingId:', b.bookingId || b.invoiceNo);
      console.log('Status:', b.status);
      console.log('Price:', b.price);
      console.log('FinalPrice:', b.finalPrice);
      console.log('DistanceKm (route):', b.distanceKm);
      console.log('MaxDistanceKm (limit):', b.maxDistanceKm);
      console.log('ExtraDistanceChargePerKm (rate):', b.extraDistanceChargePerKm);
      console.log('TotalDistanceDriven:', b.totalDistanceDriven);
      console.log('ExtraDistanceCharges:', b.extraDistanceCharges);
      console.log('ExtraTimeCharges:', b.extraTimeCharges);
      console.log('StartedAt:', b.startedAt);
      console.log('CompletedAt:', b.completedAt);
      console.log('Pickup coords:', b.pickupLat, b.pickupLng);
      console.log('Drop coords:', b.dropLat, b.dropLng);
      console.log('Start coords:', b.startLat, b.startLng);
      console.log('End coords:', b.endLat, b.endLng);
    }
  } catch(err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}
run();

