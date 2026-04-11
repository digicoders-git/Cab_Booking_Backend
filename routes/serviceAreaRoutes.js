const express = require("express");
const router = express.Router();
const { 
    getAllServiceAreas, createServiceArea, updateServiceArea, deleteServiceArea 
} = require("../controllers/serviceAreaController");
const { auth, adminOnly } = require("../middleware/auth");

router.get("/", auth, getAllServiceAreas);
router.post("/", auth, adminOnly, createServiceArea);
router.put("/:id", auth, adminOnly, updateServiceArea);
router.delete("/:id", auth, adminOnly, deleteServiceArea);

module.exports = router;
