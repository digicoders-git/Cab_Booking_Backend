const express = require("express");
const router = express.Router();
const {
    createMessage,
    getAllMessages,
    deleteMessage
} = require("../controllers/contactController");

// Public endpoints (No authentication required)
router.post("/", createMessage);
router.get("/", getAllMessages);
router.delete("/:id", deleteMessage);

module.exports = router;
