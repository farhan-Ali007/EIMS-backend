import mongoose from 'mongoose';

const customerProductInfoSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    name: {
      type: String
    },
    model: {
      type: String
    },
    quantity: {
      type: Number,
      min: 1,
      default: 1
    }
  },
  { _id: false }
);

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
  product: {
    type: String
  },
  productInfo: {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    name: {
      type: String
    },
    model: {
      type: String
    }
  },
  productsInfo: {
    type: [customerProductInfoSchema],
    default: undefined
  },
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller',
  },
  price:{
    type: Number,
    min: 0
  },
  phone: {
    type: String,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  customDate: {
    type: Date
  }
}, {
  timestamps: true
});

export default mongoose.model('Customer', customerSchema);
