import mongoose from 'mongoose';

const dispatchRecordSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    unique: true
  },
  poParcels: {
    type: Number,
    required: true,
    min: 0
  },
  poCostPerParcel: {
    type: Number,
    required: true,
    min: 0
  },
  leopardParcels: {
    type: Number,
    required: true,
    min: 0
  },
  leopardCostPerParcel: {
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

export default mongoose.model('DispatchRecord', dispatchRecordSchema);
