const DriverLead = require('../models/DriverLead');

// Create a new lead (when driver starts registration but hasn't submitted yet)
exports.createLead = async (req, res) => {
  try {
    const { name, mobile, email } = req.body;
    
    if (!name || !mobile) {
      return res.status(400).json({ success: false, message: 'Name and Mobile are required' });
    }

    // Check if lead already exists for this mobile
    let lead = await DriverLead.findOne({ mobile, status: 'INCOMPLETE_REGISTRATION' });
    if (lead) {
      // Update existing lead
      lead.name = name;
      if (email) lead.email = email;
      await lead.save();
      return res.status(200).json({ success: true, message: 'Lead updated', lead });
    }

    lead = new DriverLead({ name, mobile, email });
    await lead.save();
    
    res.status(201).json({ success: true, message: 'Lead created successfully', lead });
  } catch (error) {
    console.error('Error creating driver lead:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Get all incomplete leads for Admin Panel
exports.getLeads = async (req, res) => {
  try {
    const leads = await DriverLead.find({ status: 'INCOMPLETE_REGISTRATION' }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, leads });
  } catch (error) {
    console.error('Error fetching driver leads:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Delete a driver lead by ID
exports.deleteLead = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedLead = await DriverLead.findByIdAndDelete(id);
    if (!deletedLead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    res.status(200).json({ success: true, message: 'Lead deleted successfully' });
  } catch (error) {
    console.error('Error deleting driver lead:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
