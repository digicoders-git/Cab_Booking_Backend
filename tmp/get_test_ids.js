const mongoose = require('mongoose');
const Fleet = require('../models/Fleet');
const CarCategory = require('../models/CarCategory');
require('dotenv').config();

async function getIds() {
    await mongoose.connect(process.env.MONGO_URI);
    const fleet = await Fleet.findOne();
    const category = await CarCategory.findOne();
    console.log('FLEET_ID:', fleet ? fleet._id : 'None');
    console.log('CATEGORY_ID:', category ? category._id : 'None');
    process.exit();
}

getIds();
