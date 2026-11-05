const mongoose = require("mongoose");

const testSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Name is required"],
            trim: true
        },
        password: {
            type: String,
            required: [true, "Password is required"]
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Test", testSchema);

