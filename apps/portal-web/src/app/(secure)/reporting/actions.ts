"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createReportDefinition, triggerReportExecution } from "@/lib/reporting";

function toOptionalString(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function toOptionalNumber(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return undefined;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseJsonObject(rawValue: string) {
  if (!rawValue.trim()) {
    return {};
  }

  const parsed = JSON.parse(rawValue);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

export async function createReportDefinitionAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const reportType = String(formData.get("reportType") ?? "").trim();

  if (!name || !reportType) {
    return;
  }

  const definition = await createReportDefinition({
    name,
    description: toOptionalString(formData.get("description")),
    reportType,
    querySpec: parseJsonObject(String(formData.get("querySpecJson") ?? "")),
    defaultFormat: toOptionalString(formData.get("defaultFormat")),
    isScheduled: String(formData.get("isScheduled") ?? "") === "true",
    cronExpression: toOptionalString(formData.get("cronExpression")),
    deliveryChannel: toOptionalString(formData.get("deliveryChannel")),
    deliveryConfig: parseJsonObject(String(formData.get("deliveryConfigJson") ?? "")),
    classification: toOptionalNumber(formData.get("classification")),
  });

  revalidatePath("/reporting");
  redirect(`/reporting/${definition.id}`);
}

export async function triggerReportExecutionAction(formData: FormData) {
  const definitionId = String(formData.get("definitionId") ?? "").trim();
  if (!definitionId) {
    return;
  }

  await triggerReportExecution(
    definitionId,
    parseJsonObject(String(formData.get("parametersJson") ?? "")),
  );

  revalidatePath("/reporting");
  revalidatePath(`/reporting/${definitionId}`);
}
