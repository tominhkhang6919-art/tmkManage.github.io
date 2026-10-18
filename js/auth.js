/**
 * auth.js – Tạo phiên Supabase ẩn danh, lưu cục bộ dự phòng và quản lý profile.
 */

const LOCAL_DATA_KEY = 'tmk-manage-money-data-v1';
let localStorageMode = false;

function readLocalData() {
  const saved = localStorage.getItem(LOCAL_DATA_KEY);
  if (!saved) {
    return {
      userId: null,
      profile: { display_name: 'Người dùng', avatar_url: '', region: 'VN', theme: 'blue' },
      transactions: [],
    };
  }

  const data = JSON.parse(saved);
  if (!data || typeof data !== 'object' || !Array.isArray(data.transactions)) {
    throw new Error('Dữ liệu lưu cục bộ không hợp lệ.');
  }
  return {
    ...data,
    userId: data.userId || null,
    profile: {
      display_name: 'Người dùng',
      avatar_url: '',
      region: 'VN',
      theme: 'blue',
      ...data.profile,
    },
  };
}

function writeLocalData(data) {
  localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(data));
}

function createLocalId() {
  return globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isLocalStorageMode() {
  return localStorageMode;
}

function updateLocalProfile(updates) {
  const data = readLocalData();
  data.profile = { ...data.profile, ...updates };
  writeLocalData(data);
  return data.profile;
}

function getLocalTransactions() {
  return readLocalData().transactions;
}

function saveLocalTransaction(transaction) {
  const data = readLocalData();
  const saved = { ...transaction, id: createLocalId(), created_at: new Date().toISOString() };
  data.transactions.unshift(saved);
  writeLocalData(data);
  return saved;
}

function updateLocalTransaction(id, updates) {
  const data = readLocalData();
  const index = data.transactions.findIndex(transaction => transaction.id === id);
  if (index === -1) return null;
  data.transactions[index] = { ...data.transactions[index], ...updates, updated_at: new Date().toISOString() };
  writeLocalData(data);
  return data.transactions[index];
}

function deleteLocalTransaction(id) {
  const data = readLocalData();
  const transactions = data.transactions.filter(transaction => transaction.id !== id);
  if (transactions.length === data.transactions.length) return false;
  data.transactions = transactions;
  writeLocalData(data);
  return true;
}

function deleteLocalTransactionsInRange(startDate, endDate) {
  const data = readLocalData();
  const removed = data.transactions.filter(transaction =>
    transaction.transaction_date >= startDate && transaction.transaction_date < endDate
  );
  if (removed.length === 0) return removed;
  const removedIds = new Set(removed.map(transaction => transaction.id));
  data.transactions = data.transactions.filter(transaction => !removedIds.has(transaction.id));
  writeLocalData(data);
  return removed;
}

function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = {
    success: '✅',
    error: '❌',
    info: 'ℹ️',
    warning: '⚠️',
  };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icon = document.createElement('span');
  icon.textContent = icons[type] || icons.info;
  const text = document.createElement('span');
  text.textContent = message;
  toast.append(icon, text);
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

function setLoading(btnEl, isLoading, text = '') {
  if (!btnEl) return;
  btnEl.disabled = isLoading;
  if (isLoading) {
    btnEl.dataset.originalText = btnEl.innerHTML;
    btnEl.innerHTML = '<span class="spinner"></span> Đang xử lý...';
  } else {
    btnEl.innerHTML = text || btnEl.dataset.originalText || text;
  }
}

function createLocalStorageUser(localData, warningMessage) {
  localStorageMode = true;
  const fallbackData = localData || readLocalData();
  if (!fallbackData.userId) {
    fallbackData.userId = createLocalId();
    writeLocalData(fallbackData);
  }
  console.warn('[Auth] Supabase is unavailable; using browser storage.');
  showToast(warningMessage, 'warning');
  return { id: fallbackData.userId, user_metadata: {} };
}

/**
 * Reuse the saved session, or create one anonymous Supabase account.
 * Supabase persists this session in localStorage, so the same browser
 * continues to access the same cloud data without a login screen.
 */
async function getOrCreateSessionUser() {
  const savedLocalData = localStorage.getItem(LOCAL_DATA_KEY);
  const localData = savedLocalData ? readLocalData() : null;

  if (!db) {
    return createLocalStorageUser(
      localData,
      localData
        ? 'Supabase chưa được cấu hình. Dữ liệu hiện có tiếp tục được lưu trên trình duyệt.'
        : 'Supabase chưa được cấu hình. Dữ liệu sẽ chỉ được lưu trên trình duyệt.'
    );
  }

  const { data, error } = await db.auth.getSession();
  if (error) throw error;

  let user = data.session?.user;
  if (!user) {
    const { data: anonymousData, error: signInError } = await db.auth.signInAnonymously();
    if (signInError) {
      const anonymousAuthDisabled =
        signInError.code === 'anonymous_provider_disabled' ||
        /anonymous sign-ins are disabled/i.test(signInError.message || '');
      if (!anonymousAuthDisabled) throw signInError;

      return createLocalStorageUser(
        localData,
        localData
          ? 'Đang dùng dữ liệu chưa đồng bộ trên trình duyệt. Bật Anonymous Sign-Ins để chuyển dữ liệu lên Supabase.'
          : 'Đang lưu dữ liệu trên trình duyệt. Bật Anonymous Sign-Ins trong Supabase để đồng bộ đám mây.'
      );
    }
    user = anonymousData.user;
  }

  if (!user) {
    throw new Error('Supabase không trả về thông tin phiên người dùng.');
  }

  await upsertProfile(user, localData?.profile);
  if (localData) {
    await syncLocalDataToSupabase(user, localData);
  }
  return user;
}

async function upsertProfile(user, profile = {}) {
  if (localStorageMode) return;

  const { error } = await db
    .from(TABLES.PROFILES)
    .upsert(
      {
        id: user.id,
        email: user.email || null,
        ...profile,
        last_seen: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

  if (error) {
    console.error('[upsertProfile] Error:', error.message);
    throw error;
  }
}

async function syncLocalDataToSupabase(user, localData) {
  const transactions = localData.transactions.map(transaction => ({
    user_id: user.id,
    local_id: transaction.id,
    type: transaction.type,
    amount: transaction.amount,
    category: transaction.category || 'other',
    reason: transaction.reason || transaction.description || null,
    description: transaction.description || transaction.reason || null,
    transaction_date: transaction.transaction_date,
    region: transaction.region || localData.profile.region || 'VN',
    currency: transaction.currency || REGIONS[transaction.region || localData.profile.region || 'VN']?.currency || 'VND',
    created_at: transaction.created_at,
    updated_at: transaction.updated_at,
  }));

  for (let index = 0; index < transactions.length; index += 500) {
    const { error } = await db
      .from(TABLES.TRANSACTIONS)
      .upsert(transactions.slice(index, index + 500), { onConflict: 'user_id,local_id' });
    if (error) {
      console.error('[syncLocalDataToSupabase] Error:', error.message);
      throw error;
    }
  }

  localStorage.removeItem(LOCAL_DATA_KEY);
  showToast(`Đã đồng bộ ${transactions.length} giao dịch lên Supabase.`, 'success');
}

async function getProfile(userId) {
  if (localStorageMode) return readLocalData().profile;

  const { data, error } = await db
    .from(TABLES.PROFILES)
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.warn('[getProfile] Error:', error.message);
    return null;
  }
  return data;
}

async function updateProfile(userId, updates) {
  if (localStorageMode) {
    updateLocalProfile(updates);
    showToast('Hoàn Thành', 'success');
    return true;
  }

  const { error } = await db
    .from(TABLES.PROFILES)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) {
    showToast('Cập nhật thất bại: ' + error.message, 'error');
    return false;
  }
  showToast('Hoàn Thành', 'success');
  return true;
}
