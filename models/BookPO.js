import mongoose from 'mongoose';

const bookPOSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      trim: true,
      unique: true,
      index: true,
    },
    seq: {
      type: Number,
      index: true,
    },
    toName: {
      type: String,
      required: true,
      trim: true,
    },
    toPhone: {
      type: String,
      required: true,
      trim: true,
    },
    toAddress: {
      type: String,
      required: true,
      trim: true,
    },
    weight: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('BookPO', bookPOSchema);
