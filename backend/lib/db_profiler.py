"""SQLAlchemy slow query profiler.

Registers engine-level event listeners that measure wall time for every query.
Logs a WARNING when elapsed time exceeds the configured threshold.

Usage (in app factory, after db.init_app(app)):
    from backend.lib.db_profiler import register_slow_query_logger
    register_slow_query_logger(float(os.getenv("SLOW_QUERY_THRESHOLD_MS", "200")))

Set SLOW_QUERY_THRESHOLD_MS=0 to disable entirely.
"""
from __future__ import annotations

import logging
import time

from sqlalchemy import event
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


def register_slow_query_logger(threshold_ms: float) -> None:
    """Attach engine listeners that warn on queries slower than *threshold_ms* ms."""
    if threshold_ms <= 0:
        return

    @event.listens_for(Engine, "before_cursor_execute")
    def _before(conn, cursor, statement, parameters, context, executemany):  # noqa: ANN001
        conn.info.setdefault("_qstart", []).append(time.perf_counter())

    @event.listens_for(Engine, "after_cursor_execute")
    def _after(conn, cursor, statement, parameters, context, executemany):  # noqa: ANN001
        starts = conn.info.get("_qstart")
        if not starts:
            return
        elapsed_ms = (time.perf_counter() - starts.pop()) * 1000
        if elapsed_ms >= threshold_ms:
            short = statement[:300].replace("\n", " ")
            logger.warning(
                "slow_query elapsed_ms=%.1f threshold_ms=%.0f statement=%s",
                elapsed_ms,
                threshold_ms,
                short,
            )
