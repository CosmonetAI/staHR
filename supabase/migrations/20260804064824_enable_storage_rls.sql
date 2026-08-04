--ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS allow_authenticated_insert_resumes_jobfiles ON storage.objects;
DROP POLICY IF EXISTS allow_authenticated_select_resumes_jobfiles ON storage.objects;
DROP POLICY IF EXISTS allow_authenticated_update_resumes_jobfiles ON storage.objects;
DROP POLICY IF EXISTS allow_authenticated_delete_resumes_jobfiles ON storage.objects;

-- INSERT
CREATE POLICY allow_authenticated_insert_resumes_jobfiles
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() IS NOT NULL
    AND bucket_id IN ('resumes', 'job-files')
);

-- SELECT
CREATE POLICY allow_authenticated_select_resumes_jobfiles
ON storage.objects
FOR SELECT
TO authenticated
USING (
    auth.uid() IS NOT NULL
    AND bucket_id IN ('resumes', 'job-files')
);

-- UPDATE
CREATE POLICY allow_authenticated_update_resumes_jobfiles
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    auth.uid() IS NOT NULL
    AND bucket_id IN ('resumes', 'job-files')
)
WITH CHECK (
    auth.uid() IS NOT NULL
    AND bucket_id IN ('resumes', 'job-files')
);

-- DELETE
CREATE POLICY allow_authenticated_delete_resumes_jobfiles
ON storage.objects
FOR DELETE
TO authenticated
USING (
    auth.uid() IS NOT NULL
    AND bucket_id IN ('resumes', 'job-files')
);