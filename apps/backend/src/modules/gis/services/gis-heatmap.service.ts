import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { HeatmapQueryDto } from '../dto/heatmap-query.dto';

const SEVERITY_MAP: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export interface HeatmapPoint {
  lng: number;
  lat: number;
  /** Density weight, normalized 0–1 relative to the max in the result set */
  weight: number;
  count: number;
}

export interface HeatmapResponse {
  points: HeatmapPoint[];
  maxCount: number;
}

@Injectable()
export class GisHeatmapService {
  private readonly logger = new Logger(GisHeatmapService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Return incident density points for heatmap rendering.
   * Each point is a 0.05° grid cell aggregated by count, weighted by severity.
   */
  async getHeatmapData(
    dto: HeatmapQueryDto,
    clearanceLevel: number,
  ): Promise<HeatmapResponse> {
    const GRID_DEG = 0.05; // ~5 km grid cells — suitable for country-level heatmap

    const params: (string | number)[] = [
      dto.minLon,
      dto.minLat,
      dto.maxLon,
      dto.maxLat,
      clearanceLevel,
      GRID_DEG,
    ];

    let whereSql = `
      i.location && ST_MakeEnvelope($1, $2, $3, $4, 4326)
      AND i.classification <= $5
    `;

    if (dto.from) {
      params.push(dto.from);
      whereSql += ` AND i.reported_at >= $${params.length}::timestamptz`;
    }
    if (dto.to) {
      params.push(dto.to);
      whereSql += ` AND i.reported_at <= $${params.length}::timestamptz`;
    }
    if (dto.incidentType) {
      params.push(dto.incidentType);
      whereSql += ` AND i.incident_type = $${params.length}`;
    }
    if (dto.minSeverity !== undefined) {
      const severityNames = Object.entries(SEVERITY_MAP)
        .filter(([, v]) => v >= dto.minSeverity!)
        .map(([k]) => k);
      if (severityNames.length) {
        params.push(severityNames.join(','));
        whereSql += ` AND i.severity = ANY(string_to_array($${params.length}, ','))`;
      }
    }

    const sql = `
      SELECT
        round(ST_X(ST_Centroid(ST_Collect(i.location))) / $6, 4) * $6 AS lng,
        round(ST_Y(ST_Centroid(ST_Collect(i.location))) / $6, 4) * $6 AS lat,
        COUNT(*)::int AS count,
        SUM(
          CASE i.severity
            WHEN 'critical' THEN 4
            WHEN 'high'     THEN 3
            WHEN 'medium'   THEN 2
            ELSE 1
          END
        )::int AS weight_sum
      FROM gis.incident_locations i
      WHERE ${whereSql}
      GROUP BY
        round(ST_X(i.location) / $6) * $6,
        round(ST_Y(i.location) / $6) * $6
      ORDER BY count DESC
      LIMIT 2000
    `;

    let rows: Array<{
      lng: number;
      lat: number;
      count: number;
      weight_sum: number;
    }>;

    try {
      rows = await this.dataSource.query(sql, params);
    } catch (err) {
      this.logger.error('GIS heatmap query failed', err);
      return { points: [], maxCount: 0 };
    }

    if (!rows.length) return { points: [], maxCount: 0 };

    const maxCount = Math.max(...rows.map((r) => r.count));

    const points: HeatmapPoint[] = rows.map((row) => ({
      lng: Number(row.lng),
      lat: Number(row.lat),
      weight: maxCount > 0 ? row.count / maxCount : 0,
      count: row.count,
    }));

    return { points, maxCount };
  }
}
