const express = require("express");
const router = express.Router();

const {
    createCarCategory,
    getAllActiveCategories,
    getAllCategoriesAdmin,
    updateCarCategory,
    deleteCarCategory
} = require("../controllers/carCategoryController");

const { auth, adminOnly } = require("../middleware/auth");
const upload = require("../middleware/uploadAdminImage"); // We will reuse the admin image upload middleware for car icons

// 1. Create a Category (Admin Only)
router.post("/create", auth, adminOnly, upload.single("image"), createCarCategory);

// 2. Get All Active Categories (Public for Users/Drivers)
router.get("/active", getAllActiveCategories); // No auth needed, anyone can see car categories & prices

// 3. Get All Categories for Dashboard (Admin, Vendor, Fleet)
router.get("/all", auth, getAllCategoriesAdmin);

// 4. Update an existing Category (Admin Only)
router.put("/update/:id", auth, adminOnly, upload.single("image"), updateCarCategory);

// 5. Delete a Category (Admin Only)
router.delete("/delete/:id", auth, adminOnly, deleteCarCategory);

module.exports = router;
