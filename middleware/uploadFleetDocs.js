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

const uploadFleetDocs = multer({ storage }).fields([
    { name: "image",           maxCount: 1 }, // Profile Photo
    { name: "gstCertificate",  maxCount: 1 }, 
    { name: "panCard",         maxCount: 1 },
    { name: "businessLicense", maxCount: 1 }
]);

module.exports = uploadFleetDocs;
