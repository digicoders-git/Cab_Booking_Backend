require('dotenv').config();
const { sendOtpSms } = require('./utils/sendSms');

async function test() {
    console.log("Testing SMS sending...");
    // Put a valid phone number here to test, or just a dummy one to see the API response
    const result = await sendOtpSms("9876543210", "1234");
    console.log("Result:", result);
}

test();
