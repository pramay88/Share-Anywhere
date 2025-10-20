-- Ensure secure, reliable share code generation without requiring extra extensions on search_path
CREATE OR REPLACE FUNCTION public.generate_share_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  code TEXT;
  exists BOOLEAN;
BEGIN
  LOOP
    -- Generate 8 character alphanumeric code
    code := upper(substr(encode(extensions.gen_random_bytes(6), 'base64'), 1, 8));
    code := replace(replace(replace(code, '+', ''), '/', ''), '=', '');

    -- Ensure uniqueness
    SELECT EXISTS(SELECT 1 FROM public.transfers WHERE share_code = code) INTO exists;

    EXIT WHEN NOT exists;
  END LOOP;

  RETURN code;
END;
$function$;
