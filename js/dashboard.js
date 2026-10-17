/**
 * dashboard.js – Logic trang quản lý thu chi
 * ============================================
 * Xử lý:
 *  1. Khởi tạo trang (init) – tạo phiên ẩn danh, load dữ liệu
 *  2. Hiển thị số dư, tổng thu, tổng chi
 *  3. Thêm giao dịch thu / chi
 *  4. Sửa / xóa giao dịch
 *  5. Lọc & sắp xếp danh sách giao dịch
 *  6. Cài đặt: theme, vùng tiền tệ, avatar, tên người dùng
 *  7. Realtime subscription: cập nhật dữ liệu
 *  8. Thông báo (Notifications)
 */

/* ══════════════════════════════════════════════════════════════
   STATE – Trạng thái toàn cục của trang dashboard
   ══════════════════════════════════════════════════════════════ */
const State = {
  user:           null,      // Đối tượng user hiện tại
  profile:        null,      // Profile từ bảng profiles
  transactions:   [],        // Danh sách giao dịch
  filtered:       [],        // Danh sách sau khi lọc/sắp xếp
  region:         'VN',      // Vùng tiền tệ mặc định
  theme:          'blue',    // Theme màu sắc
  balanceVisible: true,      // Ẩn/hiện số dư
  filterType:     'all',     // 'all' | 'income' | 'expense'
  sortBy:         'newest',  // 'newest' | 'oldest' | 'highest' | 'lowest'
  summaryPeriod:  'month',   // 'day' | 'month' | 'year'
  notifications:  [],        // Danh sách thông báo
  unreadCount:    0,         // Số thông báo chưa đọc
  currentPage:    1,         // Trang hiện tại (phân trang)
  pageSize:       10,        // Số giao dịch mỗi trang
  editingId:      null,      // ID giao dịch đang sửa
};

/* ══════════════════════════════════════════════════════════════
   PHẦN 1: KHỞI TẠO
   ══════════════════════════════════════════════════════════════ */
const db = window.db;

if (!db) {
  throw new Error(
    'db chưa được khởi tạo. Kiểm tra js/supabaseClient.js'
  );
}
/**
 * init()
 * Điểm vào (entry point) của dashboard.
 * Gọi khi DOM đã sẵn sàng (DOMContentLoaded).
 */
async function init() {
  try {
    State.user = await getOrCreateSessionUser();
    State.profile = await getProfile(State.user.id);

    applyStoredSettings();
    renderUserInfo();
    await loadTransactions();
    await loadNotifications();
    bindEvents();
    subscribeRealtime();
  } catch (error) {
    console.error('[Dashboard] Initialization failed:', error);
    const schemaIsIncomplete = ['PGRST205', 'PGRST204', '42703', '42P10'].includes(error.code);
    const message = schemaIsIncomplete
      ? 'Schema Supabase chưa đầy đủ. Hãy chạy toàn bộ supabase_schema.sql trong SQL Editor rồi tải lại trang.'
      : 'Không thể khởi tạo ứng dụng: ' + (error.message || 'Lỗi kết nối Supabase.');
    showToast(message, 'error');
  } finally {
    hidePageLoader();
  }
}

/* ══════════════════════════════════════════════════════════════
   PHẦN 2: CÀI ĐẶT (Theme, Vùng, Avatar)
   ══════════════════════════════════════════════════════════════ */

/**
 * applyStoredSettings()
 * Lấy cài đặt đã lưu từ localStorage (hoặc profile Supabase)
 * và áp dụng vào trang.
 */
function applyStoredSettings() {
  // Ưu tiên dữ liệu từ Supabase profile, fallback sang localStorage
  const savedRegion = State.profile?.region || localStorage.getItem('region') || 'VN';
  const savedTheme  = State.profile?.theme  || localStorage.getItem('theme')  || 'blue';

  State.region = savedRegion;
  State.theme  = savedTheme;

  // Áp dụng theme lên document
  applyTheme(savedTheme);

  // Cập nhật UI cài đặt
  const regionSelect = document.getElementById('setting-region');
  if (regionSelect) regionSelect.value = savedRegion;

  document.querySelectorAll('.swatch').forEach(sw => {
    sw.classList.toggle('active', sw.dataset.theme === savedTheme);
  });
}

/**
 * applyTheme(themeName)
 * Đặt data-theme attribute lên <html> để kích hoạt CSS variables.
 * @param {'blue'|'green'|'yellow'} themeName
 */
