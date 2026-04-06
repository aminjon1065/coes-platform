"""
Spatial format normalizer for CoESCD pipelines.

Reads GeoJSON, Shapefile, KML, GeoPackage, or CSV-with-coordinates into a
canonical GeoDataFrame with WGS84 geometry. All downstream pipeline stages
consume the canonical GeoDataFrame — they never read raw source files.
"""

from __future__ import annotations

import csv
import io
import json
import logging
import os
from pathlib import Path
from typing import Any

import geopandas as gpd
import pandas as pd
from shapely.geometry import Point

log = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS = {
    ".geojson": "geojson",
    ".json": "geojson",
    ".shp": "shapefile",
    ".kml": "kml",
    ".kmz": "kml",
    ".gpkg": "geopackage",
    ".csv": "csv",
    ".xlsx": "excel",
    ".xls": "excel",
}

# Standard column name candidates for longitude/latitude in tabular files
LON_CANDIDATES = {"longitude", "lon", "long", "x", "lng", "lng_wgs84"}
LAT_CANDIDATES = {"latitude", "lat", "y", "lat_wgs84"}


class FormatNormalizer:
    """
    Reads a spatial file from disk or a bytes buffer into a canonical GeoDataFrame.

    The returned GeoDataFrame:
    - Has CRS EPSG:4326 (WGS84)
    - Has a 'geometry' column of shapely geometries
    - Has all original attributes preserved as columns
    """

    def normalize_file(self, file_path: str | Path) -> gpd.GeoDataFrame:
        path = Path(file_path)
        ext = path.suffix.lower()
        fmt = SUPPORTED_EXTENSIONS.get(ext)
        if fmt is None:
            raise ValueError(
                f"Unsupported file extension '{ext}'. "
                f"Supported: {list(SUPPORTED_EXTENSIONS)}"
            )
        log.info("Normalizing %s (format: %s)", path.name, fmt)

        if fmt == "geojson":
            return self._read_geojson(path)
        elif fmt == "shapefile":
            return self._read_vector(path)
        elif fmt == "kml":
            return self._read_kml(path)
        elif fmt == "geopackage":
            return self._read_vector(path)
        elif fmt == "csv":
            return self._read_csv(path)
        elif fmt == "excel":
            return self._read_excel(path)
        raise RuntimeError(f"Unhandled format {fmt}")  # unreachable

    def normalize_geojson_dict(self, geojson: dict[str, Any]) -> gpd.GeoDataFrame:
        """Normalize an already-parsed GeoJSON dict (e.g. from API response)."""
        buf = io.BytesIO(json.dumps(geojson).encode())
        return gpd.read_file(buf)

    # ------------------------------------------------------------------
    # Format readers
    # ------------------------------------------------------------------

    def _read_geojson(self, path: Path) -> gpd.GeoDataFrame:
        gdf = gpd.read_file(str(path))
        return self._ensure_wgs84(gdf)

    def _read_vector(self, path: Path) -> gpd.GeoDataFrame:
        gdf = gpd.read_file(str(path), engine="pyogrio")
        return self._ensure_wgs84(gdf)

    def _read_kml(self, path: Path) -> gpd.GeoDataFrame:
        # Enable KML driver for fiona / pyogrio
        gpd.io.file.fiona.drvsupport.supported_drivers["LIBKML"] = "rw"
        gpd.io.file.fiona.drvsupport.supported_drivers["KML"] = "rw"
        gdf = gpd.read_file(str(path), driver="KML")
        return self._ensure_wgs84(gdf)

    def _read_csv(self, path: Path) -> gpd.GeoDataFrame:
        df = pd.read_csv(str(path))
        return self._tabular_to_gdf(df, source_name=path.name)

    def _read_excel(self, path: Path) -> gpd.GeoDataFrame:
        df = pd.read_excel(str(path))
        return self._tabular_to_gdf(df, source_name=path.name)

    def _tabular_to_gdf(self, df: pd.DataFrame, source_name: str) -> gpd.GeoDataFrame:
        """Convert a DataFrame with longitude/latitude columns to a GeoDataFrame."""
        cols_lower = {c.lower(): c for c in df.columns}

        lon_col = next((cols_lower[c] for c in LON_CANDIDATES if c in cols_lower), None)
        lat_col = next((cols_lower[c] for c in LAT_CANDIDATES if c in cols_lower), None)

        if lon_col is None or lat_col is None:
            raise ValueError(
                f"Cannot find longitude/latitude columns in '{source_name}'. "
                f"Columns present: {list(df.columns)}. "
                f"Expected one of lon={list(LON_CANDIDATES)}, lat={list(LAT_CANDIDATES)}"
            )

        log.info(
            "Building point geometry from columns: lon='%s', lat='%s'", lon_col, lat_col
        )
        geometry = gpd.points_from_xy(df[lon_col], df[lat_col])
        gdf = gpd.GeoDataFrame(df, geometry=geometry, crs="EPSG:4326")
        return gdf

    def _ensure_wgs84(self, gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
        if gdf.crs is None:
            log.warning("Input GeoDataFrame has no CRS; assuming WGS84")
            gdf = gdf.set_crs(epsg=4326)
        elif gdf.crs.to_epsg() != 4326:
            log.info("Reprojecting from EPSG:%s to WGS84", gdf.crs.to_epsg())
            gdf = gdf.to_crs(epsg=4326)
        return gdf
