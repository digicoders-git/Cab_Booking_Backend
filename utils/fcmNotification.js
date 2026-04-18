const admin = require("../config/firebaseAdmin");

/**
 * Send a push notification to a specific device token
 * @param {string} token - The FCM registration token
 * @param {object} payload - { title, body, data }
 */
const sendPushNotification = async (token, payload) => {
  if (!token) return null;
  const message = {
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: {
      ...(payload.data || {}),
      title: payload.title,
      body: payload.body,
    },
    token: token,
  };
  try {
    return await admin.messaging().send(message);
  } catch (error) {
    console.error("FCM Token Error:", error.message);
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
    notification: {
      title: payload.title,
      body: payload.body,
    },
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
      notification: {
        title: payload.title,
        body: payload.body,
      },
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
