const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Load models
require('../models/Admin');
require('../models/Fleet');
require('../models/CarCategory');
require('../models/FleetCar');
require('../models/BulkBooking');

async function getTestData() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const admin = await mongoose.model('Admin').findOne();
  const fleet = await mongoose.model('Fleet').findOne();
  const category = await mongoose.model('CarCategory').findOne();
  
  if (!admin || !fleet || !category) {
    console.log("Error: Missing Data");
    process.exit();
  }

  const adminToken = jwt.sign({ id: admin._id, role: 'admin' }, process.env.JWT_SECRET);
  const fleetToken = jwt.sign({ id: fleet._id, role: 'fleet' }, process.env.JWT_SECRET);
  
  // Also ensure the fleet has an approved car for this category
  const FleetCar = mongoose.model('FleetCar');
  let fleetCar = await FleetCar.findOne({ fleetId: fleet._id, carType: category._id });
  if (!fleetCar) {
    await FleetCar.create({
      fleetId: fleet._id,
      carType: category._id,
      carNumber: 'TEST-001',
      carBrand: 'Toyota',
      carModel: 'Innova',
      isApproved: true,
      isActive: true
    });
  } else {
      fleetCar.isApproved = true;
      fleetCar.isActive = true;
      await fleetCar.save();
  }

  console.log("--- TEST DATA ---");
  console.log(`ADMIN_TOKEN="${adminToken}"`);
  console.log(`FLEET_TOKEN="${fleetToken}"`);
  console.log(`CATEGORY_ID="${category._id}"`);
  console.log(`API_URL="http://localhost:5000/api"`);
  process.exit();
}

getTestData();
