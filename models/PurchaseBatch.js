import mongoose from 'mongoose';

const purchaseBatchItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const purchaseBatchSchema = new mongoose.Schema(
  {
    batchNumber: {
      type: String,
      trim: true,
    },
    supplierName: {
      type: String,
      required: true,
      trim: true,
    },
    purchaseDate: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: String,
      trim: true,
    },
    items: {
      type: [purchaseBatchItemSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'At least one item is required in a purchase batch',
      },
    },
    totalAmount: {
      type: Number,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('PurchaseBatch', purchaseBatchSchema);
