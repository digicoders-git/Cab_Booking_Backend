const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads");
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
    }
});

// Accept multiple car-related files in one request
const uploadCarDocs = multer({ storage }).fields([
    { name: "image",          maxCount: 1 },  // Main car / driver photo
    { name: "rcImage",        maxCount: 1 },  // RC Document
    { name: "insuranceImage", maxCount: 1 },  // Insurance / Beema
    { name: "permitImage",    maxCount: 1 },  // Permit
    { name: "pucImage",       maxCount: 1 }   // PUC
]);

module.exports = uploadCarDocs;