function applyTheme(themeName) {
  const map = { blue: '', green: 'green', yellow: 'yellow' };
  const attr = map[themeName] || '';
  if (attr) {
    document.documentElement.setAttribute('data-theme', attr);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  State.theme = themeName;
  localStorage.setItem('theme', themeName);

  if (State.user) {
    if (isLocalStorageMode()) {
      updateLocalProfile({ theme: themeName });
    } else {
      db.from(TABLES.PROFILES).update({ theme: themeName }).eq('id', State.user.id);
    }
  }
}

/**
 * applyRegion(regionKey)
 * Thay đổi vùng tiền tệ và re-render toàn bộ giá trị tiền.
 * @param {string} regionKey - Mã vùng (VN, US, ...)
 */
async function applyRegion(regionKey) {
  State.region = regionKey;
  localStorage.setItem('region', regionKey);

  // Cập nhật placeholder input
  updateAmountPlaceholders();

  // Render lại tất cả giá trị tiền
  renderBalance();
  renderSummary();
  renderTransactionList();

  if (State.user) {
    if (isLocalStorageMode()) {
      updateLocalProfile({ region: regionKey });
    } else {
      await db.from(TABLES.PROFILES).update({ region: regionKey }).eq('id', State.user.id);
    }
  }
}

/**
 * updateAmountPlaceholders()
 * Cập nhật placeholder và step của input tiền theo vùng đã chọn.
 */
function updateAmountPlaceholders() {
  const region = REGIONS[State.region] || REGIONS.VN;
  const examples = {
    VN: 'Ví dụ: 500.000',
    US: 'Ví dụ: 100.00',
    JP: 'Ví dụ: 10000',
    KR: 'Ví dụ: 50000',
  };
  const placeholder = examples[State.region] || `Ví dụ: 100`;

  document.querySelectorAll('.input-amount').forEach(inp => {
    inp.placeholder = placeholder;
    inp.step = region.step;
  });

  // Hiển thị đơn vị tiền tệ
  document.querySelectorAll('.currency-unit').forEach(el => {
    el.textContent = region.currency;
  });
}

/* ══════════════════════════════════════════════════════════════
   PHẦN 3: HIỂN THỊ THÔNG TIN NGƯỜI DÙNG
   ══════════════════════════════════════════════════════════════ */

/**
 * renderUserInfo()
 * Hiển thị avatar, tên người dùng lên nav và profile card.
 */
function renderUserInfo() {
  const profile = State.profile;
  const user    = State.user;

  const name   = profile?.display_name || user?.user_metadata?.full_name || 'Người dùng';
  const avatar = profile?.avatar_url   || user?.user_metadata?.avatar_url || '';

  // --- Nav avatar ---
  const navAvatar = document.getElementById('nav-avatar');
  if (navAvatar) {
    if (avatar) {
      navAvatar.innerHTML = `<img src="${avatar}" alt="${name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else {
      navAvatar.textContent = name.charAt(0).toUpperCase();
    }
  }

  // --- Profile card ---
  const profileAvatar = document.getElementById('profile-avatar');
  const profileName   = document.getElementById('profile-name');

  if (profileAvatar) {
    if (avatar) {
      profileAvatar.innerHTML = `<img src="${avatar}" alt="${name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else {
      profileAvatar.textContent = name.charAt(0).toUpperCase();
    }
  }
  if (profileName) profileName.textContent = name;

  // --- Settings panel ---
  const settingName = document.getElementById('setting-display-name');
  if (settingName) settingName.value = name;
}

/* ══════════════════════════════════════════════════════════════
   PHẦN 4: TẢI & HIỂN THỊ GIAO DỊCH
   ══════════════════════════════════════════════════════════════ */

/**
 * loadTransactions()
 * Lấy tất cả giao dịch của user từ Supabase và lưu vào State.
 */
async function loadTransactions() {
  showSkeletons();

  if (isLocalStorageMode()) {
    State.transactions = getLocalTransactions();
    applyFiltersAndSort();
    renderBalance();
    renderSummary();
    return;
  }

  const { data, error } = await db
    .from(TABLES.TRANSACTIONS)
    .select('*')
    .eq('user_id', State.user.id)
    .order('transaction_date', { ascending: false });

  if (error) {
    showToast('Không thể tải dữ liệu: ' + error.message, 'error');
    return;
  }

  State.transactions = data || [];

  // Render ngay sau khi tải xong
  applyFiltersAndSort();
  renderBalance();
  renderSummary();
}

/**
 * applyFiltersAndSort()
 * Lọc và sắp xếp State.transactions → State.filtered.
 * Sau đó gọi renderTransactionList().
 */
function applyFiltersAndSort() {
  let list = [...State.transactions];

  // ── Lọc theo loại ──
  if (State.filterType === 'income')  list = list.filter(t => t.type === 'income');
  if (State.filterType === 'expense') list = list.filter(t => t.type === 'expense');

  // ── Sắp xếp ──
  switch (State.sortBy) {
    case 'newest':  list.sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date)); break;
    case 'oldest':  list.sort((a, b) => new Date(a.transaction_date) - new Date(b.transaction_date)); break;
    case 'highest': list.sort((a, b) => b.amount - a.amount); break;
    case 'lowest':  list.sort((a, b) => a.amount - b.amount); break;
  }

  State.filtered = list;
  State.currentPage = 1; // Reset về trang đầu khi filter thay đổi
  renderTransactionList();
}

/**
 * renderTransactionList()
 * Vẽ danh sách giao dịch lên DOM với phân trang.
 */
