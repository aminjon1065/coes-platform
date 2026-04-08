"use server";

import { revalidatePath } from "next/cache";
import {
  actOnWorkflowStep,
  addDocumentAttachment,
  fileExecutorCompletionReport,
  issueDocumentResolution,
  registerDocument,
  removeDocumentAttachment,
  resumeDocumentWorkflow,
  startDocumentWorkflow,
  transitionDocument,
  updateDocument,
} from "@/lib/edms";

type ParsedRecipient = {
  name: string;
  type: "internal" | "external";
  positionId?: string;
};

type ParsedExecutor = {
  positionId: string;
  role?: string;
  instruction?: string;
  deadline?: string;
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

function parseExecutors(rawValue: string) {
  return rawValue
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [positionId, role = "primary", instruction = "", deadline = ""] = line
        .split("|")
        .map((part) => part.trim());
      return {
        positionId,
        role: role || undefined,
        instruction: instruction || undefined,
        deadline: deadline || undefined,
      } satisfies ParsedExecutor;
    })
    .filter((item) => item.positionId);
}

function revalidateDocumentViews(documentId: string) {
  revalidatePath(`/edms/${documentId}`);
  revalidatePath("/edms");
  revalidatePath("/edms/archive");
  revalidatePath("/dashboard");
}

export async function updateDocumentAction(formData: FormData) {
  const documentId = String(formData.get("documentId") ?? "");
  const subject = String(formData.get("subject") ?? "").trim();

  if (!documentId || !subject) {
    return;
  }

  await updateDocument(documentId, {
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
    changeReason: String(formData.get("changeReason") ?? "").trim() || undefined,
  });

  revalidateDocumentViews(documentId);
}

export async function registerDocumentAction(formData: FormData) {
  const documentId = String(formData.get("documentId") ?? "");
  if (!documentId) return;

  await registerDocument(documentId, {
    registrarPositionId:
      String(formData.get("registrarPositionId") ?? "").trim() || undefined,
    documentDate: String(formData.get("documentDate") ?? "").trim() || undefined,
  });

  revalidateDocumentViews(documentId);
}

export async function transitionDocumentAction(formData: FormData) {
  const documentId = String(formData.get("documentId") ?? "");
  const targetStatus = String(formData.get("targetStatus") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!documentId || !targetStatus) {
    return;
  }

  await transitionDocument(documentId, {
    targetStatus,
    reason: reason || undefined,
  });

  revalidateDocumentViews(documentId);
}

export async function addAttachmentAction(formData: FormData) {
  const documentId = String(formData.get("documentId") ?? "");
  const fileId = String(formData.get("fileId") ?? "").trim();
  const filename = String(formData.get("filename") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();

  if (!documentId || !fileId || !filename || !role) {
    return;
  }

  await addDocumentAttachment(documentId, {
    fileId,
    filename,
    role,
    mimeType: String(formData.get("mimeType") ?? "").trim() || undefined,
    fileSizeBytes: formData.get("fileSizeBytes")
      ? Number(formData.get("fileSizeBytes"))
      : undefined,
    classification: formData.get("classification")
      ? Number(formData.get("classification"))
      : undefined,
  });

  revalidateDocumentViews(documentId);
}

export async function removeAttachmentAction(formData: FormData) {
  const documentId = String(formData.get("documentId") ?? "");
  const attachmentId = String(formData.get("attachmentId") ?? "");

  if (!documentId || !attachmentId) {
    return;
  }

  await removeDocumentAttachment(documentId, attachmentId);
  revalidateDocumentViews(documentId);
}

export async function startWorkflowAction(formData: FormData) {
  const documentId = String(formData.get("documentId") ?? "");
  if (!documentId) return;

  await startDocumentWorkflow(documentId);
  revalidateDocumentViews(documentId);
}

export async function resumeWorkflowAction(formData: FormData) {
  const documentId = String(formData.get("documentId") ?? "");
  if (!documentId) return;

  await resumeDocumentWorkflow(documentId);
  revalidateDocumentViews(documentId);
}

export async function actOnWorkflowStepAction(formData: FormData) {
  const documentId = String(formData.get("documentId") ?? "");
  const stepId = String(formData.get("stepId") ?? "");
  const action = String(formData.get("action") ?? "");
  const remarks = String(formData.get("remarks") ?? "").trim();
  const returnToStep = String(formData.get("returnToStep") ?? "").trim();

  if (!documentId || !stepId || !action) {
    return;
  }

  await actOnWorkflowStep(documentId, stepId, {
    action,
    remarks: remarks || undefined,
    returnToStep: returnToStep || undefined,
  });

  revalidateDocumentViews(documentId);
}

export async function issueResolutionAction(formData: FormData) {
  const documentId = String(formData.get("documentId") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  const executors = parseExecutors(String(formData.get("executors") ?? ""));

  if (!documentId || !text || executors.length === 0) {
    return;
  }

  await issueDocumentResolution(documentId, {
    text,
    priority: String(formData.get("priority") ?? "").trim() || undefined,
    deadline: String(formData.get("deadline") ?? "").trim() || undefined,
    workflowStepId: String(formData.get("workflowStepId") ?? "").trim() || undefined,
    executors,
  });

  revalidateDocumentViews(documentId);
}

export async function fileCompletionReportAction(formData: FormData) {
  const documentId = String(formData.get("documentId") ?? "");
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const report = String(formData.get("report") ?? "").trim();

  if (!documentId || !assignmentId || !report) {
    return;
  }

  await fileExecutorCompletionReport(assignmentId, { report });
  revalidateDocumentViews(documentId);
}
