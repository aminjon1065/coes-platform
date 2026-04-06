"""
Spatial data quality validation for CoESCD pipelines.

Validates geometry validity, coordinate reference system, and that all
features fall within Tajikistan's bounding box (WGS84).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import geopandas as gpd
from pyproj import CRS
from shapely.validation import make_valid

log = logging.getLogger(__name__)

# Tajikistan bounding box in WGS84 (EPSG:4326)
# Sourced from Natural Earth / GADM administrative boundary data
TJK_BBOX = {
    "min_lon": 67.34,
    "max_lon": 75.15,
    "min_lat": 36.67,
    "max_lat": 41.05,
}

# Tajikistan UTM Zone 39N — metric CRS used for distance/area calculations
UTM_39N_EPSG = 32639
WGS84_EPSG = 4326

# Minimum area threshold for polygon features (square metres in UTM39N)
# Rejects polygons smaller than 1 m² — likely data errors
MIN_POLYGON_AREA_M2 = 1.0


@dataclass
class ValidationResult:
    valid: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    quarantined_indices: list[int] = field(default_factory=list)
    repaired_indices: list[int] = field(default_factory=list)

    def add_error(self, idx: int, msg: str) -> None:
        self.errors.append(f"[row {idx}] {msg}")
        self.quarantined_indices.append(idx)
        self.valid = False

    def add_warning(self, idx: int, msg: str) -> None:
        self.warnings.append(f"[row {idx}] {msg}")


class SpatialValidator:
    """
    Validates a GeoDataFrame against CoESCD spatial quality rules.

    Rules applied:
    1. Non-null geometry
    2. Geometry validity (ST_IsValid equivalent); auto-repair attempted
    3. Coordinates within Tajikistan bounding box
    4. Polygon minimum area (> MIN_POLYGON_AREA_M2 in UTM39N)
    5. No duplicate geometries (exact WKB match)
    6. Source CRS must be reprojectable (not undefined)
    """

    def validate(self, gdf: gpd.GeoDataFrame) -> ValidationResult:
        result = ValidationResult(valid=True)

        if gdf is None or len(gdf) == 0:
            result.add_error(-1, "GeoDataFrame is empty or None")
            return result

        self._check_crs(gdf, result)
        gdf = self._normalize_crs(gdf, result)
        self._check_null_geometries(gdf, result)
        gdf = self._repair_invalid_geometries(gdf, result)
        self._check_bbox(gdf, result)
        self._check_min_area(gdf, result)
        self._check_duplicate_geometries(gdf, result)

        log.info(
            "Spatial validation complete: %d features, %d errors, %d warnings, "
            "%d quarantined, %d repaired",
            len(gdf),
            len(result.errors),
            len(result.warnings),
            len(result.quarantined_indices),
            len(result.repaired_indices),
        )
        return result

    # ------------------------------------------------------------------
    # Internal checks
    # ------------------------------------------------------------------

    def _check_crs(self, gdf: gpd.GeoDataFrame, result: ValidationResult) -> None:
        if gdf.crs is None:
            result.add_error(-1, "GeoDataFrame has no CRS defined — cannot reproject")
        elif gdf.crs.is_geographic is False and gdf.crs.to_epsg() is None:
            result.add_warning(-1, f"Unknown projected CRS: {gdf.crs.to_string()}")

    def _normalize_crs(self, gdf: gpd.GeoDataFrame, result: ValidationResult) -> gpd.GeoDataFrame:
        """Reproject to WGS84 if the input uses a different CRS."""
        if gdf.crs is None:
            return gdf
        target = CRS.from_epsg(WGS84_EPSG)
        if gdf.crs != target:
            log.info("Reprojecting from %s to WGS84", gdf.crs.to_string())
            gdf = gdf.to_crs(epsg=WGS84_EPSG)
        return gdf

    def _check_null_geometries(self, gdf: gpd.GeoDataFrame, result: ValidationResult) -> None:
        null_mask = gdf.geometry.isna() | gdf.geometry.is_empty
        for idx in gdf[null_mask].index:
            result.add_error(idx, "Null or empty geometry")

    def _repair_invalid_geometries(
        self, gdf: gpd.GeoDataFrame, result: ValidationResult
    ) -> gpd.GeoDataFrame:
        """Attempt buffer(0) / make_valid repair on invalid geometries."""
        invalid_mask = ~gdf.geometry.is_valid & ~gdf.geometry.isna()
        for idx in gdf[invalid_mask].index:
            original = gdf.at[idx, "geometry"]
            repaired = make_valid(original)
            if repaired.is_valid:
                gdf.at[idx, "geometry"] = repaired
                result.repaired_indices.append(idx)
                result.add_warning(idx, "Invalid geometry — auto-repaired with make_valid()")
            else:
                result.add_error(idx, "Invalid geometry — could not repair; quarantined")
        return gdf

    def _check_bbox(self, gdf: gpd.GeoDataFrame, result: ValidationResult) -> None:
        """Reject features whose centroid falls outside Tajikistan's bounding box."""
        for idx, row in gdf.iterrows():
            geom = row.geometry
            if geom is None or geom.is_empty:
                continue
            centroid = geom.centroid
            lon, lat = centroid.x, centroid.y
            if not (
                TJK_BBOX["min_lon"] <= lon <= TJK_BBOX["max_lon"]
                and TJK_BBOX["min_lat"] <= lat <= TJK_BBOX["max_lat"]
            ):
                result.add_error(
                    idx,
                    f"Feature centroid ({lon:.4f}, {lat:.4f}) is outside Tajikistan bounding box",
                )

    def _check_min_area(self, gdf: gpd.GeoDataFrame, result: ValidationResult) -> None:
        """For polygon types, reject zero-area or suspiciously tiny polygons."""
        polygon_types = {"Polygon", "MultiPolygon"}
        polygon_mask = gdf.geometry.geom_type.isin(polygon_types) & ~gdf.geometry.isna()
        if not polygon_mask.any():
            return

        # Project to UTM39N for accurate metric area
        try:
            gdf_utm = gdf[polygon_mask].to_crs(epsg=UTM_39N_EPSG)
        except Exception as exc:
            result.add_warning(-1, f"UTM39N reprojection failed for area check: {exc}")
            return

        for idx, row in gdf_utm.iterrows():
            if row.geometry is None or row.geometry.is_empty:
                continue
            area_m2 = row.geometry.area
            if area_m2 < MIN_POLYGON_AREA_M2:
                result.add_error(
                    idx,
                    f"Polygon area {area_m2:.4f} m² is below minimum threshold "
                    f"({MIN_POLYGON_AREA_M2} m²) — likely a data error",
                )

    def _check_duplicate_geometries(
        self, gdf: gpd.GeoDataFrame, result: ValidationResult
    ) -> None:
        wkb_series = gdf.geometry.apply(
            lambda g: g.wkb if g is not None and not g.is_empty else None
        )
        duplicates = wkb_series.duplicated(keep="first")
        for idx in gdf[duplicates].index:
            result.add_warning(idx, "Duplicate geometry detected (exact WKB match)")