function renderTransactionList() {
  const container = document.getElementById('transaction-list');
  const paginationEl = document.getElementById('pagination');
  if (!container) return;

  const { filtered, currentPage, pageSize } = State;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const start = (currentPage - 1) * pageSize;
  const paginated = filtered.slice(start, start + pageSize);

  // ── Empty state ──
  if (paginated.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <div class="empty-state-text">Chưa có giao dịch nào</div>
      </div>`;
    if (paginationEl) paginationEl.innerHTML = '';
    return;
  }

  // ── Render từng giao dịch ──
  container.innerHTML = paginated.map(t => transactionItemHTML(t)).join('');

  // ── Phân trang ──
  renderPagination(paginationEl, totalPages);
}

/**
 * transactionItemHTML(t)
 * Tạo HTML cho một dòng giao dịch.
 * @param {Object} t - Đối tượng giao dịch từ Supabase
 * @returns {string} HTML string
 */
function transactionItemHTML(t) {
  const isIncome = t.type === 'income';
  const sign     = isIncome ? '+' : '-';
  const cls      = isIncome ? 'income' : 'expense';
  const icon     = getCategoryIcon(t.category, t.type);
  const amount   = formatCurrency(t.amount, State.region);
  const dateStr  = formatDate(t.transaction_date);

  return `
    <div class="transaction-item slide-up" data-id="${t.id}">
      <div class="transaction-icon ${cls}">${icon}</div>
      <div class="transaction-info">
        <div class="transaction-reason">${escapeHTML(t.reason || t.category || 'Khác')}</div>
        <div class="transaction-date">${dateStr}</div>
      </div>
      <div class="transaction-amount ${cls}">${sign}${amount}</div>
      <div class="transaction-actions">
        <button class="btn-icon" onclick="openEditModal('${t.id}')" data-tooltip="Sửa">✏️</button>
        <button class="btn-icon" onclick="confirmDelete('${t.id}')" data-tooltip="Xóa" style="background:var(--danger-bg);color:var(--danger)">🗑️</button>
      </div>
    </div>`;
}

/**
 * renderPagination(container, totalPages)
 * Vẽ các nút phân trang.
 */
function renderPagination(container, totalPages) {
  if (!container || totalPages <= 1) {
    if (container) container.innerHTML = '';
    return;
  }

  let html = '';
  // Nút Trước
  html += `<button class="page-btn" onclick="goPage(${State.currentPage - 1})" ${State.currentPage === 1 ? 'disabled' : ''}>‹</button>`;

  // Số trang
  for (let i = 1; i <= totalPages; i++) {
    if (
      i === 1 || i === totalPages ||
      (i >= State.currentPage - 1 && i <= State.currentPage + 1)
    ) {
      html += `<button class="page-btn ${i === State.currentPage ? 'active' : ''}" onclick="goPage(${i})">${i}</button>`;
    } else if (i === State.currentPage - 2 || i === State.currentPage + 2) {
      html += `<span style="padding:0 4px;color:var(--text-muted)">…</span>`;
    }
  }

  // Nút Sau
  html += `<button class="page-btn" onclick="goPage(${State.currentPage + 1})" ${State.currentPage === totalPages ? 'disabled' : ''}>›</button>`;

  container.innerHTML = `<div class="pagination">${html}</div>`;
}

/**
 * goPage(page)
 * Chuyển đến trang phân trang.
 * @param {number} page
 */
function goPage(page) {
  const totalPages = Math.ceil(State.filtered.length / State.pageSize);
  if (page < 1 || page > totalPages) return;
  State.currentPage = page;
  renderTransactionList();
  // Scroll lên đầu danh sách
  document.getElementById('transaction-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ══════════════════════════════════════════════════════════════
   PHẦN 5: TÍNH TOÁN & HIỂN THỊ SỐ DƯ, TỔNG KẾT
   ══════════════════════════════════════════════════════════════ */

/**
 * renderBalance()
 * Tính và hiển thị số dư hiện tại (Thu - Chi).
 */
function renderBalance() {
  const totalIncome  = State.transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpense = State.transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance      = totalIncome - totalExpense;

  const balanceEl = document.getElementById('balance-amount');
  if (balanceEl) {
    balanceEl.textContent   = State.balanceVisible ? formatCurrency(balance, State.region) : '••••••••';
    balanceEl.className     = `balance-amount ${balance < 0 ? 'negative' : ''}`;
    balanceEl.classList.add('number-change');
    setTimeout(() => balanceEl.classList.remove('number-change'), 400);
  }

  // Cập nhật stat mini
  const statIncome  = document.getElementById('stat-income');
  const statExpense = document.getElementById('stat-expense');
  if (statIncome)  statIncome.textContent  = formatCurrency(totalIncome,  State.region);
  if (statExpense) statExpense.textContent = formatCurrency(totalExpense, State.region);
}

/**
 * renderSummary()
 * Tính tổng thu/chi theo kỳ (ngày/tháng/năm) và hiển thị.
 */
function renderSummary() {
  const now    = new Date();
  const period = State.summaryPeriod;

  /**
   * isInPeriod(dateStr)
   * Kiểm tra xem ngày có thuộc kỳ hiện tại không.
   * @param {string} dateStr - ISO date string
   * @returns {boolean}
   */
  function isInPeriod(dateStr) {
    const d = new Date(dateStr);
    if (period === 'day')   return d.toDateString() === now.toDateString();
    if (period === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (period === 'year')  return d.getFullYear() === now.getFullYear();
    return true;
  }

  const filtered  = State.transactions.filter(t => isInPeriod(t.transaction_date));
  const income    = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense   = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const net       = income - expense;

  // Cập nhật lên DOM
  setElText('summary-income',  formatCurrency(income,  State.region));
  setElText('summary-expense', formatCurrency(expense, State.region));
  setElText('summary-net',     formatCurrency(net,     State.region));

  // Màu sắc net
  const netEl = document.getElementById('summary-net');
  if (netEl) netEl.style.color = net >= 0 ? 'var(--income-color)' : 'var(--expense-color)';
}

/* ══════════════════════════════════════════════════════════════
   PHẦN 6: THÊM GIAO DỊCH
   ══════════════════════════════════════════════════════════════ */

/**
 * addTransaction(type)
 * Thu thập dữ liệu form và lưu giao dịch mới vào Supabase.
 * @param {'income'|'expense'} type - Loại giao dịch
 */
async function addTransaction(type) {
  const prefix   = type === 'income' ? 'inc' : 'exp';
  const amountEl = document.getElementById(`${prefix}-amount`);
  const catEl    = document.getElementById(`${prefix}-category`);
  const reasonEl = document.getElementById(`${prefix}-reason`);
  const dateEl   = document.getElementById(`${prefix}-date`);
  const btn      = document.getElementById(`btn-add-${type}`);

  // ── Validate ──
  const rawAmount = amountEl?.value?.replace(/\./g, '').replace(/,/g, '.');
  const amount    = parseFloat(rawAmount);

  if (!amount || amount <= 0) {
    showToast('Lỗi vui lòng thực hiện lại', 'error');
    amountEl?.focus();
    return;
  }

  const region = REGIONS[State.region] || REGIONS.VN;
  if (region.step >= 1 && !Number.isInteger(amount)) {
    showToast('Lỗi vui lòng thực hiện lại', 'error');
    return;
  }

  const category = catEl?.value || 'other';
  const reason   = reasonEl?.value?.trim() || '';
  const dateVal  = dateEl?.value || new Date().toISOString().split('T')[0];

  // ── Xác thực ngày ──
  if (!isValidDate(dateVal)) {
    showToast('Lỗi vui lòng thực hiện lại', 'error');
    return;
  }

  setLoading(btn, true);

  const transaction = {
    user_id: State.user.id,
    type,
    amount,
    category,
    reason: reason || getCategoryLabel(category, type),
    description: reason || getCategoryLabel(category, type),
    transaction_date: dateVal,
    region: State.region,
    currency: region.currency,
  };
  try {
    let data;
    if (isLocalStorageMode()) {
      data = saveLocalTransaction(transaction);
    } else {
      const result = await db
        .from(TABLES.TRANSACTIONS)
        .insert([transaction])
        .select()
        .single();
      if (result.error) throw result.error;
      data = result.data;
    }

    // ── Cập nhật State và UI ──
    if (!State.transactions.some(transactionItem => transactionItem.id === data.id)) {
      State.transactions.unshift(data);
    }
    applyFiltersAndSort();
    renderBalance();
    renderSummary();

    // ── Reset form ──
    resetForm(type);

    showToast('Hoàn Thành', 'success');
  } catch (error) {
    console.error('[addTransaction]', error);
    const legacyDescriptionRequired =
      error.code === '23502' && /description/i.test(error.message || '');
    const message = legacyDescriptionRequired
      ? 'Cơ sở dữ liệu còn yêu cầu cột description. Chạy lại supabase_schema.sql trong Supabase rồi thử lại.'
      : 'Không thể lưu giao dịch: ' + (error.message || 'Lỗi kết nối Supabase.');
    showToast(message, 'error');
  } finally {
    setLoading(btn, false);
  }
}

/**
 * resetForm(type)
 * Xóa dữ liệu nhập trên form sau khi lưu thành công.
 * @param {'income'|'expense'} type
 */
function resetForm(type) {
  const prefix = type === 'income' ? 'inc' : 'exp';
  const fields = [`${prefix}-amount`, `${prefix}-category`, `${prefix}-reason`, `${prefix}-date`];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id.includes('category')) {
      el.value = el.options[0]?.value || '';
    } else if (id.includes('date')) {
      el.value = getTodayStr();
    } else {
      el.value = '';
    }
  });
}

/* ══════════════════════════════════════════════════════════════
   PHẦN 7: SỬA GIAO DỊCH
   ══════════════════════════════════════════════════════════════ */

/**
 * openEditModal(id)
 * Mở modal sửa giao dịch và điền dữ liệu hiện tại vào form.
 * @param {string} id - UUID của giao dịch
 */
function openEditModal(id) {
  const t = State.transactions.find(tx => tx.id === id);
  if (!t) return;

  State.editingId = id;

  // Điền dữ liệu vào modal form
  setElValue('edit-type',     t.type);
  setElValue('edit-amount',   formatNumberInput(t.amount));
  setElValue('edit-category', t.category || 'other');
  setElValue('edit-reason',   t.reason || '');
  setElValue('edit-date',     t.transaction_date?.split('T')[0] || getTodayStr());

  openModal('modal-edit');
}

/**
 * saveEdit()
 * Lưu thay đổi sau khi sửa giao dịch.
 */
async function saveEdit() {
  const id = State.editingId;
  if (!id) return;

  const rawAmount = document.getElementById('edit-amount')?.value?.replace(/\./g, '');
  const amount    = parseFloat(rawAmount);

  if (!amount || amount <= 0) {
    showToast('Lỗi vui lòng thực hiện lại', 'error');
    return;
  }

  const type     = document.getElementById('edit-type')?.value;
  const category = document.getElementById('edit-category')?.value;
  const reason   = document.getElementById('edit-reason')?.value?.trim();
  const dateVal  = document.getElementById('edit-date')?.value;

  if (!isValidDate(dateVal)) {
    showToast('Lỗi vui lòng thực hiện lại', 'error');
    return;
  }

  const btn = document.getElementById('btn-save-edit');
  setLoading(btn, true);

  const updates = {
    type,
    amount,
    category,
    reason: reason || getCategoryLabel(category, type),
    description: reason || getCategoryLabel(category, type),
    transaction_date: dateVal,
  };
  let data;
  let error;
  if (isLocalStorageMode()) {
    data = updateLocalTransaction(id, updates);
    if (!data) error = new Error('Không tìm thấy giao dịch cần cập nhật.');
  } else {
    const result = await db
      .from(TABLES.TRANSACTIONS)
      .update(updates)
      .eq('id', id)
      .eq('user_id', State.user.id)
      .select()
      .single();
    data = result.data;
    error = result.error;
  }

  setLoading(btn, false);

  if (error) {
    showToast('Lỗi vui lòng thực hiện lại', 'error');
    return;
  }

  // Cập nhật State
  const idx = State.transactions.findIndex(t => t.id === id);
  if (idx !== -1) State.transactions[idx] = data;

  applyFiltersAndSort();
  renderBalance();
  renderSummary();
  closeModal('modal-edit');
  showToast('Hoàn Thành', 'success');
  State.editingId = null;
}

/* ══════════════════════════════════════════════════════════════
   PHẦN 8: XÓA GIAO DỊCH
   ══════════════════════════════════════════════════════════════ */

/**
 * confirmDelete(id)
 * Hiển thị dialog xác nhận trước khi xóa.
 * @param {string} id
 */
function confirmDelete(id) {
  const t = State.transactions.find(tx => tx.id === id);
  if (!t) return;

  State.editingId = id;

  const msg = document.getElementById('confirm-delete-msg');
  if (msg) msg.textContent = `Bạn có chắc muốn xóa giao dịch "${t.reason || t.category}" (${formatCurrency(t.amount, State.region)})?`;

  openModal('modal-confirm-delete');
}

/**
 * deleteTransaction()
 * Xóa giao dịch khỏi Supabase và cập nhật State.
 */
async function deleteTransaction() {
  const id = State.editingId;
  if (!id) return;

  const btn = document.getElementById('btn-confirm-delete');
  setLoading(btn, true);

  let error;
  if (isLocalStorageMode()) {
    if (!deleteLocalTransaction(id)) error = new Error('Không tìm thấy giao dịch cần xóa.');
  } else {
    const result = await db
      .from(TABLES.TRANSACTIONS)
      .delete()
      .eq('id', id)
      .eq('user_id', State.user.id);
    error = result.error;
  }

  setLoading(btn, false);

  if (error) {
    showToast('Lỗi vui lòng thực hiện lại', 'error');
    return;
  }

  // Xóa khỏi State
  State.transactions = State.transactions.filter(t => t.id !== id);
  applyFiltersAndSort();
  renderBalance();
  renderSummary();
  closeModal('modal-confirm-delete');
  showToast('Đã xóa giao dịch', 'info');
  State.editingId = null;
}

function getDeletePeriodRange() {
  const type = document.getElementById('delete-period-type')?.value;
  const day = document.getElementById('delete-period-day')?.value;
  const month = document.getElementById('delete-period-month')?.value;
  const yearValue = document.getElementById('delete-period-year')?.value;
  const parsedDay = new Date(`${day}T00:00:00Z`);

  if (
    type === 'day' &&
    /^\d{4}-\d{2}-\d{2}$/.test(day || '') &&
    !Number.isNaN(parsedDay.getTime()) &&
    parsedDay.toISOString().slice(0, 10) === day
  ) {
    return { start: day, end: addDaysToDate(day, 1), label: day };
  }
  if (type === 'month' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) {
    const [year, monthNumber] = month.split('-').map(Number);
    const nextYear = monthNumber === 12 ? year + 1 : year;
    const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
    return {
      start: `${month}-01`,
      end: `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`,
      label: month,
    };
  }
  if (type === 'year' && /^\d{4}$/.test(yearValue || '') && Number(yearValue) >= 1900) {
    const year = Number(yearValue);
    if (year <= 9999) {
      return { start: `${year}-01-01`, end: `${year + 1}-01-01`, label: String(year) };
    }
  }
  return null;
}

function addDaysToDate(date, days) {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

function getTransactionsInRange(start, end) {
  return State.transactions.filter(transaction => {
    const date = transaction.transaction_date?.slice(0, 10);
    return date >= start && date < end;
  });
}

function updateDeletePeriodPreview() {
  const range = getDeletePeriodRange();
  const preview = document.getElementById('delete-period-preview');
  const confirmButton = document.getElementById('btn-confirm-delete-period');
  if (!range) {
    if (preview) preview.textContent = 'Vui lòng chọn khoảng thời gian hợp lệ.';
    if (confirmButton) confirmButton.disabled = true;
    return;
  }

  const count = getTransactionsInRange(range.start, range.end).length;
  if (preview) {
    preview.textContent = count > 0
      ? `Sẽ xóa ${count} giao dịch trong khoảng ${range.label}.`
      : `Không có giao dịch nào trong khoảng ${range.label}.`;
  }
  if (confirmButton) confirmButton.disabled = count === 0;
}

function openDeletePeriodModal() {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const dayInput = document.getElementById('delete-period-day');
  const monthInput = document.getElementById('delete-period-month');
  const yearInput = document.getElementById('delete-period-year');
  if (dayInput) dayInput.value = today;
  if (monthInput) monthInput.value = today.slice(0, 7);
  if (yearInput) yearInput.value = String(now.getFullYear());

  updateDeletePeriodFields();
  updateDeletePeriodPreview();
  openModal('modal-delete-period');
}

function updateDeletePeriodFields() {
  const type = document.getElementById('delete-period-type')?.value;
  const dayField = document.getElementById('delete-period-day-field');
  const monthField = document.getElementById('delete-period-month-field');
  const yearField = document.getElementById('delete-period-year-field');
  if (dayField) dayField.style.display = type === 'day' ? '' : 'none';
  if (monthField) monthField.style.display = type === 'month' ? '' : 'none';
  if (yearField) yearField.style.display = type === 'year' ? '' : 'none';
  updateDeletePeriodPreview();
}

async function deleteTransactionsInPeriod() {
  const range = getDeletePeriodRange();
  if (!range) {
    updateDeletePeriodPreview();
    return;
  }

  const candidates = getTransactionsInRange(range.start, range.end);
  if (candidates.length === 0) {
    updateDeletePeriodPreview();
    return;
  }

  const button = document.getElementById('btn-confirm-delete-period');
  setLoading(button, true);
  let deletedIds;
  try {
    if (isLocalStorageMode()) {
      deletedIds = deleteLocalTransactionsInRange(range.start, range.end).map(transaction => transaction.id);
    } else {
      const { data, error } = await db
        .from(TABLES.TRANSACTIONS)
        .delete()
        .eq('user_id', State.user.id)
        .gte('transaction_date', range.start)
        .lt('transaction_date', range.end)
        .select('id');
      if (error) throw error;
      deletedIds = (data || []).map(transaction => transaction.id);
    }
  } catch (error) {
    console.error('[deleteTransactionsInPeriod] Failed:', error);
    showToast('Không thể xóa giao dịch: ' + (error.message || 'Lỗi lưu dữ liệu.'), 'error');
    return;
  } finally {
    setLoading(button, false, '🗑️ Xóa giao dịch');
  }

  if (deletedIds.length === 0) {
    showToast('Không có giao dịch nào được xóa. Vui lòng tải lại dữ liệu và thử lại.', 'warning');
    return;
  }

  const deleted = new Set(deletedIds);
  State.transactions = State.transactions.filter(transaction => !deleted.has(transaction.id));
  applyFiltersAndSort();
  renderBalance();
  renderSummary();
  closeModal('modal-delete-period');
  showToast(`Đã xóa ${deletedIds.length} giao dịch trong khoảng ${range.label}.`, 'success');
}

/* ══════════════════════════════════════════════════════════════
   PHẦN 9: THÔNG BÁO (NOTIFICATIONS)
   ══════════════════════════════════════════════════════════════ */

/**
 * loadNotifications()
 * Tải danh sách thông báo của user từ Supabase.
 */
async function loadNotifications() {
  if (isLocalStorageMode()) {
    State.notifications = [];
    State.unreadCount = 0;
    updateNotificationBadge();
    renderNotificationList();
    return;
  }

  const { data, error } = await db
    .from(TABLES.NOTIFICATIONS)
    .select('*')
    .eq('user_id', State.user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return;

  State.notifications = data || [];
  State.unreadCount   = State.notifications.filter(n => !n.is_read).length;

  updateNotificationBadge();
  renderNotificationList();
}

/**
 * updateNotificationBadge()
 * Hiển thị/ẩn chấm đỏ trên icon thông báo.
 */
function updateNotificationBadge() {
  const badge = document.getElementById('notif-badge');
  if (badge) {
    badge.style.display = State.unreadCount > 0 ? 'block' : 'none';
  }
}

/**
 * renderNotificationList()
 * Vẽ danh sách thông báo vào dropdown.
 */
function renderNotificationList() {
  const list = document.getElementById('notif-list');
  if (!list) return;

  if (State.notifications.length === 0) {
    list.innerHTML = '<div class="notif-empty">Chưa có thông báo nào</div>';
    return;
  }

  list.innerHTML = State.notifications.map(n => `
    <div class="notif-item ${n.is_read ? '' : 'unread'}" onclick="markNotifRead('${n.id}')">
      <div class="notif-item-icon">${getNotifIcon(n.type)}</div>
      <div class="notif-item-content">
        <div class="notif-item-title">${escapeHTML(n.title || 'Thông báo')}</div>
        <div style="font-size:.82rem;color:var(--text-secondary);margin-top:2px">${escapeHTML(n.message || '')}</div>
        <div class="notif-item-time">${timeAgo(n.created_at)}</div>
      </div>
    </div>
  `).join('');
}

/**
 * markNotifRead(id)
 * Đánh dấu thông báo là đã đọc.
 * @param {string} id
 */
async function markNotifRead(id) {
  if (isLocalStorageMode()) return;

  await db
    .from(TABLES.NOTIFICATIONS)
    .update({ is_read: true })
    .eq('id', id);

  const n = State.notifications.find(x => x.id === id);
  if (n) n.is_read = true;
  State.unreadCount = Math.max(0, State.unreadCount - 1);

  updateNotificationBadge();
  renderNotificationList();
}

/**
 * markAllRead()
 * Đánh dấu tất cả thông báo là đã đọc.
 */
async function markAllRead() {
  if (isLocalStorageMode()) return;

  await db
    .from(TABLES.NOTIFICATIONS)
    .update({ is_read: true })
    .eq('user_id', State.user.id)
    .eq('is_read', false);

  State.notifications.forEach(n => n.is_read = true);
  State.unreadCount = 0;

  updateNotificationBadge();
  renderNotificationList();
}

/* ══════════════════════════════════════════════════════════════
   PHẦN 10: REALTIME SUBSCRIPTION
   ══════════════════════════════════════════════════════════════ */

/**
 * subscribeRealtime()
 * Đăng ký lắng nghe thay đổi realtime từ Supabase.
 * Cập nhật dữ liệu ngay khi có thay đổi từ Supabase.
 */
function subscribeRealtime() {
  if (isLocalStorageMode()) return;

  // Lắng nghe thay đổi bảng transactions
  db
    .channel('user-transactions')
    .on(
      'postgres_changes',
      {
        event: '*', // INSERT | UPDATE | DELETE
        schema: 'public',
        table:  TABLES.TRANSACTIONS,
        filter: `user_id=eq.${State.user.id}`,
      },
      (payload) => {
        handleTransactionChange(payload);
      }
    )
    .subscribe();

  // Lắng nghe thông báo mới
  db
    .channel('user-notifications')
    .on(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  TABLES.NOTIFICATIONS,
        filter: `user_id=eq.${State.user.id}`,
      },
      (payload) => {
        handleNewNotification(payload.new);
      }
    )
    .subscribe();
}

/**
 * handleTransactionChange(payload)
 * Xử lý thay đổi giao dịch từ realtime.
 * @param {Object} payload - Supabase realtime payload
 */
function handleTransactionChange(payload) {
  const { eventType, new: newRow, old: oldRow } = payload;

  if (eventType === 'UPDATE') {
    const idx = State.transactions.findIndex(t => t.id === newRow.id);
    if (idx !== -1) State.transactions[idx] = newRow;
    else State.transactions.unshift(newRow);
  } else if (eventType === 'DELETE') {
    State.transactions = State.transactions.filter(t => t.id !== oldRow.id);
  } else if (eventType === 'INSERT') {
    if (!State.transactions.find(t => t.id === newRow.id)) {
      State.transactions.unshift(newRow);
    }
  }

  applyFiltersAndSort();
  renderBalance();
  renderSummary();
}

/**
 * handleNewNotification(notif)
 * Xử lý thông báo mới đến.
 * Hiển thị toast và cập nhật danh sách.
 * @param {Object} notif - Bản ghi notification mới
 */
function handleNewNotification(notif) {
  State.notifications.unshift(notif);
  State.unreadCount++;
  updateNotificationBadge();
  renderNotificationList();

  // Hiện toast thông báo
  showToast(notif.title || 'Có thông báo mới', 'info');
}

/* ══════════════════════════════════════════════════════════════
   PHẦN 11: CẬP NHẬT PROFILE (Avatar, Tên)
   ══════════════════════════════════════════════════════════════ */

/**
 * saveDisplayName()
 * Lưu tên hiển thị mới và cập nhật UI.
 */
async function saveDisplayName() {
  const nameEl = document.getElementById('setting-display-name');
  const name   = nameEl?.value?.trim();

  if (!name || name.length < 2) {
    showToast('Lỗi vui lòng thực hiện lại', 'error');
    return;
  }

  const success = await updateProfile(State.user.id, { display_name: name });
  if (success) {
    if (State.profile) State.profile.display_name = name;
    renderUserInfo();
  }
}

/**
 * selectAvatar(emoji)
 * Chọn avatar là emoji từ thư viện.
 * @param {string} emoji
 */
async function selectAvatar(emoji) {
  // Lưu emoji làm avatar_url đặc biệt (prefix 'emoji:')
  const avatarVal = `emoji:${emoji}`;
  const success = await updateProfile(State.user.id, { avatar_url: avatarVal });
  if (success) {
    if (State.profile) State.profile.avatar_url = avatarVal;
    renderAvatarWithValue(avatarVal);
    closeModal('modal-avatar');
  }
}

/**
 * renderAvatarWithValue(value)
 * Hiển thị avatar theo giá trị (URL hoặc emoji).
 * @param {string} value
 */
function renderAvatarWithValue(value) {
  const elements = ['profile-avatar', 'nav-avatar'];
  elements.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (value?.startsWith('emoji:')) {
      el.textContent = value.replace('emoji:', '');
    } else if (value?.startsWith('http')) {
      el.innerHTML = `<img src="${value}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else {
      el.textContent = (State.profile?.display_name || 'U').charAt(0).toUpperCase();
    }
  });
}

