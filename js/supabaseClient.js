/**
 * supabaseClient.js – Khởi tạo Supabase Client
 * ==============================================
 * Lấy thông tin từ Supabase Dashboard -> Project Settings -> API
 * Biến `db` (alias `supabaseClient`) được export toàn cục để
 * các module khác (auth.js, dashboard.js) sử dụng.
 */


/**
 * Tạo Supabase client duy nhất cho toàn ứng dụng.
 * Thư viện `supabase` được nhúng qua CDN trong từng file HTML.
 *
 * Cấu hình auth:
 *  - persistSession: true  → lưu session vào localStorage
 *  - autoRefreshToken: true → tự gia hạn token trước khi hết hạn
 *  - detectSessionInUrl: true → xử lý OAuth redirect (Google / GitHub)
 */

const SUPABASE_URL = window.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || '';
const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

if (supabaseConfigured && !window.supabase) {
  throw new Error('Không tải được thư viện Supabase. Hãy kiểm tra CDN.');
}

if (supabaseConfigured && !window.db) {
  window.db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'manage-money-auth',
      },
      realtime: {
        params: { eventsPerSecond: 10 },
      },
    }
  );
}

const db = window.db || null;

if (!supabaseConfigured) {
  console.warn('[SupabaseClient] Supabase is not configured; browser storage will be used.');
} else if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  console.info('[SupabaseClient] Connected to:', SUPABASE_URL);
}

const TABLES = {
  TRANSACTIONS: 'transactions',
  PROFILES: 'profiles',
  NOTIFICATIONS: 'notifications',
};

const REGIONS = {
  VN: { name: '🇻🇳 Việt Nam', currency: 'VND', locale: 'vi-VN', unit: 'VND', step: 1000 },
  US: { name: '🇺🇸 Hoa Kỳ', currency: 'USD', locale: 'en-US', unit: 'USD', step: 0.01 },
  UK: { name: '🇬🇧 Anh', currency: 'GBP', locale: 'en-GB', unit: 'GBP', step: 0.01 },
  EU: { name: '🇪🇺 Châu Âu (EUR)', currency: 'EUR', locale: 'de-DE', unit: 'EUR', step: 0.01 },
  CN: { name: '🇨🇳 Trung Quốc', currency: 'CNY', locale: 'zh-CN', unit: 'CNY', step: 0.01 },
  JP: { name: '🇯🇵 Nhật Bản', currency: 'JPY', locale: 'ja-JP', unit: 'JPY', step: 1 },
  KR: { name: '🇰🇷 Hàn Quốc', currency: 'KRW', locale: 'ko-KR', unit: 'KRW', step: 1 },
  DE: { name: '🇩🇪 Đức', currency: 'EUR', locale: 'de-DE', unit: 'EUR', step: 0.01 },
};

/**
 * formatCurrency(amount, regionKey)
 * Định dạng số tiền theo vùng được chọn.
 * @param {number} amount - Số tiền cần định dạng
 * @param {string} regionKey - Mã vùng (VN, US, JP, ...)
 * @returns {string} Chuỗi tiền tệ đã định dạng
 */
function formatCurrency(amount, regionKey = 'VN') {
  const region = REGIONS[regionKey] || REGIONS.VN;
  try {
    return new Intl.NumberFormat(region.locale, {
      style: 'currency',
      currency: region.currency,
      maximumFractionDigits: region.currency === 'VND' || region.currency === 'JPY' || region.currency === 'KRW' ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString()} ${region.unit}`;
  }
}

/**
 * parseCurrencyInput(value)
 * Chuyển chuỗi nhập từ input thành số.
 * Xử lý dấu chấm/phẩy ngăn cách nghìn.
 * @param {string} value
 * @returns {number}
 */
function parseCurrencyInput(value) {
  // Xoá tất cả ký tự không phải chữ số và dấu thập phân
  const cleaned = String(value).replace(/[^\d.]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * formatNumberInput(value)
 * Định dạng số trong ô input (thêm dấu chấm mỗi 3 chữ số).
 * @param {string|number} value
 * @returns {string}
 */
function formatNumberInput(value) {
  const num = String(value).replace(/\D/g, '');
  return num.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
