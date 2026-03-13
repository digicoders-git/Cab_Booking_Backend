const Admin = require("../models/Admin")
// const Admin = require("../models/Admin")
const jwt = require("jsonwebtoken")

exports.registerAdmin = async (req, res) => {

    try {

        const { name, email, password } = req.body

        const image = req.file ? req.file.filename : null

        const adminExist = await Admin.findOne({ email })

        if (adminExist) {
            return res.status(400).json({
                success: false,
                message: "Admin already exists"
            })
        }

        const admin = await Admin.create({
            name,
            email,
            password,
            image
        })

        res.status(201).json({
            success: true,
            message: "Admin registered successfully",
            admin
        })

    } catch (error) {

        res.status(500).json({
            success: false,
            message: "Server error"
        })

    }

}


exports.loginAdmin = async (req, res) => {

    try {

        const { email, password } = req.body

        const admin = await Admin.findOne({ email })

        if (!admin) {
            return res.status(404).json({
                success: false,
                message: "Admin not found"
            })
        }

        if (admin.password !== password) {
            return res.status(400).json({
                success: false,
                message: "Invalid password"
            })
        }

        const token = jwt.sign(
            {
                id: admin._id,
                role: "admin"
            },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        )

        res.json({
            success: true,
            message: "Login successful",
            token,
            admin
        })

    } catch (error) {

        res.status(500).json({
            success: false,
            message: "Server error"
        })

    }

}


exports.getProfile = async (req, res) => {

    try {

        const admin = await Admin.findById(req.user.id)

        if (!admin) {
            return res.status(404).json({
                success: false,
                message: "Admin not found"
            })
        }

        res.json({
            success: true,
            admin
        })

    } catch (error) {

        res.status(500).json({
            success: false,
            message: "Server error"
        })

    }

}



exports.updateProfile = async (req, res) => {

    try {

        const { name, email, password } = req.body

        const updateData = {
            name,
            email,
            password
        }

        if (req.file) {
            updateData.image = req.file.filename
        }

        const admin = await Admin.findByIdAndUpdate(
            req.user.id,
            updateData,
            { new: true }
        )

        res.json({
            success: true,
            message: "Profile updated successfully",
            admin
        })

    } catch (error) {

        res.status(500).json({
            success: false,
            message: "Server error"
        })

    }

}