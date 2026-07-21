const mongoose = require('mongoose');

const driverLeadSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  mobile: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['INCOMPLETE_REGISTRATION', 'CONVERTED', 'CONTACTED'],
    default: 'INCOMPLETE_REGISTRATION'
  }
}, { timestamps: true });

module.exports = mongoose.model('DriverLead', driverLeadSchema);
