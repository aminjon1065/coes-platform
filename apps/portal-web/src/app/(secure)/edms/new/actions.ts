"use server";

import { redirect } from "next/navigation";
import { createDocument } from "@/lib/edms";

type ParsedRecipient = {
  name: string;
  type: "internal" | "external";
  positionId?: string;
};

function parseRecipients(rawValue: string) {
  return rawValue
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, type = "external", positionId = ""] = line.split("|").map((part) => part.trim());
      return {
        name,
        type: type === "internal" ? "internal" : "external",
        positionId: positionId || undefined,
      } satisfies ParsedRecipient;
    })
    .filter((item) => item.name);
}

export async function createDocumentAction(formData: FormData) {
  const typeId = String(formData.get("typeId") ?? "");
  const direction = String(formData.get("direction") ?? "") as
    | "incoming"
    | "outgoing"
    | "internal";
  const subject = String(formData.get("subject") ?? "").trim();

  if (!typeId || !direction || !subject) {
    return;
  }

  const document = await createDocument({
    typeId,
    direction,
    subject,
    classification: Number(formData.get("classification") ?? 1),
    senderPositionId: String(formData.get("senderPositionId") ?? "").trim() || undefined,
    senderName: String(formData.get("senderName") ?? "").trim() || undefined,
    externalRefNumber: String(formData.get("externalRefNumber") ?? "").trim() || undefined,
    recipients: parseRecipients(String(formData.get("recipients") ?? "")),
    body: String(formData.get("body") ?? "").trim() || undefined,
    deadline: String(formData.get("deadline") ?? "").trim() || undefined,
    relatedDocumentId: String(formData.get("relatedDocumentId") ?? "").trim() || undefined,
    documentDate: String(formData.get("documentDate") ?? "").trim() || undefined,
  });

  redirect(`/edms/${document.id}`);
}
