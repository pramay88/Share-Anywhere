-- Allow anonymous file sharing by making owner_id nullable and updating RLS policies
ALTER TABLE public.transfers ALTER COLUMN owner_id DROP NOT NULL;

-- Drop existing RLS policies for transfers
DROP POLICY IF EXISTS "Users can create transfers" ON public.transfers;
DROP POLICY IF EXISTS "Users can view own transfers" ON public.transfers;
DROP POLICY IF EXISTS "Users can update own transfers" ON public.transfers;
DROP POLICY IF EXISTS "Users can delete own transfers" ON public.transfers;

-- Create new RLS policies that support anonymous transfers
CREATE POLICY "Anyone can create transfers"
  ON public.transfers
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can view transfers"
  ON public.transfers
  FOR SELECT
  USING (true);

CREATE POLICY "Owners can update own transfers"
  ON public.transfers
  FOR UPDATE
  USING (owner_id IS NULL OR owner_id = auth.uid());

CREATE POLICY "Owners can delete own transfers"
  ON public.transfers
  FOR DELETE
  USING (owner_id IS NULL OR owner_id = auth.uid());

-- Update transfer_files policies to support anonymous transfers
DROP POLICY IF EXISTS "Users can manage files in own transfers" ON public.transfer_files;

CREATE POLICY "Anyone can create transfer files"
  ON public.transfer_files
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Owners can manage own transfer files"
  ON public.transfer_files
  FOR ALL
  USING (transfer_id IN (
    SELECT id FROM transfers 
    WHERE owner_id IS NULL OR owner_id = auth.uid()
  ));

-- Update storage policies to allow anonymous uploads
DROP POLICY IF EXISTS "Users can upload their own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own files" ON storage.objects;

CREATE POLICY "Anyone can upload files"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'shared-files');

CREATE POLICY "Anyone can view files"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'shared-files');

CREATE POLICY "Anyone can delete files"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'shared-files');