/* ══════════════════════════════════════════════════════════════
   PHẦN 12: GẮNG SỰ KIỆN (EVENT BINDING)
   ══════════════════════════════════════════════════════════════ */

// Hàm đặt lại giá trị và giữ đúng vị trí con trỏ
function setAmountInputDigits(input, digits, digitsBeforeCaret) {
  // Hàm formatNumberInput của bạn (mình để ví dụ mặc định định dạng 1,000,000)
  const formatted = typeof formatNumberInput === 'function' 
    ? formatNumberInput(digits) 
    : digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    
  input.value = formatted;

  let caret = 0;
  let digitsPassed = 0;
  
  // Tính toán lại vị trí con trỏ sau khi chuỗi đã được thêm các dấu phẩy
  while (caret < formatted.length && digitsPassed < digitsBeforeCaret) {
    if (/\d/.test(formatted[caret])) digitsPassed++;
    caret++;
  }

  input.setSelectionRange(caret, caret);
}

/**
 * bindEvents()
 * Gắn tất cả event listeners lên các element DOM.
 */
function bindEvents() {
  // ── Nút thêm giao dịch ──
  document.getElementById('btn-add-income')?.addEventListener('click', () => addTransaction('income'));
  document.getElementById('btn-add-expense')?.addEventListener('click', () => addTransaction('expense'));

  // ── Format số tiền khi nhập ──
  document.querySelectorAll('.input-amount').forEach(inp => {
  inp.addEventListener('input', function () {
    // 1. Lấy vị trí con trỏ hiện tại ngay sau khi trình duyệt thay đổi value
    const caret = this.selectionStart ?? this.value.length;
    
    // 2. Đếm số lượng chữ số nằm trước con trỏ
    const digitsBeforeCaret = this.value.slice(0, caret).replace(/\D/g, '').length;
    
    // 3. Lấy toàn bộ chữ số có trong ô input
    const digits = this.value.replace(/\D/g, '');
    
    // 4. Gọi hàm định dạng lại và khôi phục vị trí con trỏ
    setAmountInputDigits(this, digits, digitsBeforeCaret);
  });
});

  // ── Tự điền ngày hôm nay ──
  document.querySelectorAll('.input-date').forEach(inp => {
    if (!inp.value) inp.value = getTodayStr();
  });

  // ── Ẩn/hiện số dư ──
  document.getElementById('btn-toggle-balance')?.addEventListener('click', () => {
    State.balanceVisible = !State.balanceVisible;
    const icon = document.getElementById('eye-icon');
    if (icon) icon.textContent = State.balanceVisible ? '👁️' : '🙈';
    renderBalance();
  });

  // ── Filter loại giao dịch ──
  document.querySelectorAll('.pill-tab[data-filter]').forEach(btn => {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.pill-tab[data-filter]').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      State.filterType = this.dataset.filter;
      applyFiltersAndSort();
    });
  });

  // ── Sort ──
  document.getElementById('select-sort')?.addEventListener('change', function () {
    State.sortBy = this.value;
    applyFiltersAndSort();
  });

  // ── Summary period filter ──
  document.querySelectorAll('.filter-btn[data-period]').forEach(btn => {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.filter-btn[data-period]').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      State.summaryPeriod = this.dataset.period;
      renderSummary();
    });
  });

  // ── Notification toggle ──
  document.getElementById('btn-notif')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const dropdown = document.getElementById('notif-dropdown');
    if (dropdown) dropdown.classList.toggle('hidden');
  });
  document.getElementById('btn-mark-all-read')?.addEventListener('click', markAllRead);
  document.addEventListener('click', (e) => {
    const dd = document.getElementById('notif-dropdown');
    if (dd && !dd.contains(e.target) && e.target.id !== 'btn-notif') {
      dd.classList.add('hidden');
    }
  });

  // ── Settings panel ──
  document.getElementById('gear-btn')?.addEventListener('click', openSettings);
  document.getElementById('btn-close-settings')?.addEventListener('click', closeSettings);
  document.getElementById('settings-overlay')?.addEventListener('click', closeSettings);

  // ── Theme swatches ──
  document.querySelectorAll('.swatch').forEach(sw => {
    sw.addEventListener('click', function () {
      document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
      this.classList.add('active');
      applyTheme(this.dataset.theme);
    });
  });

  // ── Region select ──
  document.getElementById('setting-region')?.addEventListener('change', function () {
    applyRegion(this.value);
  });

  // ── Lưu tên hiển thị ──
  document.getElementById('btn-save-name')?.addEventListener('click', saveDisplayName);

  // ── Modal avatar ──
  document.getElementById('profile-avatar')?.addEventListener('click', () => openModal('modal-avatar'));
  document.getElementById('profile-avatar-edit')?.addEventListener('click', () => openModal('modal-avatar'));

  // ── Edit modal ──
  document.getElementById('btn-save-edit')?.addEventListener('click', saveEdit);
  document.getElementById('btn-cancel-edit')?.addEventListener('click', () => closeModal('modal-edit'));

  // ── Delete confirm modal ──
  document.getElementById('btn-confirm-delete')?.addEventListener('click', deleteTransaction);
  document.getElementById('btn-cancel-delete')?.addEventListener('click', () => closeModal('modal-confirm-delete'));
  document.getElementById('btn-open-delete-period')?.addEventListener('click', openDeletePeriodModal);
  document.getElementById('delete-period-type')?.addEventListener('change', updateDeletePeriodFields);
  ['delete-period-day', 'delete-period-month', 'delete-period-year'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateDeletePeriodPreview);
    document.getElementById(id)?.addEventListener('change', updateDeletePeriodPreview);
  });
  document.getElementById('btn-confirm-delete-period')?.addEventListener('click', deleteTransactionsInPeriod);
  document.getElementById('btn-cancel-delete-period')?.addEventListener('click', () => closeModal('modal-delete-period'));

  // ── Đóng modal khi click overlay ──
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', function (e) {
      if (e.target === this) {
        const modalId = this.id.replace('overlay-', 'modal-');
        closeModal(modalId);
      }
    });
  });

  // ── Close modal buttons ──
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', function () {
      const modal = this.closest('.modal-overlay');
      if (modal) {
        modal.classList.add('closing');
        setTimeout(() => modal.classList.remove('closing', 'show'), 300);
      }
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   PHẦN 13: MODAL HELPERS
   ══════════════════════════════════════════════════════════════ */

