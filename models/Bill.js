import mongoose from 'mongoose';

const billItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  model: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true
  },
  selectedPriceType: {
    type: String,
    enum: ['originalPrice', 'wholesalePrice', 'retailPrice', 'websitePrice'],
    required: true
  },
  selectedPrice: {
    type: Number,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  totalAmount: {
    type: Number,
    required: true
  }
});

const billSchema = new mongoose.Schema({
  billNumber: {
    type: String,
    unique: true
  },
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller',
    required: true
  },
  customer: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  items: [billItemSchema],
  subtotal: {
    type: Number,
    required: true
  },
  discount: {
    type: Number,
    default: 0
  },
  discountType: {
    type: String,
    enum: ['percentage', 'fixed'],
    default: 'percentage'
  },
  total: {
    type: Number,
    required: true
  },
  amountPaid: {
    type: Number,
    default: 0
  },
  remainingAmount: {
    type: Number,
    default: 0
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'bank_transfer', 'other'],
    default: 'cash'
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'cancelled'],
    default: 'completed'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  notes: String
}, {
  timestamps: true
});

// Generate bill number - simple global sequence like EM-0007
billSchema.pre('save', async function(next) {
  try {
    if (this.isNew && !this.billNumber) {
      // Find the last created bill (any date)
      const lastBill = await this.constructor.findOne().sort({ createdAt: -1 });

      let sequence = 1;
      if (lastBill && lastBill.billNumber) {
        const parts = String(lastBill.billNumber).split('-');
        const lastPart = parts[parts.length - 1];
        const lastSequence = parseInt(lastPart, 10);
        if (!isNaN(lastSequence)) {
          sequence = lastSequence + 1;
        }
      }

      this.billNumber = `EM-${String(sequence).padStart(4, '0')}`;
    }
    next();
  } catch (error) {
    console.error('Error generating bill number:', error);
    next(error);
  }
});

export default mongoose.model('Bill', billSchema);
