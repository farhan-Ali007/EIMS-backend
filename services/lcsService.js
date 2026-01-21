import axios from 'axios';

let citiesCache = {
  fetchedAt: 0,
  list: [],
};

const TTL_MS = Number(process.env.LCS_CITIES_TTL_MS || 24 * 60 * 60 * 1000);

function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function loadAliases() {
  const raw = process.env.LCS_CITY_ALIASES_JSON;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    const out = {};
    for (const [k, v] of Object.entries(parsed)) {
      out[normalize(k)] = v;
    }
    return out;
  } catch {
    return {};
  }
}

let aliases = loadAliases();

function setAliases(map) {
  aliases = map || {};
}

function getBase() {
  const baseRaw = process.env.LCS_BASE_URL;
  if (!baseRaw) throw new Error('LCS_BASE_URL missing');
  return String(baseRaw).endsWith('/') ? String(baseRaw) : `${String(baseRaw)}/`;
}

function getAuthPayload() {
  const key = process.env.LCS_API_KEY;
  const pass = process.env.LCS_API_PASSWORD;
  if (!key || !pass) throw new Error('LCS_API_KEY or LCS_API_PASSWORD missing');
  return { api_key: key, api_password: pass };
}

async function lcsPost(method, payload, options = {}) {
  const base = getBase();
  const url = `${base}${method}/format/json/`;

  const timeout = Number(options.timeout || 20000);
  const auth = getAuthPayload();

  const merged = { ...auth, ...(payload || {}) };

  try {
    const res = await axios.post(url, merged, { timeout });
    return res?.data;
  } catch (error) {
    const status = error?.response?.status;
    if (status === 405) {
      const res = await axios.get(url, { params: merged, timeout });
      return res?.data;
    }
    throw error;
  }
}

async function fetchCities() {
  const data = await lcsPost('getAllCities', {});
  const cities = Array.isArray(data) ? data : (Array.isArray(data?.cities) ? data.cities : []);
  citiesCache = { fetchedAt: Date.now(), list: cities };
  return cities;
}

async function getCities(force = false) {
  const expired = Date.now() - citiesCache.fetchedAt > TTL_MS;
  if (force || expired || !Array.isArray(citiesCache.list) || citiesCache.list.length === 0) {
    await fetchCities();
  }
  return citiesCache.list || [];
}

async function getCityIdByName(name) {
  const list = await getCities();
  const target = normalize(name);
  if (!target) return null;

  if (aliases && Object.prototype.hasOwnProperty.call(aliases, target)) {
    return { id: aliases[target], method: 'alias', name: target, raw: { alias: target } };
  }

  let best = null;
  let method = 'exact';

  for (const c of list) {
    const cname = normalize(c.CityName || c.city_name || c.name);
    if (cname === target) {
      best = c;
      method = 'exact';
      break;
    }
  }

  if (!best) {
    for (const c of list) {
      const cname = normalize(c.CityName || c.city_name || c.name);
      if (cname.startsWith(target) || target.startsWith(cname)) {
        best = c;
        method = 'fuzzy';
        break;
      }
    }
  }

  if (!best) return null;

  const id = best.CityID || best.city_id || best.id || best.CityId || null;
  const bestName = best.CityName || best.city_name || best.name || null;

  return id ? { id, method, name: bestName, raw: best } : null;
}

function jaccardTokens(a, b) {
  const as = new Set(String(a).split(' ').filter(Boolean));
  const bs = new Set(String(b).split(' ').filter(Boolean));
  const inter = new Set([...as].filter((x) => bs.has(x))).size;
  const union = new Set([...as, ...bs]).size || 1;
  return inter / union;
}

async function suggestCities(name, limit = 5) {
  const list = await getCities();
  const target = normalize(name);
  if (!target) return [];

  const scored = [];
  for (const c of list) {
    const cname = normalize(c.CityName || c.city_name || c.name);
    let score = 0;
    if (cname === target) score = 1;
    else if (cname.startsWith(target) || target.startsWith(cname)) score = 0.9;
    else if (cname.includes(target) || target.includes(cname)) score = 0.8;
    else score = jaccardTokens(cname, target) * 0.75;

    scored.push({
      score,
      id: c.CityID || c.city_id || c.id || c.CityId || null,
      name: c.CityName || c.city_name || c.name || '',
      raw: c,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.filter((s) => s.id).slice(0, limit);
}

export { getCities, getCityIdByName, suggestCities, setAliases, normalize, lcsPost };
