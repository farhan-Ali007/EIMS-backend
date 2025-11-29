import mongoose from 'mongoose';

const incomeSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['cash', 'in_account'],
      required: true,
    },
    expectedAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    from: {
      type: String,
      required: true,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('Income', incomeSchema);
