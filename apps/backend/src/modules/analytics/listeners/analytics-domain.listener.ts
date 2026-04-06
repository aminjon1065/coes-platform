import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AnalyticsService } from '../services/analytics.service';
import { IncidentSeverity, IncidentStatus } from '../entities/incident.entity';

/** Maps GIS/platform incident severity strings to analytics enum values */
const SEVERITY_MAP: Record<string, IncidentSeverity> = {
  low:          IncidentSeverity.MINOR,
  minor:        IncidentSeverity.MINOR,
  medium:       IncidentSeverity.MODERATE,
  moderate:     IncidentSeverity.MODERATE,
  high:         IncidentSeverity.MAJOR,
  major:        IncidentSeverity.MAJOR,
  critical:     IncidentSeverity.CATASTROPHIC,
  catastrophic: IncidentSeverity.CATASTROPHIC,
};

const SYSTEM_CTX = { userId: '00000000-0000-0000-0000-000000000000', clearanceLevel: 3 };

@Injectable()
export class AnalyticsDomainListener {
  private readonly logger = new Logger(AnalyticsDomainListener.name);

  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * gis.incident.reported — auto-register an analytics incident record
   * when the GIS domain records a new incident location.
   */
  @OnEvent('gis.incident.reported')
  async onGisIncidentReported(event: {
    incidentId: string;
    incidentRef: string;
    incidentType: string;
    severity: string;
    administrativeCode: string | null;
    title?: string;
  }): Promise<void> {
    try {
      await this.analyticsService.registerIncident(
        {
          incidentRef:        event.incidentRef,
          title:              event.title ?? `${event.incidentType} incident – ${event.incidentRef}`,
          incidentType:       event.incidentType,
          severity:           SEVERITY_MAP[event.severity?.toLowerCase()] ?? IncidentSeverity.MODERATE,
          administrativeCode: event.administrativeCode ?? undefined,
          classification:     0, // inherits from GIS record; can be updated later
        },
        SYSTEM_CTX,
      );
      this.logger.debug(`Auto-registered analytics incident for ref ${event.incidentRef}`);
    } catch (err) {
      // ConflictException is expected if the incident was already registered manually
      if (err?.status === 409) return;
      this.logger.error(`Failed to auto-register incident ${event.incidentRef}: ${err.message}`);
    }
  }

  /**
   * gis.incident.resolved — mark the corresponding analytics incident as resolved.
   */
  @OnEvent('gis.incident.resolved')
  async onGisIncidentResolved(event: {
    incidentId: string;
    incidentRef: string;
  }): Promise<void> {
    try {
      const incident = await this.analyticsService.getIncidentByRef(event.incidentRef, SYSTEM_CTX);
      if (incident.status === IncidentStatus.CLOSED || incident.status === IncidentStatus.RESOLVED) return;

      await this.analyticsService.updateIncident(
        incident.id,
        { status: IncidentStatus.RESOLVED },
        SYSTEM_CTX,
      );
      this.logger.debug(`Auto-resolved analytics incident for ref ${event.incidentRef}`);
    } catch (err) {
      if (err?.status === 404) return; // Not yet registered — fine
      this.logger.error(`Failed to auto-resolve incident ${event.incidentRef}: ${err.message}`);
    }
  }

  /**
   * edms.resolution_issued — link an EDMS resolution document to the incident.
   */
  @OnEvent('edms.resolution_issued')
  async onEdmsResolutionIssued(event: {
    resolutionId: string;
    documentId: string;
    correlationId?: string;
  }): Promise<void> {
    if (!event.correlationId) return;
    try {
      const incident = await this.analyticsService.getIncidentByRef(event.correlationId, SYSTEM_CTX);
      const docIds = [...new Set([...incident.edmsDocumentIds, event.documentId])];
      await this.analyticsService.updateIncident(
        incident.id,
        { attributes: { ...incident.attributes as object, edmsDocumentIds: docIds } },
        SYSTEM_CTX,
      );
    } catch {
      // Non-critical — incident may not exist in analytics domain yet
    }
  }

  /**
   * analytics.form.submitted — if submission is linked to an incident,
   * auto-enrich the incident with field-analyst data.
   */
  @OnEvent('analytics.form.submitted')
  async onFormSubmitted(event: {
    submissionId: string;
    formId: string;
    incidentRef: string | null;
  }): Promise<void> {
    if (!event.incidentRef) return;
    // Future: extract structured data from submission and update incident attributes
    this.logger.debug(`Form submitted for incident ${event.incidentRef} — enrichment deferred`);
  }
}
