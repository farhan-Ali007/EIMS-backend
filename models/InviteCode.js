import mongoose from 'mongoose';

const inviteCodeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true
    }
  },
  { timestamps: true }
);

export default mongoose.model('InviteCode', inviteCodeSchema);
