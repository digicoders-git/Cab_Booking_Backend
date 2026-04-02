const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads");
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + "_" + file.fieldname + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const uploadFleetDocs = multer({ storage }).fields([
    { name: "image",           maxCount: 1 }, // Profile Photo
    { name: "gstCertificate",  maxCount: 1 }, 
    { name: "panCard",         maxCount: 1 },
    { name: "businessLicense", maxCount: 1 }
]);

module.exports = uploadFleetDocs;
