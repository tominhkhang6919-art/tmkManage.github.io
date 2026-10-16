/**
 * supabaseClient.js – Khởi tạo Supabase Client
 * ==============================================
 * Lấy thông tin từ Supabase Dashboard -> Project Settings -> API
 * Biến `db` (alias `supabaseClient`) được export toàn cục để
 * các module khác (auth.js, dashboard.js) sử dụng.
 */

// ── URL dự án Supabase ──────────────────────────────────────────
const SUPABASE_URL = 'https://opwrgedhhaxonkgkxqkh.supabase.co';

// ── Anon/Public key (an toàn để nhúng vào frontend) ────────────
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wd3JnZWRoaGF4b25rZ2t4cWto' +
  'Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNDEyMTYsImV4cCI6MjEwNzcx' +
  'NzIxNn0.MdzonKnqQntXPXvh4thjbRx6UU5XHPNjJAACIIAbdgc';

/**
 * Tạo Supabase client duy nhất cho toàn ứng dụng.
 * Thư viện `supabase` được nhúng qua CDN trong từng file HTML.
 *
 * Cấu hình auth:
 *  - persistSession: true  → lưu session vào localStorage
 *  - autoRefreshToken: true → tự gia hạn token trước khi hết hạn
 *  - detectSessionInUrl: true → xử lý OAuth redirect (Google / GitHub)
 */
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'manage-money-auth',
  },
  // Realtime: bật channel để nhận thông báo real-time từ server
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

/* ── Kiểm tra kết nối (debug) ──────────────────────────────────
   Ghi log khi môi trường là development.
   Không ảnh hưởng đến production.                              */
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
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
