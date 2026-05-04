"""CSV/Excel import helpers."""

from __future__ import annotations

import hashlib
import logging
import os
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Optional, Tuple

from backend.constants import ALLOWED_EXTS, ALLOWED_MIME_SIGNATURES, DATE_FORMAT, MAX_UPLOAD_ROWS, UNCAT_NAME
from backend.money_math import format_kd

_ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")


def _normalize_digits(s: str) -> str:
    return s.translate(_ARABIC_DIGITS)

try:
    import pandas as pd  # type: ignore
except Exception:  # pragma: no cover - pandas is optional outside import-heavy environments.
    pd = None


_AMOUNT_RE = re.compile(r"^[+-]?\d+(?:\.\d+)?$")
_AMOUNT_CURRENCY_RE = re.compile(r"(?i)\b(?:kd|kwd)\b|د\.?\s*ك")
_GENERIC_UPLOAD_MIME_TYPES = {"application/octet-stream", "binary/octet-stream"}
_ALLOWED_UPLOAD_MIME_TYPES = {
    ".csv": {
        "text/csv",
        "application/csv",
        "text/plain",
        "application/vnd.ms-excel",
        *_GENERIC_UPLOAD_MIME_TYPES,
    },
    ".xlsx": {
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/zip",
        "application/x-zip-compressed",
        *_GENERIC_UPLOAD_MIME_TYPES,
    },
    ".xls": {
        "application/vnd.ms-excel",
        "application/msexcel",
        "application/x-msexcel",
        "application/xls",
        "application/x-excel",
        "application/excel",
        "application/vnd.ms-office",
        "application/x-ole-storage",
        *_GENERIC_UPLOAD_MIME_TYPES,
    },
}
_COMMON_BINARY_SIGNATURES = (
    b"\xff\xd8\xff",  # JPEG
    b"\x89PNG\r\n\x1a\n",  # PNG
    b"GIF87a",
    b"GIF89a",
    b"%PDF-",
    b"PK\x03\x04",  # ZIP / OOXML
    b"\xd0\xcf\x11\xe0",  # OLE compound
)
_SUPPORTED_DATE_FORMATS = (
    DATE_FORMAT,
    "%d/%m/%Y",
    "%d-%m-%Y",
    "%d-%b-%Y",
    "%d %b %Y",
    "%d-%B-%Y",
    "%d %B %Y",
)


def _get_logger() -> logging.Logger:
    return logging.getLogger(__name__)


def _ext(filename: str) -> str:
    return os.path.splitext(filename or "")[1].lower()


def _norm(value: str) -> str:
    """Normalize header names (case/space/underscore-insensitive)."""
    return " ".join((value or "").strip().lower().replace("_", " ").split())


def _has_too_many_decimal_places(value: str) -> bool:
    if "." not in value:
        return False
    return len(value.rsplit(".", 1)[1]) > 3


def _parse_amount(value: str | None) -> Decimal:
    raw = (value or "").strip()
    if not raw:
        return Decimal("0")

    normalized = _normalize_digits(raw)
    cleaned = _AMOUNT_CURRENCY_RE.sub("", normalized)
    cleaned = cleaned.replace(",", "").replace(" ", "")

    if not cleaned or not _AMOUNT_RE.fullmatch(cleaned):
        raise InvalidOperation(f"Invalid amount: {value}")
    if _has_too_many_decimal_places(cleaned):
        raise ValueError("Amount cannot have more than 3 decimal places.")
    return Decimal(cleaned)


