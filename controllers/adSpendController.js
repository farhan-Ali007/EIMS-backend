import AdSpend from '../models/AdSpend.js';

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

export const upsertAdSpend = async (req, res) => {
  try {
    const { date, total } = req.body;

    if (!date || total == null) {
      return res.status(400).json({ message: 'Please provide date and total' });
    }

    const numericTotal = Number(total);
    if (!Number.isFinite(numericTotal) || numericTotal < 0) {
      return res.status(400).json({ message: 'Total must be a non-negative number' });
    }

    const { start, end } = toDayRangeUTC(String(date));

    const prev = await AdSpend.findOne({ date: { $lt: start } }).sort({ date: -1 });
    const previousTotal = Number(prev?.total || 0);
    const todaySpend = Math.max(0, numericTotal - previousTotal);

    const updated = await AdSpend.findOneAndUpdate(
      { date: { $gte: start, $lt: end } },
      {
        date: start,
        total: numericTotal,
        createdBy: req.admin._id,
      },
      { new: true, upsert: true, runValidators: true }
    );

    return res.json({
      entry: {
        ...updated.toObject(),
        dateYMD: formatYMD(updated.date),
      },
      previousTotal,
      todaySpend,
    });
  } catch (error) {
    console.error('Error saving ad spend:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getAdSpends = async (req, res) => {
  try {
    const { date, month, limit } = req.query;

    const query = {};
    let rangeStart = null;
    if (date) {
      const { start, end } = toDayRangeUTC(String(date));
      query.date = { $gte: start, $lt: end };
      rangeStart = start;
    } else if (month) {
      const { start, end } = toMonthRangeUTC(String(month));
      query.date = { $gte: start, $lt: end };
      rangeStart = start;
    }

    const take = Math.min(Math.max(Number(limit || 500), 1), 5000);

    const docs = await AdSpend.find(query)
      .sort({ date: 1 })
      .limit(take);

    let prevTotal = 0;
    if (rangeStart) {
      const prev = await AdSpend.findOne({ date: { $lt: rangeStart } }).sort({ date: -1 });
      prevTotal = Number(prev?.total || 0);
    }
    const enrichedAsc = docs.map((d) => {
      const total = Number(d?.total || 0);
      const dailySpend = Math.max(0, total - prevTotal);
      const out = {
        ...d.toObject(),
        dateYMD: formatYMD(d.date),
        previousTotal: prevTotal,
        dailySpend,
      };
      prevTotal = total;
      return out;
    });

    return res.json(enrichedAsc.reverse());
  } catch (error) {
    console.error('Error fetching ad spends:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};
