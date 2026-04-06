"""
PostGIS loader for CoESCD spatial data pipelines.

Writes validated, enriched GeoDataFrames into the GIS domain's PostGIS tables.
Supports upsert (INSERT … ON CONFLICT DO UPDATE) to handle re-runs and
incremental loads without creating duplicates.
"""

from __future__ import annotations

import logging
from typing import Any

import geopandas as gpd
import pandas as pd
from sqlalchemy import create_engine, text

log = logging.getLogger(__name__)

# Schema used by GIS domain
GIS_SCHEMA = "gis"


class PostGISLoader:
    """
    Loads a GeoDataFrame into a PostGIS table using a connection string.

    Args:
        conn_string: SQLAlchemy PostgreSQL connection string.
                     Expected to point at the CoESCD main database.
    """

    def __init__(self, conn_string: str) -> None:
        self._engine = create_engine(conn_string, future=True)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def upsert_features(
        self,
        gdf: gpd.GeoDataFrame,
        table_name: str,
        conflict_columns: list[str],
        geometry_column: str = "geometry",
        schema: str = GIS_SCHEMA,
        srid: int = 4326,
    ) -> int:
        """
        Upsert features into a PostGIS table.

        Uses geopandas.to_postgis for the initial write to a temp table,
        then executes INSERT … ON CONFLICT DO UPDATE from the temp table
        into the target table. This avoids duplicates on re-run.

        Returns the number of rows upserted.
        """
        if gdf.empty:
            log.info("GeoDataFrame is empty; nothing to upsert into %s.%s", schema, table_name)
            return 0

        temp_table = f"_pipeline_tmp_{table_name}"
        log.info(
            "Upserting %d features into %s.%s (conflict on %s)",
            len(gdf),
            schema,
            table_name,
            conflict_columns,
        )

        with self._engine.begin() as conn:
            # Write to temp table (replace on every run)
            gdf.to_postgis(
                name=temp_table,
                con=conn,
                schema=schema,
                if_exists="replace",
                index=False,
                dtype={geometry_column: self._geometry_type(gdf, geometry_column, srid)},
            )

            # Build upsert SQL
            non_geom_cols = [c for c in gdf.columns if c != geometry_column]
            col_list = ", ".join(f'"{c}"' for c in non_geom_cols) + f', "{geometry_column}"'
            update_set = ", ".join(
                f'"{c}" = EXCLUDED."{c}"'
                for c in non_geom_cols + [geometry_column]
                if c not in conflict_columns
            )
            conflict_cols = ", ".join(f'"{c}"' for c in conflict_columns)

            sql = text(f"""
                INSERT INTO {schema}."{table_name}" ({col_list})
                SELECT {col_list}
                FROM {schema}."{temp_table}"
                ON CONFLICT ({conflict_cols}) DO UPDATE SET {update_set}
            """)
            result = conn.execute(sql)
            rows_affected = result.rowcount

            # Drop temp table
            conn.execute(text(f'DROP TABLE IF EXISTS {schema}."{temp_table}"'))

        log.info("Upsert complete: %d rows affected in %s.%s", rows_affected, schema, table_name)
        return rows_affected

    def bulk_insert(
        self,
        gdf: gpd.GeoDataFrame,
        table_name: str,
        geometry_column: str = "geometry",
        schema: str = GIS_SCHEMA,
        srid: int = 4326,
        if_exists: str = "append",
    ) -> int:
        """
        Bulk append features without conflict handling.

        Use this only for append-only tables or when duplicates are acceptable
        (e.g., time-series measurements with natural-key deduplication upstream).
        """
        if gdf.empty:
            log.info("GeoDataFrame is empty; nothing to insert into %s.%s", schema, table_name)
            return 0

        log.info("Bulk inserting %d rows into %s.%s", len(gdf), schema, table_name)
        with self._engine.begin() as conn:
            gdf.to_postgis(
                name=table_name,
                con=conn,
                schema=schema,
                if_exists=if_exists,
                index=False,
                dtype={geometry_column: self._geometry_type(gdf, geometry_column, srid)},
            )
        log.info("Bulk insert complete")
        return len(gdf)

    def refresh_materialized_view(self, view_name: str, schema: str = GIS_SCHEMA) -> None:
        """Refresh a PostGIS materialized view after data load."""
        log.info("Refreshing materialized view %s.%s", schema, view_name)
        with self._engine.begin() as conn:
            conn.execute(text(f"REFRESH MATERIALIZED VIEW CONCURRENTLY {schema}.{view_name}"))
        log.info("Materialized view %s.%s refreshed", schema, view_name)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _geometry_type(gdf: gpd.GeoDataFrame, geom_col: str, srid: int) -> Any:
        from geoalchemy2 import Geometry

        geom_types = gdf[geom_col].geom_type.dropna().unique()
        if len(geom_types) == 0:
            return Geometry(srid=srid)
        # If all features are the same geometry type use it explicitly
        if len(geom_types) == 1:
            return Geometry(geom_types[0].upper(), srid=srid)
        # Mixed geometry types — use generic GEOMETRY
        return Geometry(srid=srid)