/**
 * openModal(modalId)
 * Hiển thị modal overlay tương ứng.
 * ID mapping: 'modal-edit' → 'overlay-edit'
 *             'modal-confirm-delete' → 'overlay-confirm-delete'
 *             'modal-avatar' → 'overlay-avatar'
 * @param {string} modalId - Tên modal (bao gồm prefix 'modal-')
 */
function openModal(modalId) {
  // Chuyển 'modal-xyz' → 'overlay-xyz'
  const overlayId = modalId.replace(/^modal-/, 'overlay-');
  const overlay   = document.getElementById(overlayId);
  if (overlay) {
    overlay.classList.remove('closing');
    overlay.style.display = 'flex';
  }
}

/**
 * closeModal(modalId)
 * Ẩn modal với animation closing.
 * @param {string} modalId - Tên modal (bao gồm prefix 'modal-')
 */
function closeModal(modalId) {
  const overlayId = modalId.replace(/^modal-/, 'overlay-');
  const overlay   = document.getElementById(overlayId);
  if (!overlay) return;
  overlay.classList.add('closing');
  setTimeout(() => {
    overlay.style.display = 'none';
    overlay.classList.remove('closing');
  }, 300);
}

/**
 * openSettings()
 * Mở panel cài đặt.
 */
function openSettings() {
  document.getElementById('settings-panel')?.classList.add('open');
  document.getElementById('settings-overlay')?.classList.add('open');
}

