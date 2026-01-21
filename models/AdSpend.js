import mongoose from 'mongoose';

const adSpendSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    unique: true
  },
  total: {
    type: Number,
    required: true,
    min: 0
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  }
}, {
  timestamps: true
});

export default mongoose.model('AdSpend', adSpendSchema);
 