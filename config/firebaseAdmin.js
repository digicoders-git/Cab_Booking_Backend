const admin = require("firebase-admin");
const dotenv = require("dotenv");

dotenv.config();

try {
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  console.log("🔍 Checking Firebase Config...");
  console.log("Project ID:", process.env.FIREBASE_PROJECT_ID);
  console.log("Client Email:", process.env.FIREBASE_CLIENT_EMAIL);
  
  if (privateKey) {
    console.log("✅ Private Key found in .env");
    // 1. Strip literal quotes if present (common .env issue)
    privateKey = privateKey.replace(/^"|"$/g, '');
    // 2. Replace escaped newlines with real newlines
    privateKey = privateKey.replace(/\\n/g, '\n');
  } else {
    console.error("❌ ERROR: FIREBASE_PRIVATE_KEY is MISSING in .env!");
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
    });
    console.log("Firebase Admin SDK initialized successfully! 🔥");
  }
} catch (error) {
  console.error("Firebase Admin initialization error Details:", error);
  console.error("Firebase Admin initialization error message:", error.message);
}

module.exports = admin;
