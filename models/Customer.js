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
