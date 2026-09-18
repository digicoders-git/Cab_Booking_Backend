require('dotenv').config();
const mongoose = require('mongoose');
const AppSetting = require('./models/AppSetting');

const connectDB = async () => {
    await mongoose.connect(process.env.MONGO_URI);
};

const check = async () => {
    await connectDB();
    const settings = await AppSetting.findOne();
    console.log("App Settings:", settings);
    process.exit(0);
};

check();