def _parse_date(value: str | None) -> date:
    """Parse supported import date strings into a date object."""
    raw = (value or "").strip()
    if not raw:
        raise ValueError("date is required")
    normalized = _normalize_digits(raw)
    for fmt in _SUPPORTED_DATE_FORMATS:
        try:
            return datetime.strptime(normalized, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Cannot parse date: {raw!r}")


def compute_file_hash(file_bytes: bytes) -> str:
    """Return a stable SHA-256 hash for the uploaded file bytes."""
    return hashlib.sha256(file_bytes).hexdigest()


def compute_import_row_hash(
    user_id: int,
    date_str: str,
    name_key: str,
    amount_kd: str,
    file_hash: str,
    row_index: int,
) -> str:
    """Return the idempotency hash for one imported file row."""
    raw = f"{user_id}:{date_str}:{name_key}:{amount_kd}:{file_hash}:{row_index}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class ColumnMappingRequired(Exception):
    """Raised when a file's columns can't be auto-detected."""

    def __init__(
        self,
        all_columns: List[str],
        suggested_mapping: Dict[str, str],
        raw_rows: List[Dict[str, Any]],
        missing_required: List[str] | None = None,
    ):
        self.all_columns = all_columns
        self.suggested_mapping = suggested_mapping
        self.raw_rows = raw_rows
        self.missing_required = list(missing_required or [])
        super().__init__("Column mapping required")


class InvalidFileTypeError(ValueError):
    """Raised when uploaded file metadata or contents are not tabular."""


def _normalized_mimetype(file) -> str:
    return str(getattr(file, "mimetype", "") or getattr(file, "content_type", "") or "").split(";", 1)[0].strip().lower()


def _is_obviously_invalid_mimetype(ext: str, mimetype: str) -> bool:
    if not mimetype:
        return False
    allowed = _ALLOWED_UPLOAD_MIME_TYPES.get(ext, set())
    return bool(allowed) and mimetype not in allowed


def _looks_like_binary_bytes(sample: bytes) -> bool:
    if not sample:
        return False
    if any(sample.startswith(sig) for sig in _COMMON_BINARY_SIGNATURES):
        return True
    if b"\x00" in sample:
        return True
    control_count = sum(1 for byte in sample if byte < 32 and byte not in (9, 10, 13))
    return control_count / max(len(sample), 1) > 0.10


REQUIRED_NAMES: Dict[str, List[str]] = {
    "date": ["date", "transaction date", "trans date", "trans. date", "posting date", "value date"],
    "name": [
        "transaction title",
        "transaction name",
        "item name",
        "title",
        "transaction description",
        "description",
        "name",
        "narration",
        "details",
        "particulars",
    ],
    "amount": ["amount (kwd)", "amount", "amount kd", "amount_kd"],
}

OPTIONAL_NAMES: Dict[str, List[str]] = {
    "category": ["category", "type", "transaction type", "trans type"],
    "merchant": ["merchant", "payee", "vendor", "merchant name"],
    "memo": ["memo", "note", "notes", "comment", "details memo"],
    "transaction_id": ["transaction_id", "transaction id", "id"],
}


def _read_tabular_file_to_df(
    file,
    user_mapping: Optional[Dict[str, str]] = None,
) -> Tuple["pd.DataFrame", Dict[str, str]]:
    if pd is None:
        raise RuntimeError("File import requires pandas. Install with: pip install pandas openpyxl")
    ext = _ext(file.filename)
    if ext not in ALLOWED_EXTS:
        raise RuntimeError("Unsupported file type. Please upload .csv, .xlsx, or .xls.")

    if ext == ".csv":
        try:
            df = pd.read_csv(file, encoding="utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ValueError("CSV files must be UTF-8 encoded.") from exc
    else:
        file.stream.seek(0)
        df = pd.read_excel(file)

    if user_mapping:
        selected_columns = [str(csv_col) for csv_col in user_mapping.values() if str(csv_col or "").strip()]
        duplicate_columns = sorted({col for col in selected_columns if selected_columns.count(col) > 1})
        if duplicate_columns:
            raise ValueError("Each mapped field must use a different source column.")

        rename_dict: Dict[str, str] = {}
        colmap_return: Dict[str, str] = {}
        for std_key, csv_col in user_mapping.items():
            if csv_col and csv_col in df.columns:
                rename_dict[csv_col] = std_key
                colmap_return[std_key] = csv_col
        missing_required = [key for key in ("date", "name", "amount_kd") if key not in colmap_return]
        if missing_required:
            raw_rows = (
                df.head(5).fillna("").astype(str).to_dict(orient="records")
                if len(df) > 0
                else []
            )
            raise ColumnMappingRequired(
                all_columns=list(df.columns),
                suggested_mapping=colmap_return,
                raw_rows=raw_rows,
                missing_required=missing_required,
            )
        df = df.rename(columns=rename_dict)
        if "category" not in df.columns:
            df["category"] = ""
        return df, colmap_return

    colmap: Dict[str, str] = {}
    for col in df.columns:
        normalized = _norm(str(col))
        for key, aliases in REQUIRED_NAMES.items():
            if normalized in aliases and key not in colmap:
                colmap[key] = col
        for key, aliases in OPTIONAL_NAMES.items():
            if normalized in aliases and key not in colmap:
                colmap[key] = col

    missing_required = [key for key in REQUIRED_NAMES if key not in colmap]
    if missing_required:
        suggested: Dict[str, str] = {}
        for key in ("transaction_id", "date", "name", "amount", "category", "merchant", "memo"):
            if key in colmap:
                out_key = "amount_kd" if key == "amount" else key
                suggested[out_key] = colmap[key]
        raw_rows = (
            df.head(5).fillna("").astype(str).to_dict(orient="records")
            if len(df) > 0
            else []
        )
        raise ColumnMappingRequired(
            all_columns=list(df.columns),
            suggested_mapping=suggested,
            raw_rows=raw_rows,
            missing_required=missing_required,
        )

    rename: Dict[str, str] = {
        colmap["date"]: "date",
        colmap["name"]: "name",
        colmap["amount"]: "amount_kd",
    }
    if "category" in colmap:
        rename[colmap["category"]] = "category"
    if "merchant" in colmap:
        rename[colmap["merchant"]] = "merchant"
    if "memo" in colmap:
        rename[colmap["memo"]] = "memo"
    if "transaction_id" in colmap:
        rename[colmap["transaction_id"]] = "transaction_id"
    df = df.rename(columns=rename)
    if "category" not in df.columns:
        df["category"] = ""

    return df, {
        "transaction_id": colmap.get("transaction_id", ""),
        "date": colmap["date"],
        "category": colmap.get("category", ""),
        "name": colmap["name"],
        "amount_kd": colmap["amount"],
        "merchant": colmap.get("merchant", ""),
        "memo": colmap.get("memo", ""),
    }


def _df_to_preview_rows(
    df: "pd.DataFrame",
) -> Tuple[List[Dict[str, Any]], int, List[Dict[str, Any]], List[Dict[str, Any]]]:
    def _is_missing(value: Any) -> bool:
        try:
            return bool(pd.isna(value))  # type: ignore[arg-type]
        except Exception:  # noqa: BLE001 - import preview and row parsing should log and skip malformed rows instead of aborting the batch.
            return value is None

    def _parse_preview_date(value: Any) -> str:
        if _is_missing(value):
            return ""
        if isinstance(value, datetime):
            return value.date().isoformat()
        if isinstance(value, date):
            return value.isoformat()
        raw = str(value).strip()
        if not raw:
            return ""
        if re.search(r"[\u0660-\u0669]", raw):
            raise ValueError("date contains unsupported numerals")
        return _parse_date(raw).isoformat()

    def _parse_preview_transaction_id(value: Any) -> int | None:
        if _is_missing(value):
            return None
        raw = str(value).strip()
        if not raw:
            return None
        if raw.endswith(".0"):
            raw = raw[:-2]
        try:
            return int(raw)
        except (TypeError, ValueError) as exc:
            raise ValueError("transaction_id must be an integer") from exc

    def _preview_text(value: Any) -> str:
        if _is_missing(value):
            return ""
        if isinstance(value, datetime):
            return value.isoformat(sep=" ")
        if isinstance(value, date):
            return value.isoformat()
        return str(value).strip()

    def _skipped_row_payload(
        *,
        row_number: int,
        reason: str,
        raw_name: str,
        raw_date: str,
        raw_amount: str,
        raw_transaction_id: str,
    ) -> Dict[str, Any]:
        return {
            "row_number": row_number,
            "reason": reason,
            "name": raw_name[:120],
            "raw_date": raw_date[:64],
            "raw_amount": raw_amount[:64],
            "raw_transaction_id": raw_transaction_id[:64],
        }

    rows: List[Dict[str, Any]] = []
    skipped = 0
    flagged_rows: List[Dict[str, Any]] = []
    skipped_rows: List[Dict[str, Any]] = []
    row_number = 0
    for _, row in df.iterrows():
        row_number += 1
        raw_name = _preview_text(row.get("name"))
        raw_date = _preview_text(row.get("date"))
        raw_amount = _preview_text(row.get("amount_kd"))
        raw_transaction_id = _preview_text(row.get("transaction_id")) if "transaction_id" in row else ""
        try:
            if _is_missing(row.get("name")) or _is_missing(row.get("amount_kd")):
                missing_fields: list[str] = []
                if _is_missing(row.get("name")):
                    missing_fields.append("name")
                if _is_missing(row.get("amount_kd")):
                    missing_fields.append("amount_kd")
                skipped += 1
                skipped_rows.append(
                    _skipped_row_payload(
                        row_number=row_number,
                        reason=f"Missing required field(s): {', '.join(missing_fields)}.",
                        raw_name=raw_name,
                        raw_date=raw_date,
                        raw_amount=raw_amount,
                        raw_transaction_id=raw_transaction_id,
                    )
                )
                continue
            preview_date = _parse_preview_date(row.get("date"))
            category = ""
            if "category" in row and not _is_missing(row.get("category")):
                category = str(row.get("category") or "").strip()
            name = str(row["name"]).strip()
            amount_raw = str(row["amount_kd"]).strip()
            if not name or not amount_raw:
                skipped += 1
                skipped_rows.append(
                    _skipped_row_payload(
                        row_number=row_number,
                        reason="Both name and amount_kd are required.",
                        raw_name=raw_name,
                        raw_date=raw_date,
                        raw_amount=raw_amount,
                        raw_transaction_id=raw_transaction_id,
                    )
                )
                continue
            amount = _parse_amount(amount_raw)
            if amount <= 0:
                # Surface negative/zero rows as flagged so users can correct
                # their file — do NOT silently discard financial data.
                flagged_rows.append({
                    "row_number": row_number,
                    "raw_amount": amount_raw,
                    "name": name,
                    "reason": (
                        "Zero amounts are not supported."
                        if amount == 0
                        else (
                            "Negative amounts are not supported. "
                            "If this is an expense, enter the absolute value. "
                            "Check whether your file uses negative values for debits."
                        )
                    ),
                })
                continue
            transaction_id = None
            if "transaction_id" in row:
                transaction_id = _parse_preview_transaction_id(row.get("transaction_id"))
            rows.append(
                {
                    "row_index": row_number - 1,
                    "transaction_id": transaction_id,
                    "date": preview_date,
                    "merchant": "" if _is_missing(row.get("merchant")) else str(row.get("merchant")).strip(),
                    "category": category,
                    "name": name,
                    "amount_kd": format_kd(amount),
                    "memo": "" if _is_missing(row.get("memo")) else str(row.get("memo")).strip(),
                }
            )
        except (InvalidOperation, ValueError) as exc:
            skipped += 1
            reason = str(exc).strip() or "Failed to parse row."
            skipped_rows.append(
                _skipped_row_payload(
                    row_number=row_number,
                    reason=reason,
                    raw_name=raw_name,
                    raw_date=raw_date,
                    raw_amount=raw_amount,
                    raw_transaction_id=raw_transaction_id,
                )
            )
        except Exception:  # noqa: BLE001 - import preview and row parsing should log and skip malformed rows instead of aborting the batch.
            skipped += 1
            _get_logger().exception(
                "Unexpected upload preview row parse failure for row_number=%s",
                row_number,
            )
            skipped_rows.append(
                _skipped_row_payload(
                    row_number=row_number,
                    reason="Failed to parse row. Check the date, amount, and transaction ID fields.",
                    raw_name=raw_name,
                    raw_date=raw_date,
                    raw_amount=raw_amount,
                    raw_transaction_id=raw_transaction_id,
                )
            )
    return rows, skipped, flagged_rows, skipped_rows


def validate_uploaded_file(file) -> None:
    if not file or not file.filename:
        raise ValueError("No file provided")

    ext = _ext(file.filename)
    if ext not in ALLOWED_EXTS:
        raise ValueError(
            f"File type '{ext}' not allowed. "
            f"Please upload: {', '.join(sorted(ALLOWED_EXTS))}"
        )

    mimetype = _normalized_mimetype(file)
    if _is_obviously_invalid_mimetype(ext, mimetype):
        raise InvalidFileTypeError("File type not supported. Please upload a valid CSV or Excel file.")

    file.stream.seek(0)
    header = file.stream.read(2048)
    file.stream.seek(0)

    if not header:
        raise ValueError("File is empty")

    expected_signatures = ALLOWED_MIME_SIGNATURES.get(ext, [])
    if ext == ".csv":
        if _looks_like_binary_bytes(header):
            raise InvalidFileTypeError("File type not supported. Please upload a valid CSV or Excel file.")
        try:
            header.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ValueError("CSV files must be UTF-8 encoded.") from exc
        return

    if expected_signatures:
        matched = any(header.startswith(sig) for sig in expected_signatures if sig)
        if not matched:
            raise InvalidFileTypeError("File type not supported. Please upload a valid CSV or Excel file.")


def safe_read_tabular_file(
    file,
    user_mapping: Optional[Dict[str, str]] = None,
) -> Tuple["pd.DataFrame", Dict[str, str]]:
    validate_uploaded_file(file)

    try:
        df, colmap = _read_tabular_file_to_df(file, user_mapping=user_mapping)
    except ColumnMappingRequired:
        raise
    except Exception as exc:  # noqa: BLE001 - import preview and row parsing should log and skip malformed rows instead of aborting the batch.
        error_msg = str(exc)
        if "No such file" in error_msg or "Permission denied" in error_msg:
            raise ValueError("Failed to process uploaded file") from exc
        raise

    if len(df) > MAX_UPLOAD_ROWS:
        raise ValueError(
            f"File contains {len(df):,} rows, which exceeds the limit of {MAX_UPLOAD_ROWS:,}. "
            f"Please split into smaller files."
        )

    return df, colmap
