const axios = require('axios');

/**
 * Sends an OTP SMS using BulkSMSPlans API.
 * @param {string} phone - The recipient's 10-digit phone number.
 * @param {string} otp - The OTP to send.
 * @returns {object|null} - Returns response data on success, null on failure.
 */
exports.sendOtpSms = async (phone, otp) => {
    try {
        // Load credentials from environment variables, fallback to defaults if not found
        const api_id = process.env.SMS_API_ID || "APIjaAnvPV4150531";
        const api_password = process.env.SMS_API_PASSWORD || "LZEjJwFO";
        const sender = process.env.SMS_SENDER_ID || "KWIKCB";
        
        // Use the EXACT string format from your approved DLT Template
        const messageText = `Your login OTP is ${otp}. Do not share it with anyone. - KwikCab https://www.kwikcabs.in/`;

        // Configure query parameters as per BulkSMSPlans documentation
        const params = {
            api_id: api_id,
            api_password: api_password,
            sms_type: "Transactional",
            sms_encoding: "text",
            sender: sender,
            number: phone,
            message: messageText,
            template_id: process.env.SMS_TEMPLATE_ID
        };

        console.log(`📡 [SMS Engine] Sending OTP ${otp} to ${phone} via ${sender}`);
        console.log("📝 [SMS Engine] Params being sent:", JSON.stringify(params, null, 2));

        const response = await axios.get("https://bulksmsplans.com/api/send_sms", { params });

        console.log("✅ [SMS Engine] Response:", response.data);
        return response.data;
    } catch (error) {
        console.error("❌ [SMS Engine] Error sending SMS:", error.message);
        if (error.response) {
            console.error("SMS Gateway response error:", error.response.data);
        }
        return null;
    }
};
