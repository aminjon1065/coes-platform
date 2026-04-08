"use client";

import type { GisIncidentFeature } from "@/lib/gis";
import { usePortalRealtimeRoom } from "@/components/realtime/usePortalRealtimeRoom";

type BackendRealtimeIncident = {
  id: string;
  incidentRef: string;
  title: string;
  incidentType: string;
  severity: string;
  administrativeCode: string | null;
  classification: number;
  reportedAt: string;
  resolvedAt: string | null;
  location: {
    type: "Point";
    coordinates: [number, number];
  };
  elevationM: number | null;
  distanceToRiverM?: number | null;
  distanceToRoadM?: number | null;
};

function normalizeValue(value: string) {
  return value.toLowerCase();
}

function severityToRank(value: string) {
  const normalized = normalizeValue(value);
  switch (normalized) {
    case "low":
      return 1;
    case "medium":
      return 2;
    case "significant":
      return 3;
    case "high":
      return 4;
    case "critical":
      return 5;
    default:
      return 0;
  }
}

function normalizeIncident(payload: BackendRealtimeIncident): GisIncidentFeature | null {
  if (!payload.location?.coordinates || payload.location.coordinates.length !== 2) {
    return null;
  }

  return {
    id: payload.id,
    incidentRef: payload.incidentRef,
    title: payload.title,
    incidentType: normalizeValue(payload.incidentType),
    severity: normalizeValue(payload.severity),
    severityRank: severityToRank(payload.severity),
    administrativeCode: payload.administrativeCode,
    classification: payload.classification,
    reportedAt: payload.reportedAt,
    resolvedAt: payload.resolvedAt,
    coordinates: payload.location.coordinates,
    elevationM: payload.elevationM,
    distanceToRiverM: payload.distanceToRiverM ?? null,
    distanceToRoadM: payload.distanceToRoadM ?? null,
  };
}

type UseGisRealtimeOptions = {
  onIncidentUpsert: (incident: GisIncidentFeature) => void;
};

export function useGisRealtime({ onIncidentUpsert }: UseGisRealtimeOptions) {
  return usePortalRealtimeRoom({
    roomId: "gis.incidents",
    onMessage(message) {
      const eventName =
        (typeof message.event === "string" ? message.event : undefined) ??
        (typeof message.type === "string" ? message.type : undefined);
      const payload = (message.data ?? message.payload) as
        | BackendRealtimeIncident
        | undefined;

      if (
        (eventName === "gis.incident.reported" ||
          eventName === "gis.incident.resolved") &&
        payload
      ) {
        const incident = normalizeIncident(payload);
        if (incident) {
          onIncidentUpsert(incident);
        }
      }
    },
  });
}
