"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  createAnalyticsForm,
  createAnalyticsIncident,
  deployAnalyticsResource,
  publishAnalyticsForm,
  recordAnalyticsIncidentResponse,
  requestAnalyticsReport,
  reviewAnalyticsSubmission,
  submitAnalyticsForm,
  updateAnalyticsIncident,
  withdrawAnalyticsResource,
} from "@/lib/analytics";

function toOptionalNumber(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return undefined;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toOptionalString(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function parseJsonArray(rawValue: string) {
  if (!rawValue.trim()) {
    return [];
  }

  const parsed = JSON.parse(rawValue);
  return Array.isArray(parsed) ? parsed : [];
}

function parseJsonObject(rawValue: string) {
  if (!rawValue.trim()) {
    return {};
  }

  const parsed = JSON.parse(rawValue);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

export async function createAnalyticsIncidentAction(formData: FormData) {
  const incidentRef = String(formData.get("incidentRef") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const incidentType = String(formData.get("incidentType") ?? "").trim();

  if (!incidentRef || !title || !incidentType) {
    return;
  }

  const incident = await createAnalyticsIncident({
    incidentRef,
    title,
    incidentType,
    severity: toOptionalString(formData.get("severity")),
    administrativeCode: toOptionalString(formData.get("administrativeCode")),
    administrativeName: toOptionalString(formData.get("administrativeName")),
    latitude: toOptionalNumber(formData.get("latitude")),
    longitude: toOptionalNumber(formData.get("longitude")),
    affectedAreaKm2: toOptionalNumber(formData.get("affectedAreaKm2")),
    affectedPopulation: toOptionalNumber(formData.get("affectedPopulation")),
    classification: Number(formData.get("classification") ?? 0),
    responsibleDeptId: toOptionalString(formData.get("responsibleDeptId")),
    reportedAt: toOptionalString(formData.get("reportedAt")),
  });

  revalidatePath("/analytics");
  revalidatePath("/analytics/incidents");
  redirect(`/analytics/incidents/${incident.id}`);
}

export async function updateAnalyticsIncidentAction(formData: FormData) {
  const incidentId = String(formData.get("incidentId") ?? "").trim();
  if (!incidentId) {
    return;
  }

  await updateAnalyticsIncident(incidentId, {
    severity: toOptionalString(formData.get("severity")),
    status: toOptionalString(formData.get("status")),
    affectedPopulation: toOptionalNumber(formData.get("affectedPopulation")),
    casualtiesConfirmed: toOptionalNumber(formData.get("casualtiesConfirmed")),
    casualtiesSuspected: toOptionalNumber(formData.get("casualtiesSuspected")),
    affectedAreaKm2: toOptionalNumber(formData.get("affectedAreaKm2")),
    internalNotes: toOptionalString(formData.get("internalNotes")),
    leadResponderId: toOptionalString(formData.get("leadResponderId")),
    responsibleDeptId: toOptionalString(formData.get("responsibleDeptId")),
  });

  revalidatePath("/analytics");
  revalidatePath("/analytics/incidents");
  revalidatePath(`/analytics/incidents/${incidentId}`);
}

export async function recordAnalyticsResponseAction(formData: FormData) {
  const incidentId = String(formData.get("incidentId") ?? "").trim();
  const action = String(formData.get("action") ?? "").trim();

  if (!incidentId || !action) {
    return;
  }

  await recordAnalyticsIncidentResponse(incidentId, {
    action,
    description: toOptionalString(formData.get("description")),
    locationNote: toOptionalString(formData.get("locationNote")),
    occurredAt: toOptionalString(formData.get("occurredAt")),
    outcome: toOptionalString(formData.get("outcome")),
  });

  revalidatePath("/analytics");
  revalidatePath("/analytics/incidents");
  revalidatePath(`/analytics/incidents/${incidentId}`);
}

export async function deployAnalyticsResourceAction(formData: FormData) {
  const incidentId = String(formData.get("incidentId") ?? "").trim();
  const resourceType = String(formData.get("resourceType") ?? "").trim();
  const resourceName = String(formData.get("resourceName") ?? "").trim();

  if (!incidentId || !resourceType || !resourceName) {
    return;
  }

  await deployAnalyticsResource(incidentId, {
    resourceType,
    resourceName,
    quantity: toOptionalNumber(formData.get("quantity")),
    unit: toOptionalString(formData.get("unit")),
    deptId: toOptionalString(formData.get("deptId")),
    deployedAt: toOptionalString(formData.get("deployedAt")),
    costEstimate: toOptionalNumber(formData.get("costEstimate")),
    notes: toOptionalString(formData.get("notes")),
  });

  revalidatePath("/analytics");
  revalidatePath("/analytics/incidents");
  revalidatePath(`/analytics/incidents/${incidentId}`);
}

export async function withdrawAnalyticsResourceAction(formData: FormData) {
  const resourceId = String(formData.get("resourceId") ?? "").trim();
  const incidentId = String(formData.get("incidentId") ?? "").trim();

  if (!resourceId || !incidentId) {
    return;
  }

  await withdrawAnalyticsResource(resourceId);
  revalidatePath("/analytics");
  revalidatePath("/analytics/incidents");
  revalidatePath(`/analytics/incidents/${incidentId}`);
}

export async function createAnalyticsFormAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const fieldsRaw = String(formData.get("fieldsJson") ?? "").trim();

  if (!name || !fieldsRaw) {
    return;
  }

  await createAnalyticsForm({
    name,
    description: toOptionalString(formData.get("description")),
    incidentType: toOptionalString(formData.get("incidentType")),
    classification: Number(formData.get("classification") ?? 0),
    fields: parseJsonArray(fieldsRaw),
  });

  revalidatePath("/analytics");
  revalidatePath("/analytics/forms");
}

export async function publishAnalyticsFormAction(formData: FormData) {
  const formId = String(formData.get("formId") ?? "").trim();
  if (!formId) {
    return;
  }

  await publishAnalyticsForm(formId);
  revalidatePath("/analytics");
  revalidatePath("/analytics/forms");
  revalidatePath(`/analytics/forms/${formId}`);
}

export async function submitAnalyticsFormAction(formData: FormData) {
  const formId = String(formData.get("formId") ?? "").trim();
  const dataJson = String(formData.get("dataJson") ?? "").trim();

  if (!formId || !dataJson) {
    return;
  }

  await submitAnalyticsForm(formId, {
    incidentId: toOptionalString(formData.get("incidentId")),
    incidentRef: toOptionalString(formData.get("incidentRef")),
    data: parseJsonObject(dataJson),
    locationLat: toOptionalNumber(formData.get("locationLat")),
    locationLon: toOptionalNumber(formData.get("locationLon")),
  });

  revalidatePath("/analytics");
  revalidatePath("/analytics/forms");
  revalidatePath(`/analytics/forms/${formId}`);
}

export async function reviewAnalyticsSubmissionAction(formData: FormData) {
  const submissionId = String(formData.get("submissionId") ?? "").trim();
  const formId = String(formData.get("formId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();

  if (!submissionId || !formId || !status) {
    return;
  }

  await reviewAnalyticsSubmission(submissionId, {
    status,
    notes: toOptionalString(formData.get("notes")),
  });

  revalidatePath("/analytics");
  revalidatePath("/analytics/forms");
  revalidatePath(`/analytics/forms/${formId}`);
}

export async function requestAnalyticsReportAction(formData: FormData) {
  const reportType = String(formData.get("reportType") ?? "").trim();
  if (!reportType) {
    return;
  }

  await requestAnalyticsReport({
    reportType,
    from: toOptionalString(formData.get("from")),
    to: toOptionalString(formData.get("to")),
    incidentType: toOptionalString(formData.get("incidentType")),
    administrativeCode: toOptionalString(formData.get("administrativeCode")),
    format: toOptionalString(formData.get("format")),
    classification: toOptionalNumber(formData.get("classification")),
  });

  revalidatePath("/analytics");
  revalidatePath("/analytics/reports");
}
