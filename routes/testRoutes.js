const express = require("express");
const router = express.Router();
const {
    createTest,
    getAllTests,
    deleteTest
} = require("../controllers/testController");

// Public test endpoints to check live server & DB
router.post("/", createTest);
router.get("/", getAllTests);
router.delete("/:id", deleteTest);

module.exports = router;
