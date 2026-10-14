-- Enforce the file limits already used by every DD-214 intake screen.
update storage.buckets set file_size_limit=10485760,allowed_mime_types=array['application/pdf','image/jpeg','image/png'] where id='dd214-uploads';
