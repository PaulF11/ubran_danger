-- File note: Replaces generic pending states on admin scan reports with explicit outcomes.

ALTER TABLE admin_scan_candidates
    MODIFY review_status ENUM(
        'PENDING',
        'READY',
        'APPROVING',
        'APPROVED',
        'REJECTED',
        'DUPLICATE',
        'CONFLICT',
        'NOT_ACTIONABLE'
    ) NOT NULL DEFAULT 'NOT_ACTIONABLE';

UPDATE admin_scan_candidates
SET review_status = CASE
    WHEN verification_status = 'VERIFIED' AND candidate_json IS NOT NULL
        THEN 'READY'
    ELSE 'NOT_ACTIONABLE'
END
WHERE review_status IN ('PENDING', 'APPROVING');

UPDATE admin_scan_candidates
SET scan_status = 'UNVERIFIED'
WHERE scan_status = 'PENDING_REVIEW';

UPDATE admin_scan_candidates
SET verification_status = 'UNVERIFIED'
WHERE verification_status = 'PENDING_REVIEW';

ALTER TABLE admin_scan_candidates
    MODIFY review_status ENUM(
        'READY',
        'APPROVING',
        'APPROVED',
        'REJECTED',
        'DUPLICATE',
        'CONFLICT',
        'NOT_ACTIONABLE'
    ) NOT NULL DEFAULT 'NOT_ACTIONABLE';
