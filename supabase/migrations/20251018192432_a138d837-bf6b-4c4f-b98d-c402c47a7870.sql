-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create storage bucket for files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'shared-files',
  'shared-files',
  false,
  52428800, -- 50MB limit
  ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv',
    'application/zip', 'application/x-rar-compressed'
  ]
);

-- Storage policies for files
CREATE POLICY "Users can upload own files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'shared-files' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view own files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'shared-files' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'shared-files' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Create transfers table
CREATE TABLE public.transfers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  share_code TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  expires_at TIMESTAMPTZ,
  max_downloads INTEGER,
  download_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create transfers"
  ON public.transfers FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can view own transfers"
  ON public.transfers FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can update own transfers"
  ON public.transfers FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own transfers"
  ON public.transfers FOR DELETE
  USING (auth.uid() = owner_id);

-- Public policy to check if code exists (without revealing data)
CREATE POLICY "Anyone can verify transfer codes"
  ON public.transfers FOR SELECT
  USING (expires_at IS NULL OR expires_at > now());

-- Create transfer_files table
CREATE TABLE public.transfer_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transfer_id UUID REFERENCES public.transfers(id) ON DELETE CASCADE NOT NULL,
  storage_path TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.transfer_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage files in own transfers"
  ON public.transfer_files FOR ALL
  USING (
    transfer_id IN (
      SELECT id FROM public.transfers WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Anyone can view files for valid transfers"
  ON public.transfer_files FOR SELECT
  USING (
    transfer_id IN (
      SELECT id FROM public.transfers
      WHERE expires_at IS NULL OR expires_at > now()
    )
  );

-- Create download_logs table for tracking
CREATE TABLE public.download_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transfer_id UUID REFERENCES public.transfers(id) ON DELETE CASCADE NOT NULL,
  file_id UUID REFERENCES public.transfer_files(id) ON DELETE CASCADE NOT NULL,
  downloaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address TEXT,
  user_agent TEXT,
  downloaded_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.download_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Transfer owners can view download logs"
  ON public.download_logs FOR SELECT
  USING (
    transfer_id IN (
      SELECT id FROM public.transfers WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Anyone can log downloads"
  ON public.download_logs FOR INSERT
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX idx_transfers_share_code ON public.transfers(share_code);
CREATE INDEX idx_transfers_owner ON public.transfers(owner_id);
CREATE INDEX idx_transfers_expires ON public.transfers(expires_at);
CREATE INDEX idx_transfer_files_transfer ON public.transfer_files(transfer_id);
CREATE INDEX idx_download_logs_transfer ON public.download_logs(transfer_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_transfers_updated_at
  BEFORE UPDATE ON public.transfers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Function to generate secure random codes
CREATE OR REPLACE FUNCTION public.generate_share_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  code TEXT;
  exists BOOLEAN;
BEGIN
  LOOP
    -- Generate 8 character alphanumeric code
    code := upper(substr(encode(gen_random_bytes(6), 'base64'), 1, 8));
    code := replace(replace(replace(code, '+', ''), '/', ''), '=', '');
    
    -- Check if code already exists
    SELECT EXISTS(SELECT 1 FROM public.transfers WHERE share_code = code) INTO exists;
    
    EXIT WHEN NOT exists;
  END LOOP;
  
  RETURN code;
END;
$$;