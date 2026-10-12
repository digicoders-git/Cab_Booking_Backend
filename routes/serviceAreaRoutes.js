const express = require("express");
const router = express.Router();
const { 
    getAllServiceAreas, createServiceArea, updateServiceArea, deleteServiceArea 
} = require("../controllers/serviceAreaController");
const { auth, adminOnly } = require("../middleware/auth");
const { checkPermission } = require("../middleware/rbac");

router.get("/", auth, checkPermission("SERVICE_AREA_READ"), getAllServiceAreas);
router.post("/", auth, checkPermission("SERVICE_AREA_CREATE"), createServiceArea);
router.put("/:id", auth, checkPermission("SERVICE_AREA_EDIT"), updateServiceArea);
router.delete("/:id", auth, checkPermission("SERVICE_AREA_DELETE"), deleteServiceArea);

module.exports = router;
