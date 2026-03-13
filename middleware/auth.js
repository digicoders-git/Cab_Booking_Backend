const jwt = require("jsonwebtoken");

// const jwt = require("jsonwebtoken");

const auth = (req, res, next) => {

    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            success: false,
            message: "Token not found"
        });
    }

    const token = authHeader.split(" ")[1]; // Bearer TOKEN

    try {

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        req.user = decoded;

        next();

    } catch (error) {

        return res.status(401).json({
            success: false,
            message: "Invalid token"
        });

    }

};

const adminOnly = (req, res, next) => {

    if (req.user.role !== "admin") {
        return res.status(403).json({
            success: false,
            message: "Access not Deifine"
        })
    }

    next()

}

const userOnly = (req, res, next) => {

    if (req.user.role !== "user") {
        return res.status(403).json({
            success: false,
            message: "Access not Deifine"
        })
    }

    next()

}

const driverOnly = (req, res, next) => {

    if (req.user.role !== "driver") {
        return res.status(403).json({
            success: false,
            message: "Access not Deifine"
        })
    }

    next()

}

const agentOnly = (req, res, next) => {

    if (req.user.role !== "agent") {
        return res.status(403).json({
            success: false,
            message: "Access not Deifine"
        })
    }

    next()

}

const fleetOnly = (req, res, next) => {

    if (req.user.role !== "fleet") {
        return res.status(403).json({
            success: false,
            message: "Access not Deifine"
        })
    }

    next()

}

module.exports = {
    auth,
    adminOnly,
    userOnly,
    driverOnly,
    agentOnly,
    fleetOnly
};