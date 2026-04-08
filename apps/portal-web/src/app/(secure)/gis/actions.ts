"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { reportGisIncident, resolveGisIncident } from "@/lib/gis";

function parseNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function reportIncidentAction(formData: FormData) {
  const incidentRef = String(formData.get("incidentRef") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const incidentType = String(formData.get("incidentType") ?? "").trim();
  const lon = parseNumber(formData.get("lon"));
  const lat = parseNumber(formData.get("lat"));

  if (!incidentRef || !title || !incidentType || lon == null || lat == null) {
    return;
  }

  await reportGisIncident({
    incidentRef,
    title,
    incidentType,
    severity: String(formData.get("severity") ?? "").trim() || undefined,
    lon,
    lat,
    administrativeCode:
      String(formData.get("administrativeCode") ?? "").trim() || undefined,
    classification: Number(formData.get("classification") ?? 1),
    reportedAt: String(formData.get("reportedAt") ?? "").trim() || undefined,
  });

  revalidatePath("/gis");
  redirect("/gis");
}

export async function resolveIncidentAction(formData: FormData) {
  const incidentId = String(formData.get("incidentId") ?? "").trim();
  if (!incidentId) {
    return;
  }

  await resolveGisIncident(incidentId);
  revalidatePath("/gis");
}
