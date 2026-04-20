const admin = require("../config/firebaseAdmin");

/**
 * Send a push notification to a specific device token
 * @param {string} token - The FCM registration token
 * @param {object} payload - { title, body, data }
 */
const sendPushNotification = async (token, payload) => {
  if (!token) return null;
  const message = {
    // 🔕 REMOVED 'notification' key to prevent duplicate/default notifications
    // Only 'data' is sent so the frontend/service-worker can show a custom notification with buttons.
    data: {
      ...(payload.data || {}),
      title: payload.title,
      body: payload.body,
    },
    token: token,
  };
  try {
    const response = await admin.messaging().send(message);
    console.log("🚀 FCM Dispatch Success (Data-Only):", response);
    return response;
  } catch (error) {
    console.error("❌ FCM Dispatch Failed for token:", token.slice(0, 10) + "...");
    console.error("🔥 Error Detail:", error.message);
    return null;
  }
};

/**
 * Send a push notification to a specific TOPIC (e.g., 'all', 'driver', 'fleet')
 * @param {string} topic - The topic name
 * @param {object} payload - { title, body, data }
 */
const sendTopicNotification = async (topic, payload) => {
  const message = {
    data: {
      ...(payload.data || {}),
      title: payload.title,
      body: payload.body,
    },
    topic: topic,
  };
  try {
    const response = await admin.messaging().send(message);
    console.log(`Topic Notification Sent (${topic}):`, response);
    return response;
  } catch (error) {
    console.error("FCM Topic Error:", error.message);
    return null;
  }
};

/**
 * Send a push notification to MULTIPLE TOPICS using conditions
 * @param {string} condition - e.g., "'fleet' in topics || 'driver' in topics"
 */
const sendConditionNotification = async (condition, payload) => {
    const message = {
      data: {
        ...(payload.data || {}),
        title: payload.title,
        body: payload.body,
      },
      condition: condition,
    };
    try {
      return await admin.messaging().send(message);
    } catch (error) {
      console.error("FCM Condition Error:", error.message);
      return null;
    }
  };

/**
 * Subscribe a token to a specific topic
 */
const subscribeToTopic = async (token, topic) => {
    try {
        await admin.messaging().subscribeToTopic(token, topic);
        console.log(`Token subscribed to topic: ${topic}`);
    } catch (error) {
        console.error("FCM Subscription Error:", error.message);
    }
};

module.exports = { 
    sendPushNotification, 
    sendTopicNotification,
    sendConditionNotification,
    subscribeToTopic
};
