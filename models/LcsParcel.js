import mongoose from 'mongoose';

const LcsParcelSchema = new mongoose.Schema(
  {
    cn: {
      type: String,
      required: true,
      unique: true,
      index: true,
      set: (v) => String(v || '').trim().toUpperCase(),
    },

    bookingDate: { type: Date, index: true },
    deliveryDate: { type: Date },

    shipperId: { type: Number },
    orderId: { type: String, index: true },

    productDescription: { type: String, index: true },

    originCity: { type: String },
    destinationCity: { type: String },

    consigneeName: { type: String },
    consigneePhone: { type: String },
    consigneeAddress: { type: String },

    bookedWeight: { type: Number },
    arrivalDispatchWeight: { type: Number },

    status: { type: String, index: true },
    codValue: { type: Number },

    raw: { type: Object },

    lastSyncedAt: { type: Date },
    lastSyncedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true }
);

export default mongoose.model('LcsParcel', LcsParcelSchema);
