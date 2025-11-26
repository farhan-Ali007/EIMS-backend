import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['online', 'offline'],
    required: true
  },
  phone: {
    type: String,
    trim: true,
    required: true
  },
  address: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

export default mongoose.model('Customer', customerSchema);
