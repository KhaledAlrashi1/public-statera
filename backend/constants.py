"""Application-wide constants."""

from __future__ import annotations
# The fallback category name for transactions without a category
UNCAT_NAME = "Uncategorized"

# Date formats used throughout the app
DATE_FORMAT = "%Y-%m-%d"      # 2025-06-15

# File upload limits
ALLOWED_EXTS = {".csv", ".xlsx", ".xls"}
MAX_UPLOAD_SIZE_MB = 12

# Pagination defaults
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

# Rate limiting (requests per minute per endpoint group)
RATE_LIMIT_SEARCH = 60   # /api/transactions/search, /api/transaction-suggestions
RATE_LIMIT_IMPORT = 10   # /transactions/upload-preview, /import-commit
RATE_LIMIT_BANK_SYNC = 5  # /api/bank/.../sync-preview, /api/bank/.../commit
RATE_LIMIT_EXPORT = 5    # /api/transactions/export-csv
RATE_LIMIT_AUTH = 10      # /api/auth/login, /api/auth/register

# File upload security
# Note: CSV files use encoding-based validation (no magic bytes), not this table.
ALLOWED_MIME_SIGNATURES = {
    ".xlsx": [b"PK\x03\x04"],  # ZIP archive (OOXML)
    ".xls": [b"\xd0\xcf\x11\xe0"],  # OLE compound document
}
MAX_UPLOAD_ROWS = 10000  # Prevent memory exhaustion from huge files
EXPORT_CSV_MAX_ROWS = 10_000  # Hard cap on CSV export transactions.

# Memorized transaction prune policy (days after last_seen)
# Pinned rows are never pruned regardless of these thresholds.
# count == 1: prune after 3 months (90 days)
# count == 2: prune after 6 months (180 days)
# count >= 3: never auto-pruned
MEMORIZED_PRUNE_DAYS_COUNT_1 = 90
MEMORIZED_PRUNE_DAYS_COUNT_2 = 180

# App display name
APP_DISPLAY_NAME = "Personal Finance"
