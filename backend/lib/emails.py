"""Email normalization helpers."""

from __future__ import annotations

import re
from email.utils import parseaddr


_EMAIL_LOCAL_RE = re.compile(r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$")
_EMAIL_DOMAIN_LABEL_RE = re.compile(r"^[A-Za-z0-9-]+$")


def normalize_email(value: str | None) -> str:
    return (value or "").strip().lower()


def is_valid_email_format(value: str | None) -> bool:
    email = normalize_email(value)
    if not email or len(email) > 255:
        return False

    _display_name, addr = parseaddr(email)
    if addr != email or email.count("@") != 1:
        return False

    local, domain = email.rsplit("@", 1)
    if (
        not local
        or not domain
        or local.startswith(".")
        or local.endswith(".")
        or domain.startswith(".")
        or domain.endswith(".")
        or ".." in local
        or ".." in domain
        or not _EMAIL_LOCAL_RE.fullmatch(local)
    ):
        return False

    labels = domain.split(".")
    if len(labels) < 2 or any(not label for label in labels):
        return False

    for label in labels:
        if (
            label.startswith("-")
            or label.endswith("-")
            or not _EMAIL_DOMAIN_LABEL_RE.fullmatch(label)
        ):
            return False

    return True
