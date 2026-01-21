import DispatchRecord from '../models/DispatchRecord.js';

const toDayRangeUTC = (ymd) => {
  const start = new Date(`${ymd}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
};

const toMonthRangeUTC = (ym) => {
  const start = new Date(`${ym}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
};

const formatYMD = (d) => {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return x.toISOString().slice(0, 10);
};

const enrich = (doc) => {
  const poParcels = Number(doc?.poParcels || 0);
  const poCostPerParcel = Number(doc?.poCostPerParcel || 0);
  const leopardParcels = Number(doc?.leopardParcels || 0);
  const leopardCostPerParcel = Number(doc?.leopardCostPerParcel || 0);

  const poTotalCost = poParcels * poCostPerParcel;
  const leopardTotalCost = leopardParcels * leopardCostPerParcel;
  const totalParcels = poParcels + leopardParcels;
  const totalCost = poTotalCost + leopardTotalCost;

  return {
    ...doc.toObject(),
    dateYMD: formatYMD(doc.date),
    poTotalCost,
    leopardTotalCost,
    totalParcels,
    totalCost,
  };
};

export const upsertDispatchRecord = async (req, res) => {
  try {
    const {
      date,
      poParcels,
      poCostPerParcel,
      leopardParcels,
      leopardCostPerParcel,
    } = req.body;

    if (!date) {
      return res.status(400).json({ message: 'Please provide date' });
    }

    const numericPoParcels = Number(poParcels);
    const numericPoCost = Number(poCostPerParcel);
    const numericLeopardParcels = Number(leopardParcels);
    const numericLeopardCost = Number(leopardCostPerParcel);

    const nums = [numericPoParcels, numericPoCost, numericLeopardParcels, numericLeopardCost];
    if (nums.some((n) => !Number.isFinite(n) || n < 0)) {
      return res.status(400).json({ message: 'All values must be non-negative numbers' });
    }

    const { start, end } = toDayRangeUTC(String(date));

    const updated = await DispatchRecord.findOneAndUpdate(
      { date: { $gte: start, $lt: end } },
      {
        date: start,
        poParcels: numericPoParcels,
        poCostPerParcel: numericPoCost,
        leopardParcels: numericLeopardParcels,
        leopardCostPerParcel: numericLeopardCost,
        createdBy: req.admin._id,
      },
      { new: true, upsert: true, runValidators: true }
    );

    return res.json({ entry: enrich(updated) });
  } catch (error) {
    console.error('Error saving dispatch record:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getDispatchRecords = async (req, res) => {
  try {
    const { date, month, limit } = req.query;

    const query = {};
    if (date) {
      const { start, end } = toDayRangeUTC(String(date));
      query.date = { $gte: start, $lt: end };
    } else if (month) {
      const { start, end } = toMonthRangeUTC(String(month));
      query.date = { $gte: start, $lt: end };
    }

    const take = Math.min(Math.max(Number(limit || 500), 1), 5000);

    const docs = await DispatchRecord.find(query)
      .sort({ date: 1 })
      .limit(take);

    const enrichedAsc = docs.map(enrich);

    return res.json(enrichedAsc.reverse());
  } catch (error) {
    console.error('Error fetching dispatch records:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};
