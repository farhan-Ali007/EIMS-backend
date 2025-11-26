import mongoose from 'mongoose';

const parcelSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    trackingNumber: {
      type: String,
      required: true,
      trim: true,
      unique: true
    },
    address: {
      type: String,
      required: true,
      trim: true
    },
    status: {
      type: String,
      enum: ['processing', 'delivered', 'return'],
      default: 'processing'
    },
    paymentStatus: {
      type: String,
      enum: ['paid', 'unpaid'],
      default: 'unpaid'
    },
    notes: {
      type: String,
      trim: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true
    }
  },
  { timestamps: true }
);

export default mongoose.model('Parcel', parcelSchema);
