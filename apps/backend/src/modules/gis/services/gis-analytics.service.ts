import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TimelineQueryDto, TimelineGranularity } from '../dto/timeline-query.dto';

export interface TimelineBucket {
  /** ISO timestamp of the bucket start */
  bucket: string;
  count: number;
  /** Breakdown by incident type within this bucket */
  byType: Record<string, number>;
}

export interface TimelineResponse {
  granularity: TimelineGranularity;
  from: string;
  to: string;
  buckets: TimelineBucket[];
}

const TRUNCATE_MAP: Record<TimelineGranularity, string> = {
  [TimelineGranularity.HOUR]: 'hour',
  [TimelineGranularity.DAY]: 'day',
  [TimelineGranularity.WEEK]: 'week',
  [TimelineGranularity.MONTH]: 'month',
};

@Injectable()
export class GisAnalyticsService {
  private readonly logger = new Logger(GisAnalyticsService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Return incident counts bucketed by time for timeline slider animation.
   * Each bucket includes a per-type breakdown for stacked chart rendering.
   */
  async getIncidentTimeline(
    dto: TimelineQueryDto,
    clearanceLevel: number,
  ): Promise<TimelineResponse> {
    const granularity = dto.granularity ?? TimelineGranularity.DAY;
    const truncUnit = TRUNCATE_MAP[granularity];

    const defaultFrom = new Date();
    defaultFrom.setMonth(defaultFrom.getMonth() - 3);
    const from = dto.from ? new Date(dto.from) : defaultFrom;
    const to = dto.to ? new Date(dto.to) : new Date();

    const params: (string | number)[] = [
      from.toISOString(),
      to.toISOString(),
      clearanceLevel,
    ];

    let whereSql = `
      i.reported_at BETWEEN $1::timestamptz AND $2::timestamptz
      AND i.classification <= $3
    `;

    if (dto.incidentType) {
      params.push(dto.incidentType);
      whereSql += ` AND i.incident_type = $${params.length}`;
    }
    if (dto.administrativeCode) {
      params.push(dto.administrativeCode);
      whereSql += ` AND i.administrative_code = $${params.length}`;
    }

    // Query returns one row per (bucket, incident_type) pair
    const sql = `
      SELECT
        date_trunc('${truncUnit}', i.reported_at AT TIME ZONE 'UTC') AS bucket,
        i.incident_type,
        COUNT(*)::int AS count
      FROM gis.incident_locations i
      WHERE ${whereSql}
      GROUP BY bucket, i.incident_type
      ORDER BY bucket ASC, i.incident_type ASC
    `;

    let rows: Array<{ bucket: Date; incident_type: string; count: number }>;

    try {
      rows = await this.dataSource.query(sql, params);
    } catch (err) {
      this.logger.error('GIS timeline query failed', err);
      return {
        granularity,
        from: from.toISOString(),
        to: to.toISOString(),
        buckets: [],
      };
    }

    // Aggregate flat rows into bucket objects with byType map
    const bucketMap = new Map<string, TimelineBucket>();
    for (const row of rows) {
      const key = new Date(row.bucket).toISOString();
      if (!bucketMap.has(key)) {
        bucketMap.set(key, { bucket: key, count: 0, byType: {} });
      }
      const bucket = bucketMap.get(key)!;
      bucket.count += row.count;
      bucket.byType[row.incident_type] = (bucket.byType[row.incident_type] ?? 0) + row.count;
    }

    return {
      granularity,
      from: from.toISOString(),
      to: to.toISOString(),
      buckets: Array.from(bucketMap.values()),
    };
  }
}
