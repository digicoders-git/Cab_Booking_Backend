require('dotenv').config();
const { RazorpayHandler } = require('./utils/RazorpayHandler');

async function testRazorpay() {
    try {
        console.log("Initializing Razorpay Handler...");
        const handler = RazorpayHandler.getInstance();
        
        const params = {
            order_id: "test_order_" + Date.now(),
            amount: "150.00",
            customer_id: "test_user_123",
            customer_email: "test@example.com",
            customer_phone: "+919876543210",
            return_url: "http://localhost:5000/api/bulk-bookings/payment-return?redirect=test"
        };
        
        console.log("Sending Request to Razorpay for Payment Link (Amount: 150 INR)...");
        const result = await handler.orderSession(params);
        
        console.log("\n✅ SUCCESS! Razorpay Payment Link Created:");
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error("\n❌ FAILED! Razorpay Error:");
        console.error(error);
    }
}

testRazorpay();
