const Admin = require("../models/Admin");

/**
 * Middleware to check if the logged-in admin has specific permission
 * @param {string} requiredPermission - The permission string to check (e.g., 'DRIVER_READ')
 */
exports.checkPermission = (requiredPermission) => {
    return async (req, res, next) => {
        try {
            // 1. Check if user is logged in and has admin role
            if (!req.user || req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: "Access Denied: Admin privileges required"
                });
            }

            // 2. Fetch admin details from DB to get latest permissions
            const admin = await Admin.findById(req.user.id);
            if (!admin) {
                return res.status(404).json({
                    success: false,
                    message: "Admin account not found"
                });
            }

            // check if account is active
            if (admin.isActive === false && admin.role !== 'SuperAdmin') {
                return res.status(403).json({
                    success: false,
                    message: "⚠️ Account Locked: Your staff account is currently inactive. Please reach out to the Super Admin for activation."
                });
            }

            // 3. SuperAdmin bypasses all checks
            if (admin.role === 'SuperAdmin') {
                return next();
            }

            // 4. Check if requiredPermission exists in sub-admin's permissions array
            if (admin.permissions && admin.permissions.includes(requiredPermission)) {
                return next();
            }

            // 5. Permission denied
            return res.status(403).json({
                success: false,
                message: `🛑 Restricted Access: You don't have authorization for (${requiredPermission}). Please contact your Super Admin to request this access.`
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                message: "Internal Server Error in RBAC Middleware",
                error: error.message
            });
        }
    };
};
