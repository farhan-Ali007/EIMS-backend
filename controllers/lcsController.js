import { getCities, getCityIdByName, lcsPost, suggestCities } from '../services/lcsService.js';

const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

const toYmd = (value) => {
  if (!value) return '';
  const str = String(value).trim();
  if (isYmd(str)) return str;
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};

const pick = (obj, keys) => {
  for (const k of keys) {
    if (obj && obj[k] != null) return obj[k];
  }
  return undefined;
};

const normalizeBookedPacketRow = (row) => {
  const cn = pick(row, ['CN', 'cn', 'cn_no', 'cn_number', 'cnNumber', 'cnNo', 'cn#', 'tracking_number', 'trackingNumber']);
  const orderId = pick(row, ['OrderID', 'order_id', 'orderId', 'order_no', 'orderNo']);
  const status = pick(row, ['Status', 'status', 'current_status', 'currentStatus', 'last_status', 'lastStatus']);
  const shipmentType = pick(row, ['ShipmentType', 'shipment_type', 'shipmentType', 'service_type', 'serviceType']);
  const from = pick(row, ['From', 'from', 'origin', 'origin_city', 'originCity', 'from_city', 'fromCity']);
  const to = pick(row, ['To', 'to', 'destination', 'destination_city', 'destinationCity', 'to_city', 'toCity']);
  const shipper = pick(row, ['Shipper', 'shipper', 'shipper_name', 'shipperName']);
  const consignee = pick(row, ['Consignee', 'consignee', 'consignee_name', 'consigneeName', 'receiver_name', 'receiverName']);
  const phone = pick(row, ['Phone1', 'phone1', 'phone', 'phone_number', 'phoneNumber', 'consignee_phone', 'consigneePhone']);

  return {
    cn,
    orderId,
    status,
    shipmentType,
    from,
    to,
    shipper,
    consignee,
    phone,
    raw: row,
  };
};

export const getLcsCities = async (req, res) => {
  try {
    const force = String(req.query.force || '') === '1';
    const cities = await getCities(force);
    return res.json(cities);
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const resolveLcsCity = async (req, res) => {
  try {
    const name = String(req.query.name || '').trim();
    if (!name) {
      return res.status(400).json({ message: 'Please provide name' });
    }

    const hit = await getCityIdByName(name);
    if (!hit) {
      return res.status(404).json({ message: 'City not found' });
    }

    return res.json(hit);
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const suggestLcsCities = async (req, res) => {
  try {
    const name = String(req.query.name || '').trim();
    if (!name) {
      return res.status(400).json({ message: 'Please provide name' });
    }
    const limit = Math.min(Math.max(Number(req.query.limit || 5), 1), 50);
    const out = await suggestCities(name, limit);
    return res.json(out);
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getBookedPacketLastStatusByDateRange = async (req, res) => {
  try {
    const from = toYmd(req.query.from || req.query.from_date);
    const to = toYmd(req.query.to || req.query.to_date);

    if (!from || !to) {
      return res.status(400).json({ message: 'Please provide from and to dates (YYYY-MM-DD)' });
    }

    const data = await lcsPost('getBookedPacketLastStatus', {
      from_date: from,
      to_date: to,
    });

    const rows = Array.isArray(data)
      ? data
      : (
        Array.isArray(data?.booked_packets)
          ? data.booked_packets
          : (
            Array.isArray(data?.BookedPackets)
              ? data.BookedPackets
              : (
                Array.isArray(data?.packet_list)
                  ? data.packet_list
                  : (
                    Array.isArray(data?.packetList)
                      ? data.packetList
                      : (Array.isArray(data?.PacketList) ? data.PacketList : [])
                  )
              )
          )
      );

    const normalized = (Array.isArray(rows) ? rows : []).map(normalizeBookedPacketRow);

    return res.json({ from_date: from, to_date: to, data, rows: normalized });
  } catch (error) {
    console.error('Error fetching booked packet last statuses:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};
