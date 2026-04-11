import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { ClusterQueryDto } from '../dto/cluster-query.dto';

export interface ClusterFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: {
    count: number;
    incidentIds: string[];
    severities: string[];
  };
}

export interface ClusterFeatureCollection {
  type: 'FeatureCollection';
  features: ClusterFeature[];
}

/**
 * Derives a PostGIS grid resolution from a map zoom level.
 * Higher zoom = smaller grid cells = more clusters (finer detail).
 */
function gridSizeFromZoom(zoom: number): number {
  // Empirical mapping: zoom 0 → 10°, zoom 10 → 0.1°, zoom 18 → 0.0005°
  return Math.max(0.0005, 10 / Math.pow(2, zoom));
}

@Injectable()
export class GisClusteringService {
  private readonly logger = new Logger(GisClusteringService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Cluster incident locations within a bounding box at a given zoom level.
   * Returns a GeoJSON FeatureCollection of cluster points.
   */
  async clusterIncidents(
    dto: ClusterQueryDto,
    clearanceLevel: number,
  ): Promise<ClusterFeatureCollection> {
    const gridSize = gridSizeFromZoom(dto.zoom);

    const params: (string | number | boolean)[] = [
      dto.minLon,
      dto.minLat,
      dto.maxLon,
      dto.maxLat,
      gridSize,
      clearanceLevel,
    ];

    let whereSql = `
      i.location && ST_MakeEnvelope($1, $2, $3, $4, 4326)
      AND i.classification <= $6
    `;

    if (dto.openOnly === 'true') {
      whereSql += ' AND i.resolved_at IS NULL';
    }

    if (dto.incidentType) {
      params.push(dto.incidentType);
      whereSql += ` AND i.incident_type = $${params.length}`;
    }

    const sql = `
      SELECT
        ST_X(ST_Centroid(ST_Collect(i.location)))              AS lng,
        ST_Y(ST_Centroid(ST_Collect(i.location)))              AS lat,
        COUNT(*)::int                                           AS count,
        array_agg(i.id::text)                                   AS incident_ids,
        array_agg(DISTINCT i.severity)                          AS severities
      FROM gis.incident_locations i
      WHERE ${whereSql}
      GROUP BY ST_SnapToGrid(i.location, $5)
      ORDER BY count DESC
    `;

    let rows: Array<{
      lng: number;
      lat: number;
      count: number;
      incident_ids: string[];
      severities: string[];
    }>;

    try {
      rows = await this.dataSource.query(sql, params);
    } catch (err) {
      this.logger.error('GIS clustering query failed', err);
      return { type: 'FeatureCollection', features: [] };
    }

    const features: ClusterFeature[] = rows.map((row) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [Number(row.lng), Number(row.lat)],
      },
      properties: {
        count: row.count,
        incidentIds: row.incident_ids ?? [],
        severities: row.severities ?? [],
      },
    }));

    return { type: 'FeatureCollection', features };
  }
}
