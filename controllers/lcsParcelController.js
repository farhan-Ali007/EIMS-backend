import LcsParcel from '../models/LcsParcel.js';
import Product from '../models/Product.js';
import { lcsPost } from '../services/lcsService.js';

const pickFirst = (obj, keys) => {
  for (const k of keys) {
    if (obj && obj[k] != null && String(obj[k]).trim() !== '') return obj[k];
  }
  return undefined;
};

const chunk = (arr, size) => {
  const out = [];
  const s = Math.max(1, Number(size || 50));
  for (let i = 0; i < (arr || []).length; i += s) out.push(arr.slice(i, i + s));
  return out;
};

const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const toYmd = (value) => {
  if (!value) return '';
  const str = String(value).trim();
  if (isYmd(str)) return str;
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};
const toUtcStartOfDay = (ymd) => {
  if (!ymd) return null;
  const d = new Date(`${ymd}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

const extractRows = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.response)) return data.response;
  if (Array.isArray(data?.shipment_details)) return data.shipment_details;
  if (Array.isArray(data?.shipmentDetails)) return data.shipmentDetails;
  if (Array.isArray(data?.ShipmentDetails)) return data.ShipmentDetails;
  if (Array.isArray(data?.shipments)) return data.shipments;
  if (Array.isArray(data?.packet_list)) return data.packet_list;
  if (Array.isArray(data?.packetList)) return data.packetList;
  if (Array.isArray(data?.PacketList)) return data.PacketList;
  if (Array.isArray(data?.booked_packets)) return data.booked_packets;
  if (Array.isArray(data?.BookedPackets)) return data.BookedPackets;

  if (data && typeof data === 'object') {
    for (const v of Object.values(data)) {
      if (Array.isArray(v)) return v;
    }
  }
  return [];
};

const normalize = (row, now, adminId) => {
  const raw = row || {};
  const cn = String(
    raw.tracking_number || raw.trackingNumber || raw.booked_packet_cn || raw.bookedPacketCn || raw.CN || raw.cn || raw.cn_no || raw.cn_number || ''
  )
    .trim()
    .toUpperCase();
  if (!cn) return null;

  const bookingDate = toUtcStartOfDay(toYmd(raw.booking_date || raw.bookingDate || raw.booked_packet_date || raw.bookedPacketDate));
  const deliveryDate = toUtcStartOfDay(toYmd(raw.delivery_date || raw.deliveryDate));

  const shipperId = raw.shipper_id != null ? Number(raw.shipper_id) : undefined;
  const orderId = raw.booked_packet_order_id != null ? String(raw.booked_packet_order_id) : (raw.order_id != null ? String(raw.order_id) : undefined);

  const productDescription = raw.product_description != null
    ? String(raw.product_description)
    : (raw.productDescription != null ? String(raw.productDescription) : undefined);

  const bookedWeight = raw.booked_packet_weight != null ? Number(raw.booked_packet_weight) : undefined;
  const arrivalDispatchWeight = raw.arival_dispatch_weight != null ? Number(raw.arival_dispatch_weight) : (raw.arrival_dispatch_weight != null ? Number(raw.arrival_dispatch_weight) : undefined);
  const codValue = raw.cod_value != null
    ? Number(raw.cod_value)
    : (raw.booked_packet_collect_amount != null ? Number(raw.booked_packet_collect_amount) : undefined);

  const statusRaw = raw.title ?? raw.booked_packet_status ?? raw.status ?? raw.booked_packet_status_message;

  return {
    cn,
    bookingDate,
    deliveryDate,
    shipperId,
    orderId,
    productDescription: productDescription || undefined,
    originCity: raw.origin_city || undefined,
    destinationCity: raw.destination_city || undefined,
    consigneeName: raw.consignment_name_eng || raw.consignment_name || undefined,
    consigneePhone: raw.consignment_phone || raw.consignee_phone || undefined,
    consigneeAddress: raw.consignment_address || undefined,
    bookedWeight: Number.isFinite(bookedWeight) ? bookedWeight : undefined,
    arrivalDispatchWeight: Number.isFinite(arrivalDispatchWeight) ? arrivalDispatchWeight : undefined,
    status: statusRaw != null && String(statusRaw).trim() !== '' ? String(statusRaw) : undefined,
    codValue: Number.isFinite(codValue) ? codValue : undefined,
    raw,
    lastSyncedAt: now,
    lastSyncedBy: adminId,
  };
};

// Internal helper to perform LCS sync for a given date range
const performLcsSync = async ({ from, to, adminId }) => {
  const fromYmd = toYmd(from);
  const toYmdStr = toYmd(to);
  if (!fromYmd || !toYmdStr) {
    throw new Error('from and to dates are required (YYYY-MM-DD)');
  }

  const data = await lcsPost('getBookedPacketLastStatus', { from_date: fromYmd, to_date: toYmdStr });
  const rows = extractRows(data);

  const now = new Date();
  const normalized = (Array.isArray(rows) ? rows : [])
    .map((r) => normalize(r, now, adminId))
    .filter(Boolean);

  const byCn = new Map();
  for (const doc of normalized) {
    byCn.set(doc.cn, doc);
  }

  const docs = Array.from(byCn.values());

  if (docs.length === 0) {
    return { from_date: fromYmd, to_date: toYmdStr, synced: 0, source_rows: normalized.length };
  }

  const ops = docs.map((doc) => {
    const { cn, ...rest } = doc;
    return { updateOne: { filter: { cn }, update: { $set: { cn, ...rest } }, upsert: true } };
  });

  const result = await LcsParcel.bulkWrite(ops, { ordered: false });
  return {
    from_date: fromYmd,
    to_date: toYmdStr,
    synced: docs.length,
    source_rows: normalized.length,
    inserted: result.upsertedCount || 0,
    modified: result.modifiedCount || 0,
    matched: result.matchedCount || 0,
  };
};

export const syncLcsParcels = async (req, res) => {
  try {
    const from = toYmd(req.body?.from || req.body?.from_date || req.query?.from || req.query?.from_date);
    const to = toYmd(req.body?.to || req.body?.to_date || req.query?.to || req.query?.to_date);
    if (!from || !to) return res.status(400).json({ message: 'Please provide from and to dates (YYYY-MM-DD)' });

    const adminId = req.admin?._id;
    const result = await performLcsSync({ from, to, adminId });
    return res.json(result);
  } catch (error) {
    console.error('Error syncing LCS parcels:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getLcsParcelByCn = async (req, res) => {
  try {
    const rawCn = String(req.params.cn || '').trim().toUpperCase();
    if (!rawCn) return res.status(400).json({ message: 'CN number is required' });

    const doc = await LcsParcel.findOne({ cn: rawCn });
    if (!doc) return res.status(404).json({ message: 'Parcel not found' });

    return res.json(doc);
  } catch (error) {
    console.error('Error fetching LCS parcel by CN:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getLcsParcels = async (req, res) => {
  try {
    const from = toYmd(req.query?.from || req.query?.from_date);
    const to = toYmd(req.query?.to || req.query?.to_date);
    const limit = Math.min(Math.max(Number(req.query?.limit || 500), 1), 5000);

    const query = {};
    if (from && to) {
      const start = toUtcStartOfDay(from);
      const end = toUtcStartOfDay(to);
      if (start && end) {
        const endPlus = new Date(end);
        endPlus.setUTCDate(endPlus.getUTCDate() + 1);
        query.bookingDate = { $gte: start, $lt: endPlus };
      }
    }

    const docs = await LcsParcel.find(query)
      .sort({ bookingDate: -1, updatedAt: -1 })
      .limit(limit);

    return res.json(docs);
  } catch (error) {
    console.error('Error fetching LCS parcels:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const updateLcsParcelProducts = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: 'Parcel id is required' });

    const doc = await LcsParcel.findById(id);
    if (!doc) return res.status(404).json({ message: 'Parcel not found' });

    const incoming = Array.isArray(req.body?.products) ? req.body.products : [];
    const products = incoming
      .map((p) => ({
        productId: p?.productId || p?._id || undefined,
        name: typeof p?.name === 'string' ? p.name.trim() : '',
        quantity: Number(p?.quantity || 1) || 1,
        notes: typeof p?.notes === 'string' ? p.notes.trim() : undefined,
      }))
      .filter((p) => p.name);

    // Build quantity maps per productId for old and new lists
    const oldMap = new Map();
    const newMap = new Map();

    for (const p of Array.isArray(doc.products) ? doc.products : []) {
      if (!p?.productId) continue;
      const key = String(p.productId);
      const qty = Number(p.quantity || 0) || 0;
      if (!qty) continue;
      oldMap.set(key, (oldMap.get(key) || 0) + qty);
    }

    for (const p of products) {
      if (!p?.productId) continue;
      const key = String(p.productId);
      const qty = Number(p.quantity || 0) || 0;
      if (!qty) continue;
      newMap.set(key, (newMap.get(key) || 0) + qty);
    }

    // Apply stock adjustments: for each productId, inc stock by -(newQty - oldQty)
    const productIds = new Set([...oldMap.keys(), ...newMap.keys()]);
    for (const key of productIds) {
      const oldQty = oldMap.get(key) || 0;
      const newQty = newMap.get(key) || 0;
      const delta = newQty - oldQty;
      if (!delta) continue;

      try {
        await Product.findByIdAndUpdate(key, { $inc: { stock: -delta } });
      } catch (e) {
        console.error('Error adjusting stock for product', key, e);
      }
    }

    doc.products = products;
    await doc.save();

    return res.json(doc);
  } catch (error) {
    console.error('Error updating LCS parcel products:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Backend-only auto-sync helper: sync today's LCS parcels
export const runLcsAutoSync = async () => {
  try {
    const today = new Date();
    const ymd = today.toISOString().slice(0, 10);
    const result = await performLcsSync({ from: ymd, to: ymd, adminId: undefined });
    console.log('[LCS Auto Sync]', result);
  } catch (error) {
    console.error('[LCS Auto Sync] Error:', error);
  }
};
