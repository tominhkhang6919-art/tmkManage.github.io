-- ================================================================
-- SUPABASE DATABASE SCHEMA
-- Quản Lý Thu Chi – TMK Manage Money
-- ================================================================
-- Chạy file này trong Supabase SQL Editor để tạo cấu trúc CSDL
-- ================================================================


-- ── 1. Bảng PROFILES (thông tin mở rộng người dùng) ──────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT,
  display_name  TEXT,
  avatar_url    TEXT,
  region        TEXT NOT NULL DEFAULT 'VN',       -- Khu vực tiền tệ
  theme         TEXT NOT NULL DEFAULT 'blue',      -- Theme màu sắc
  is_blocked    BOOLEAN NOT NULL DEFAULT FALSE,    -- Trạng thái chặn
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ,
  last_seen     TIMESTAMPTZ DEFAULT NOW()          -- Lần hoạt động cuối
);

-- Index tăng tốc truy vấn
CREATE INDEX IF NOT EXISTS idx_profiles_email      ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen  ON public.profiles(last_seen);
CREATE INDEX IF NOT EXISTS idx_profiles_is_blocked ON public.profiles(is_blocked);

-- ── 2. Bảng TRANSACTIONS (giao dịch thu/chi) ─────────────────
CREATE TABLE IF NOT EXISTS public.transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type             TEXT NOT NULL CHECK (type IN ('income', 'expense')), -- Loại giao dịch
  amount           NUMERIC(18, 2) NOT NULL CHECK (amount > 0),          -- Số tiền
  category         TEXT NOT NULL DEFAULT 'other',                       -- Danh mục
  reason           TEXT,                                                 -- Ghi chú / Lý do
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,                  -- Ngày giao dịch
  region           TEXT NOT NULL DEFAULT 'VN',                          -- Khu vực tiền tệ
  currency         TEXT NOT NULL DEFAULT 'VND',                         -- Đơn vị tiền tệ
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tx_user_id          ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_tx_date             ON public.transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_tx_type             ON public.transactions(type);
CREATE INDEX IF NOT EXISTS idx_tx_user_date        ON public.transactions(user_id, transaction_date DESC);

-- ── 3. Bảng NOTIFICATIONS (thông báo real-time) ───────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  message    TEXT,
  type       TEXT NOT NULL DEFAULT 'info'
             CHECK (type IN ('info', 'system', 'admin_change', 'balance_update')),
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_user_id  ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_is_read  ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notif_created  ON public.notifications(created_at DESC);


-- ================================================================
-- ROW LEVEL SECURITY (RLS) – Bảo mật dữ liệu
-- ================================================================

-- Bật RLS cho tất cả bảng
ALTER TABLE public.profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ── PROFILES policies ──────────────────────────────────────────

-- Người dùng chỉ xem được profile của chính mình
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Người dùng chỉ cập nhật profile của chính mình
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Người dùng có thể tạo profile khi đăng ký
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Admin (email cụ thể) có thể xem TẤT CẢ profiles
CREATE POLICY "Admin can view all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
        AND email = 'tominhkhang6919@gmail.com'
    )
  );

-- Admin có thể cập nhật TẤT CẢ profiles (block, unblock, ...)
CREATE POLICY "Admin can update all profiles"
  ON public.profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
        AND email = 'tominhkhang6919@gmail.com'
    )
  );

-- Admin có thể xóa profiles
CREATE POLICY "Admin can delete profiles"
  ON public.profiles FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
        AND email = 'tominhkhang6919@gmail.com'
    )
  );

-- ── TRANSACTIONS policies ──────────────────────────────────────

-- Người dùng chỉ xem giao dịch của chính mình
CREATE POLICY "Users can view own transactions"
  ON public.transactions FOR SELECT
  USING (auth.uid() = user_id);

-- Người dùng chỉ thêm giao dịch của chính mình
CREATE POLICY "Users can insert own transactions"
  ON public.transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Người dùng chỉ sửa giao dịch của chính mình
CREATE POLICY "Users can update own transactions"
  ON public.transactions FOR UPDATE
  USING (auth.uid() = user_id);

-- Người dùng chỉ xóa giao dịch của chính mình
CREATE POLICY "Users can delete own transactions"
  ON public.transactions FOR DELETE
  USING (auth.uid() = user_id);

-- Admin có thể xem TẤT CẢ giao dịch
CREATE POLICY "Admin can view all transactions"
  ON public.transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
        AND email = 'tominhkhang6919@gmail.com'
    )
  );

-- Admin có thể sửa TẤT CẢ giao dịch
CREATE POLICY "Admin can update all transactions"
  ON public.transactions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
        AND email = 'tominhkhang6919@gmail.com'
    )
  );

-- Admin có thể xóa TẤT CẢ giao dịch
CREATE POLICY "Admin can delete all transactions"
  ON public.transactions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
        AND email = 'tominhkhang6919@gmail.com'
    )
  );

-- ── NOTIFICATIONS policies ─────────────────────────────────────

-- Người dùng chỉ xem thông báo của chính mình
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

-- Người dùng chỉ cập nhật thông báo của chính mình (đánh dấu đã đọc)
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- Admin (và service role) có thể ghi thông báo cho bất kỳ user nào
CREATE POLICY "Admin can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
        AND email = 'tominhkhang6919@gmail.com'
    )
  );

-- Admin có thể xem tất cả thông báo
CREATE POLICY "Admin can view all notifications"
  ON public.notifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
        AND email = 'tominhkhang6919@gmail.com'
    )
  );

-- Admin có thể xóa thông báo
CREATE POLICY "Admin can delete notifications"
  ON public.notifications FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
        AND email = 'tominhkhang6919@gmail.com'
    )
  );

-- ================================================================
-- REALTIME SUBSCRIPTIONS
-- Bật realtime cho các bảng cần theo dõi
-- ================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;


-- ================================================================
-- TRIGGERS – Tự động cập nhật updated_at
-- ================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger cho profiles
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger cho transactions
DROP TRIGGER IF EXISTS trg_transactions_updated_at ON public.transactions;
CREATE TRIGGER trg_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
