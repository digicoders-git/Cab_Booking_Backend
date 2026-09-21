const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const Driver = require('./models/Driver');
  const driver = await Driver.findOne({'carDetails.carNumber': 'DL-81-AB-18'}).lean();
  if (driver) {
    console.log('Driver:', driver.name, '|', driver._id);
    console.log('  image:', driver.image);
    console.log('  carNumber:', driver.carDetails?.carNumber);
    console.log('  rc:', driver.carDetails?.carDocuments?.rc);
    console.log('  insurance:', driver.carDetails?.carDocuments?.insurance);
  } else {
    console.log('Driver with DL-81-AB-18 not found');
    // Try case insensitive
    const all = await Driver.find().lean();
    const found = all.filter(d => d.carDetails?.carNumber?.toLowerCase().includes('dl') || d.carDetails?.carNumber?.toLowerCase().includes('81'));
    console.log('Possible matches:', found.map(d => `${d.name}: ${d.carDetails?.carNumber}`));
  }
  mongoose.disconnect();
});
