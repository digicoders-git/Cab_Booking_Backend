require('dotenv').config();
const { PaymentHandler } = require('../utils/PaymentHandler');

async function testHDFC() {
    try {
        console.log("Loaded API KEY:", process.env.HDFC_API_KEY ? "YES" : "NO");
        console.log("Initializing HDFC Payment Handler...");
        const paymentHandler = PaymentHandler.getInstance();
        
        console.log("Sending test orderSession request to HDFC...");
        const orderIdString = `test_order_${Date.now()}`;
        
        const sessionResponse = await paymentHandler.orderSession({
            order_id: orderIdString,
            amount: "10.00",
            customer_id: "test_customer",
            customer_email: "test@example.com",
            customer_phone: "9999999999",
            return_url: `${process.env.HDFC_BASE_URL}/payment-return`
        });
        
        console.log("\n✅ SUCCESS: HDFC API is working perfectly!");
        console.log("Response from HDFC:");
        console.log(JSON.stringify(sessionResponse, null, 2));
    } catch (error) {
        console.error("\n❌ ERROR: HDFC API returned an error:");
        console.error(error.message || error);
    }
}

testHDFC();
