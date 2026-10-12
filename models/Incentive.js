const mongoose = require('mongoose');

const incentiveSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String },
    targetType: { 
        type: String, 
        enum: ['All', 'Normal', 'Fixed', 'Rental', 'Bulk'], 
        default: 'All' 
    },
    targetCount: { type: Number, required: true },
    rewardAmount: { type: Number, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
}, { timestamps: true });

module.exports = mongoose.model('Incentive', incentiveSchema);
