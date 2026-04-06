"""
Attribute-level data quality validation for CoESCD pipelines.

Checks required field presence, value ranges, temporal consistency,
and duplicate record detection for incoming spatial datasets.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import pandas as pd

log = logging.getLogger(__name__)

# The platform operational start date — no records before this date are valid
PLATFORM_START_DATE = datetime(2024, 1, 1, tzinfo=timezone.utc)

# Maximum allowed clock skew for future timestamps (5 minutes)
MAX_FUTURE_SECONDS = 300

# Physical plausibility bounds for meteorological and environmental attributes
ATTRIBUTE_BOUNDS: dict[str, tuple[float, float]] = {
    "precipitation_mm": (0.0, 500.0),       # mm/day — 500 mm/day is extreme but possible
    "temperature_c": (-50.0, 60.0),          # °C
    "wind_speed_ms": (0.0, 80.0),            # m/s
    "soil_moisture_pct": (0.0, 100.0),       # %
    "river_level_m": (0.0, 30.0),            # metres above gauge datum
    "magnitude": (0.0, 10.0),               # Richter scale (seismic)
    "depth_km": (0.0, 700.0),               # seismic focal depth
    "severity": (1, 5),                     # CoESCD severity scale 1–5
    "affected_population": (0, 10_000_000), # plausible for Tajikistan incidents
}


@dataclass
class AttributeValidationResult:
    valid: bool = True
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    quarantined_indices: list[int] = field(default_factory=list)

    def add_error(self, idx: int | str, msg: str) -> None:
        self.errors.append(f"[row {idx}] {msg}")
        if isinstance(idx, int):
            self.quarantined_indices.append(idx)
        self.valid = False

    def add_warning(self, idx: int | str, msg: str) -> None:
        self.warnings.append(f"[row {idx}] {msg}")


class AttributeValidator:
    """
    Validates attribute fields on a pandas DataFrame / GeoDataFrame.

    Checks applied:
    1. Required fields are present and non-null
    2. Numeric attributes within physical plausibility bounds
    3. Timestamp fields: not before PLATFORM_START_DATE, not in the future
    4. Duplicate record detection (by primary key or composite key)
    """

    def validate(
        self,
        df: pd.DataFrame,
        required_fields: list[str],
        timestamp_fields: list[str] | None = None,
        primary_key: list[str] | None = None,
    ) -> AttributeValidationResult:
        result = AttributeValidationResult()

        self._check_required_fields(df, required_fields, result)
        self._check_attribute_bounds(df, result)

        if timestamp_fields:
            self._check_timestamps(df, timestamp_fields, result)

        if primary_key:
            self._check_duplicate_records(df, primary_key, result)

        log.info(
            "Attribute validation complete: %d rows, %d errors, %d warnings",
            len(df),
            len(result.errors),
            len(result.warnings),
        )
        return result

    # ------------------------------------------------------------------
    # Internal checks
    # ------------------------------------------------------------------

    def _check_required_fields(
        self,
        df: pd.DataFrame,
        required_fields: list[str],
        result: AttributeValidationResult,
    ) -> None:
        for field_name in required_fields:
            if field_name not in df.columns:
                result.add_error("schema", f"Required field '{field_name}' is missing from dataset")
                continue
            null_mask = df[field_name].isna()
            if null_mask.any():
                for idx in df[null_mask].index:
                    result.add_error(idx, f"Required field '{field_name}' is null")

    def _check_attribute_bounds(
        self, df: pd.DataFrame, result: AttributeValidationResult
    ) -> None:
        for col_name, (lo, hi) in ATTRIBUTE_BOUNDS.items():
            if col_name not in df.columns:
                continue
            series = pd.to_numeric(df[col_name], errors="coerce")
            out_of_range = series.notna() & ((series < lo) | (series > hi))
            for idx in df[out_of_range].index:
                val = df.at[idx, col_name]
                result.add_error(
                    idx,
                    f"Attribute '{col_name}' value {val} is outside plausible range [{lo}, {hi}]",
                )

    def _check_timestamps(
        self,
        df: pd.DataFrame,
        timestamp_fields: list[str],
        result: AttributeValidationResult,
    ) -> None:
        now = datetime.now(tz=timezone.utc)
        max_allowed = now.timestamp() + MAX_FUTURE_SECONDS

        for col_name in timestamp_fields:
            if col_name not in df.columns:
                continue
            try:
                ts_series = pd.to_datetime(df[col_name], utc=True, errors="coerce")
            except Exception as exc:
                result.add_warning("schema", f"Could not parse timestamp column '{col_name}': {exc}")
                continue

            for idx, ts in ts_series.items():
                if pd.isna(ts):
                    continue
                ts_utc = ts.timestamp()
                if ts_utc < PLATFORM_START_DATE.timestamp():
                    result.add_error(
                        idx,
                        f"Timestamp '{col_name}' ({ts.isoformat()}) predates platform start "
                        f"({PLATFORM_START_DATE.date()})",
                    )
                elif ts_utc > max_allowed:
                    result.add_error(
                        idx,
                        f"Timestamp '{col_name}' ({ts.isoformat()}) is in the future beyond "
                        f"allowed tolerance ({MAX_FUTURE_SECONDS}s)",
                    )

    def _check_duplicate_records(
        self,
        df: pd.DataFrame,
        primary_key: list[str],
        result: AttributeValidationResult,
    ) -> None:
        missing_pk_cols = [c for c in primary_key if c not in df.columns]
        if missing_pk_cols:
            result.add_warning(
                "schema", f"Primary key columns {missing_pk_cols} not found; skipping duplicate check"
            )
            return

        duplicate_mask = df.duplicated(subset=primary_key, keep="first")
        for idx in df[duplicate_mask].index:
            pk_values = {col: df.at[idx, col] for col in primary_key}
            result.add_error(idx, f"Duplicate record detected by primary key {pk_values}")