/**
 * closeSettings()
 * Đóng panel cài đặt.
 */
function closeSettings() {
  document.getElementById('settings-panel')?.classList.remove('open');
  document.getElementById('settings-overlay')?.classList.remove('open');
}

/* ══════════════════════════════════════════════════════════════
   PHẦN 14: SKELETON LOADING
   ══════════════════════════════════════════════════════════════ */

/**
 * showSkeletons()
 * Hiển thị skeleton loading trong danh sách giao dịch.
 */
function showSkeletons() {
  const container = document.getElementById('transaction-list');
  if (!container) return;
  container.innerHTML = Array(5).fill(0).map(() => `
    <div class="transaction-item">
      <div class="skeleton" style="width:40px;height:40px;border-radius:8px;flex-shrink:0"></div>
      <div class="transaction-info">
        <div class="skeleton" style="width:60%;height:14px;margin-bottom:6px"></div>
        <div class="skeleton" style="width:35%;height:12px"></div>
      </div>
      <div class="skeleton" style="width:90px;height:18px"></div>
    </div>
  `).join('');
}

/**
 * hidePageLoader()
 * Ẩn màn hình loading của trang.
 */
function hidePageLoader() {
  const loader = document.getElementById('page-loader');
  if (loader) {
    loader.classList.add('fade-out');
    setTimeout(() => loader.remove(), 500);
  }
}

