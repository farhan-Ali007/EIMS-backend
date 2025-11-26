import Admin from '../models/Admin.js';

// Get list of admins (for role management)
export const getAdmins = async (req, res) => {
  try {
    // Exclude currently logged-in admin from the list
    const currentAdminId = req.admin?._id;

    const query = currentAdminId ? { _id: { $ne: currentAdminId } } : {};

    const admins = await Admin.find(query)
      .select('username email role createdAt')
      .sort({ createdAt: -1 });

    res.json(admins);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update admin role (admin <-> manager)
export const updateAdminRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    // Only allow specific roles to be set via this endpoint
    const allowedRoles = ['admin', 'manager'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ message: 'Invalid role. Only admin or manager are allowed here.' });
    }

    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    admin.role = role;
    await admin.save();

    res.json({
      message: 'Role updated successfully',
      admin: {
        _id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
