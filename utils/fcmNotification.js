const admin = require("../config/firebaseAdmin");

/**
 * Send a push notification to a specific device token
 * @param {string} token - The FCM registration token of the device
 * @param {object} payload - The notification payload { title, body, data }
 */
const sendPushNotification = async (token, payload) => {
  if (!token) {
    console.log("No FCM token provided, skipping notification.");
    return null;
  }

  const message = {
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: payload.data || {},
    token: token,
  };

  try {
    const response = await admin.messaging().send(message);
    console.log("Successfully sent FCM message:", response);
    return response;
  } catch (error) {
    console.error("Error sending FCM message:", error);
    // If the token is invalid or expired, we should handle it (optionally remove from DB)
    return null;
  }
};

module.exports = { sendPushNotification };