/* ══════════════════════════════════════════════════════════════
   PHẦN 15: UTILITY FUNCTIONS
   ══════════════════════════════════════════════════════════════ */

/** Lấy chuỗi ngày hôm nay dạng YYYY-MM-DD */
function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

/** Kiểm tra ngày hợp lệ */
function isValidDate(dateStr) {
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}

/** Định dạng ngày hiển thị */
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * timeAgo(dateStr)
 * Hiển thị thời gian tương đối (vd: "3 phút trước").
 * @param {string} dateStr
 * @returns {string}
 */
function timeAgo(dateStr) {
  const now  = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff < 60)       return 'Vừa xong';
  if (diff < 3600)     return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400)    return `${Math.floor(diff / 3600)} giờ trước`;
  if (diff < 2592000)  return `${Math.floor(diff / 86400)} ngày trước`;
  return formatDate(dateStr);
}

/** Escape HTML để tránh XSS */
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Đặt text cho element theo id */
function setElText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/** Đặt value cho input/select theo id */
function setElValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

/**
 * getCategoryIcon(category, type)
 * Trả về emoji icon tương ứng với danh mục giao dịch.
 */
function getCategoryIcon(category, type) {
  const icons = {
    income: {
      salary:  '💼', bonus: '🎁', prize: '🏆',
      business:'🏪', other:'💰',
    },
    expense: {
      food:    '🍜', education: '📚', entertainment: '🎮',
      rent:    '🏠', transport: '🚗', health: '💊',
      shopping:'🛍️', utilities: '💡', other: '💸',
    },
  };
  return icons[type]?.[category] || (type === 'income' ? '💰' : '💸');
}

/**
 * getCategoryLabel(category, type)
 * Trả về nhãn tiếng Việt của danh mục.
 */
function getCategoryLabel(category, type) {
  const labels = {
    income: {
      salary: 'Tiền lương', bonus: 'Thưởng', prize: 'Trúng thưởng',
      business: 'Kinh doanh', other: 'Thu nhập khác',
    },
    expense: {
      food: 'Ăn uống', education: 'Tiền học', entertainment: 'Giải trí',
      rent: 'Tiền nhà', transport: 'Di chuyển', health: 'Y tế',
      shopping: 'Mua sắm', utilities: 'Hóa đơn', other: 'Chi tiêu khác',
    },
  };
  return labels[type]?.[category] || category;
}

/**
 * getNotifIcon(type)
 * Trả về icon cho loại thông báo.
 */
function getNotifIcon(type) {
  const map = {
    admin_change:   '🔔',
    balance_update: '💰',
    system:         '⚙️',
    info:           'ℹ️',
  };
  return map[type] || '🔔';
}

/* ══════════════════════════════════════════════════════════════
   KHỞI ĐỘNG
   ══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', init);
