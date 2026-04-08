import { authorizedBackendJson } from "@/lib/auth";

type ResolvedUser = {
  credentialId: string;
  displayName: string;
};

type BackendDocumentType = {
  id: string;
  name: string;
  seriesCode?: string;
  defaultClassification?: number;
  requiresResolution?: boolean;
  requiresApproval?: boolean;
};

type BackendPosition = {
  id: string;
  title: string;
  department?: {
    id: string;
    name: string;
  } | null;
};

type BackendRecipient = {
  positionId?: string;
  name: string;
  type: "internal" | "external";
};

type BackendDocumentAttachment = {
  id: string;
  fileId: string;
  filename: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  role: string;
  classification: number;
  createdAt: string;
};

type BackendDocument = {
  id: string;
  typeId: string;
  subject: string;
  status: string;
  direction: string;
  registrationNumber: string | null;
  classification: number;
  body: string | null;
  deadline: string | null;
  senderPositionId?: string | null;
  senderName?: string | null;
  externalRefNumber?: string | null;
  recipients?: BackendRecipient[];
  documentDate?: string | null;
  relatedDocumentId?: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  retentionReviewDate?: string | null;
  archivedAt?: string | null;
  cancelledAt?: string | null;
  type?: BackendDocumentType;
  attachments?: BackendDocumentAttachment[];
};

type BackendDocumentVersion = {
  id: string;
  versionNumber: number;
  authorId: string;
  changeReason: string | null;
  createdAt: string;
};

type BackendWorkflowStep = {
  id: string;
  stepOrder: number;
  stepName: string;
  stepType: string;
  status: string;
  positionId: string;
  assignedUserId: string | null;
  deadline: string | null;
  actionTaken: string | null;
  actorId: string | null;
  remarks: string | null;
  completedAt: string | null;
};

type BackendWorkflowInstance = {
  id: string;
  status: string;
  currentStepOrder: number | null;
  initiatedById: string;
  createdAt: string;
  completedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  steps?: BackendWorkflowStep[];
};

type BackendWorkflowHistory = {
  id: string;
  eventType: string;
  actorId: string | null;
  remarks: string | null;
  createdAt: string;
};

type BackendExecutorAssignment = {
  id: string;
  positionId: string;
  assignedUserId: string | null;
  executorRole: string;
  instruction: string | null;
  status: string;
  deadline: string | null;
  linkedTaskId: string | null;
  completionReport: string | null;
  completedAt: string | null;
  createdAt: string;
};

type BackendResolution = {
  id: string;
  workflowStepId: string | null;
  issuingPositionId: string;
  issuingUserId: string;
  text: string;
  priority: string;
  deadline: string | null;
  createdAt: string;
  executorAssignments?: BackendExecutorAssignment[];
};

export type DocumentTypeOption = {
  id: string;
  name: string;
  seriesCode: string | null;
  defaultClassification: number;
  requiresResolution: boolean;
  requiresApproval: boolean;
};

export type PositionOption = {
  id: string;
  title: string;
  departmentName: string | null;
};

export type RecipientInput = {
  name: string;
  type: "internal" | "external";
  positionId?: string;
};

export type DocumentMutationInput = {
  typeId: string;
  direction: "incoming" | "outgoing" | "internal";
  subject: string;
  classification?: number;
  senderPositionId?: string;
  senderName?: string;
  externalRefNumber?: string;
  recipients: RecipientInput[];
  body?: string;
  deadline?: string;
  relatedDocumentId?: string;
  documentDate?: string;
  changeReason?: string;
};

export type DocumentListData = {
  total: number;
  items: Array<{
    id: string;
    title: string;
    status: string;
    direction: string;
    typeName: string;
    registrationNumber: string | null;
    classification: number;
    updatedAt: string;
  }>;
};

export type DocumentArchiveData = {
  total: number;
  items: Array<{
    id: string;
    title: string;
    registrationNumber: string | null;
    typeName: string;
    classification: number;
    archivedAt: string | null;
    retentionReviewDate: string | null;
  }>;
};

export type DocumentResolutionData = {
  id: string;
  workflowStepId: string | null;
  issuingPositionLabel: string;
  issuingUserLabel: string;
  text: string;
  priority: string;
  deadline: string | null;
  createdAt: string;
  assignments: Array<{
    id: string;
    positionLabel: string;
    assignedUserLabel: string | null;
    executorRole: string;
    instruction: string | null;
    status: string;
    deadline: string | null;
    linkedTaskId: string | null;
    completionReport: string | null;
    completedAt: string | null;
    createdAt: string;
  }>;
};

export type DocumentDetailData = {
  id: string;
  typeId: string;
  title: string;
  status: string;
  direction: string;
  typeName: string;
  registrationNumber: string | null;
  classification: number;
  body: string | null;
  deadline: string | null;
  senderPositionId: string | null;
  senderName: string | null;
  externalRefNumber: string | null;
  recipients: Array<{
    name: string;
    type: "internal" | "external";
    positionId: string | null;
    positionLabel: string | null;
  }>;
  documentDate: string | null;
  relatedDocumentId: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  retentionReviewDate: string | null;
  archivedAt: string | null;
  attachments: Array<{
    id: string;
    fileId: string;
    name: string;
    mimeType: string | null;
    sizeBytes: number | null;
    role: string;
    classification: number;
    createdAt: string;
  }>;
  versions: Array<{
    id: string;
    versionNumber: number;
    authorLabel: string;
    changeReason: string | null;
    createdAt: string;
  }>;
  workflow: null | {
    id: string;
    status: string;
    currentStepOrder: number | null;
    initiatedByLabel: string;
    createdAt: string;
    completedAt: string | null;
    rejectedAt: string | null;
    rejectionReason: string | null;
    steps: Array<{
      id: string;
      stepOrder: number;
      stepName: string;
      stepType: string;
      status: string;
      assignedUserLabel: string | null;
      positionId: string;
      positionLabel: string;
      deadline: string | null;
      actionTaken: string | null;
      actorLabel: string | null;
      remarks: string | null;
      completedAt: string | null;
    }>;
    history: Array<{
      id: string;
      eventType: string;
      actorLabel: string | null;
      remarks: string | null;
      createdAt: string;
    }>;
  };
  resolutions: DocumentResolutionData[];
};

type DocumentListFilters = {
  status?: string;
  direction?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

type ArchiveFilters = {
  search?: string;
  reviewBefore?: string;
  limit?: number;
  offset?: number;
};

function normalizeValue(value: string) {
  return value.toLowerCase();
}

function cleanString(value: string | null | undefined) {
  const nextValue = value?.trim();
  return nextValue ? nextValue : undefined;
}

function cleanDate(value: string | null | undefined) {
  const nextValue = value?.trim();
  return nextValue ? nextValue : undefined;
}

function cleanNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function mapPositionLabel(positionId: string | null | undefined, positionMap: Map<string, string>) {
  if (!positionId) {
    return null;
  }

  return positionMap.get(positionId) ?? positionId;
}

async function resolveUsersByCredentialIds(credentialIds: string[]) {
  const ids = [...new Set(credentialIds.filter(Boolean))];

  if (!ids.length) {
    return new Map<string, string>();
  }

  const response = await authorizedBackendJson<{ items: ResolvedUser[] }>(
    "/users/resolve-by-credential",
    {
      method: "POST",
      body: JSON.stringify({ credentialIds: ids }),
    },
  );

  return new Map(response.items.map((user) => [user.credentialId, user.displayName]));
}

async function resolvePositionsByIds(positionIds: string[]) {
  const ids = [...new Set(positionIds.filter(Boolean))];

  if (!ids.length) {
    return new Map<string, string>();
  }

  const positions = await Promise.all(
    ids.map(async (positionId) => {
      try {
        const position = await authorizedBackendJson<BackendPosition>(
          `/org/positions/${positionId}`,
        );
        const departmentSuffix = position.department?.name
          ? ` (${position.department.name})`
          : "";
        return [positionId, `${position.title}${departmentSuffix}`] as const;
      } catch {
        return [positionId, positionId] as const;
      }
    }),
  );

  return new Map(positions);
}

function buildDocumentMutationPayload(payload: DocumentMutationInput) {
  return {
    typeId: payload.typeId,
    direction: payload.direction,
    subject: payload.subject.trim(),
    classification: cleanNumber(payload.classification),
    senderPositionId: cleanString(payload.senderPositionId),
    senderName: cleanString(payload.senderName),
    externalRefNumber: cleanString(payload.externalRefNumber),
    recipients: payload.recipients.map((recipient) => ({
      name: recipient.name.trim(),
      type: recipient.type,
      positionId: cleanString(recipient.positionId),
    })),
    body: cleanString(payload.body),
    deadline: cleanDate(payload.deadline),
    relatedDocumentId: cleanString(payload.relatedDocumentId),
    documentDate: cleanDate(payload.documentDate),
    changeReason: cleanString(payload.changeReason),
  };
}

export async function getDocumentTypes() {
  const response = await authorizedBackendJson<BackendDocumentType[]>("/edms/document-types");
  return response.map((item) => ({
    id: item.id,
    name: item.name,
    seriesCode: item.seriesCode ?? null,
    defaultClassification: item.defaultClassification ?? 1,
    requiresResolution: Boolean(item.requiresResolution),
    requiresApproval: Boolean(item.requiresApproval),
  })) satisfies DocumentTypeOption[];
}

export async function getPositionOptions() {
  const response = await authorizedBackendJson<BackendPosition[]>("/org/positions");
  return response.map((item) => ({
    id: item.id,
    title: item.title,
    departmentName: item.department?.name ?? null,
  })) satisfies PositionOption[];
}

export async function getDocumentsData(
  filters: DocumentListFilters = {},
): Promise<DocumentListData> {
  const searchParams = new URLSearchParams();
  if (filters.status) searchParams.set("status", filters.status);
  if (filters.direction) searchParams.set("direction", filters.direction);
  if (filters.search) searchParams.set("search", filters.search);
  searchParams.set("limit", String(filters.limit ?? 20));
  searchParams.set("offset", String(filters.offset ?? 0));

  const response = await authorizedBackendJson<{
    items: BackendDocument[];
    total: number;
  }>(`/edms/documents?${searchParams.toString()}`);

  return {
    total: response.total,
    items: response.items.map((document) => ({
      id: document.id,
      title: document.subject,
      status: normalizeValue(document.status),
      direction: normalizeValue(document.direction),
      typeName: document.type?.name ?? "Document",
      registrationNumber: document.registrationNumber,
      classification: document.classification,
      updatedAt: document.updatedAt,
    })),
  };
}

export async function getArchivedDocumentsData(
  filters: ArchiveFilters = {},
): Promise<DocumentArchiveData> {
  const searchParams = new URLSearchParams();
  if (filters.search) searchParams.set("search", filters.search);
  if (filters.reviewBefore) searchParams.set("reviewBefore", filters.reviewBefore);
  searchParams.set("limit", String(filters.limit ?? 20));
  searchParams.set("offset", String(filters.offset ?? 0));

  const response = await authorizedBackendJson<{
    items: BackendDocument[];
    total: number;
  }>(`/edms/documents/archive?${searchParams.toString()}`);

  return {
    total: response.total,
    items: response.items.map((document) => ({
      id: document.id,
      title: document.subject,
      registrationNumber: document.registrationNumber,
      typeName: document.type?.name ?? "Document",
      classification: document.classification,
      archivedAt: document.archivedAt ?? null,
      retentionReviewDate: document.retentionReviewDate ?? null,
    })),
  };
}

export async function getDocumentDetailData(
  documentId: string,
): Promise<DocumentDetailData> {
  const [document, versions, workflow, history, resolutions] = await Promise.all([
    authorizedBackendJson<BackendDocument>(`/edms/documents/${documentId}`),
    authorizedBackendJson<BackendDocumentVersion[]>(`/edms/documents/${documentId}/versions`),
    authorizedBackendJson<BackendWorkflowInstance | null>(`/edms/documents/${documentId}/workflow`),
    authorizedBackendJson<BackendWorkflowHistory[]>(`/edms/documents/${documentId}/workflow/history`),
    authorizedBackendJson<BackendResolution[]>(`/edms/documents/${documentId}/resolutions`),
  ]);

  const positionMap = await resolvePositionsByIds([
    document.senderPositionId ?? "",
    ...(document.recipients ?? []).map((recipient) => recipient.positionId ?? ""),
    ...(workflow?.steps ?? []).map((step) => step.positionId),
    ...resolutions.flatMap((resolution) => [
      resolution.issuingPositionId,
      ...(resolution.executorAssignments ?? []).map((assignment) => assignment.positionId),
    ]),
  ]);

  const userMap = await resolveUsersByCredentialIds([
    document.createdById,
    ...versions.map((version) => version.authorId),
    ...(workflow
      ? [
          workflow.initiatedById,
          ...(workflow.steps ?? []).flatMap((step) => [
            step.assignedUserId ?? "",
            step.actorId ?? "",
          ]),
          ...history.map((item) => item.actorId ?? ""),
        ]
      : []),
    ...resolutions.flatMap((resolution) => [
      resolution.issuingUserId,
      ...(resolution.executorAssignments ?? []).map((assignment) => assignment.assignedUserId ?? ""),
    ]),
  ]);

  return {
    id: document.id,
    typeId: document.typeId,
    title: document.subject,
    status: normalizeValue(document.status),
    direction: normalizeValue(document.direction),
    typeName: document.type?.name ?? "Document",
    registrationNumber: document.registrationNumber,
    classification: document.classification,
    body: document.body,
    deadline: document.deadline,
    senderPositionId: document.senderPositionId ?? null,
    senderName: document.senderName ?? null,
    externalRefNumber: document.externalRefNumber ?? null,
    recipients: (document.recipients ?? []).map((recipient) => ({
      name: recipient.name,
      type: recipient.type,
      positionId: recipient.positionId ?? null,
      positionLabel: mapPositionLabel(recipient.positionId, positionMap),
    })),
    documentDate: document.documentDate ?? null,
    relatedDocumentId: document.relatedDocumentId ?? null,
    createdById: userMap.get(document.createdById) ?? document.createdById,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    retentionReviewDate: document.retentionReviewDate ?? null,
    archivedAt: document.archivedAt ?? null,
    attachments: (document.attachments ?? []).map((attachment) => ({
      id: attachment.id,
      fileId: attachment.fileId,
      name: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.fileSizeBytes,
      role: normalizeValue(attachment.role),
      classification: attachment.classification,
      createdAt: attachment.createdAt,
    })),
    versions: versions.map((version) => ({
      id: version.id,
      versionNumber: version.versionNumber,
      authorLabel: userMap.get(version.authorId) ?? version.authorId,
      changeReason: version.changeReason,
      createdAt: version.createdAt,
    })),
    workflow: workflow
      ? {
          id: workflow.id,
          status: normalizeValue(workflow.status),
          currentStepOrder: workflow.currentStepOrder,
          initiatedByLabel: userMap.get(workflow.initiatedById) ?? workflow.initiatedById,
          createdAt: workflow.createdAt,
          completedAt: workflow.completedAt,
          rejectedAt: workflow.rejectedAt,
          rejectionReason: workflow.rejectionReason,
          steps: (workflow.steps ?? [])
            .slice()
            .sort((left, right) => left.stepOrder - right.stepOrder)
            .map((step) => ({
              id: step.id,
              stepOrder: step.stepOrder,
              stepName: step.stepName,
              stepType: normalizeValue(step.stepType),
              status: normalizeValue(step.status),
              assignedUserLabel: step.assignedUserId
                ? (userMap.get(step.assignedUserId) ?? step.assignedUserId)
                : null,
              positionId: step.positionId,
              positionLabel: positionMap.get(step.positionId) ?? step.positionId,
              deadline: step.deadline,
              actionTaken: step.actionTaken ? normalizeValue(step.actionTaken) : null,
              actorLabel: step.actorId ? (userMap.get(step.actorId) ?? step.actorId) : null,
              remarks: step.remarks,
              completedAt: step.completedAt,
            })),
          history: history.map((item) => ({
            id: item.id,
            eventType: normalizeValue(item.eventType),
            actorLabel: item.actorId ? (userMap.get(item.actorId) ?? item.actorId) : null,
            remarks: item.remarks,
            createdAt: item.createdAt,
          })),
        }
      : null,
    resolutions: resolutions.map((resolution) => ({
      id: resolution.id,
      workflowStepId: resolution.workflowStepId,
      issuingPositionLabel:
        positionMap.get(resolution.issuingPositionId) ?? resolution.issuingPositionId,
      issuingUserLabel:
        userMap.get(resolution.issuingUserId) ?? resolution.issuingUserId,
      text: resolution.text,
      priority: normalizeValue(resolution.priority),
      deadline: resolution.deadline,
      createdAt: resolution.createdAt,
      assignments: (resolution.executorAssignments ?? []).map((assignment) => ({
        id: assignment.id,
        positionLabel: positionMap.get(assignment.positionId) ?? assignment.positionId,
        assignedUserLabel: assignment.assignedUserId
          ? (userMap.get(assignment.assignedUserId) ?? assignment.assignedUserId)
          : null,
        executorRole: normalizeValue(assignment.executorRole),
        instruction: assignment.instruction,
        status: normalizeValue(assignment.status),
        deadline: assignment.deadline,
        linkedTaskId: assignment.linkedTaskId,
        completionReport: assignment.completionReport,
        completedAt: assignment.completedAt,
        createdAt: assignment.createdAt,
      })),
    })),
  };
}

export async function createDocument(payload: DocumentMutationInput) {
  return authorizedBackendJson<BackendDocument>("/edms/documents", {
    method: "POST",
    body: JSON.stringify(buildDocumentMutationPayload(payload)),
  });
}

export async function updateDocument(documentId: string, payload: Omit<DocumentMutationInput, "typeId" | "direction">) {
  return authorizedBackendJson<BackendDocument>(`/edms/documents/${documentId}`, {
    method: "PATCH",
    body: JSON.stringify({
      subject: payload.subject.trim(),
      classification: cleanNumber(payload.classification),
      senderPositionId: cleanString(payload.senderPositionId),
      senderName: cleanString(payload.senderName),
      externalRefNumber: cleanString(payload.externalRefNumber),
      recipients: payload.recipients.map((recipient) => ({
        name: recipient.name.trim(),
        type: recipient.type,
        positionId: cleanString(recipient.positionId),
      })),
      body: cleanString(payload.body),
      deadline: cleanDate(payload.deadline),
      relatedDocumentId: cleanString(payload.relatedDocumentId),
      documentDate: cleanDate(payload.documentDate),
      changeReason: cleanString(payload.changeReason),
    }),
  });
}

export async function registerDocument(
  documentId: string,
  payload: { registrarPositionId?: string; documentDate?: string },
) {
  return authorizedBackendJson<BackendDocument>(`/edms/documents/${documentId}/register`, {
    method: "POST",
    body: JSON.stringify({
      registrarPositionId: cleanString(payload.registrarPositionId),
      documentDate: cleanDate(payload.documentDate),
    }),
  });
}

export async function transitionDocument(
  documentId: string,
  payload: { targetStatus: string; reason?: string },
) {
  return authorizedBackendJson<void>(`/edms/documents/${documentId}/transition`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function addDocumentAttachment(
  documentId: string,
  payload: {
    fileId: string;
    filename: string;
    mimeType?: string;
    fileSizeBytes?: number;
    role: string;
    classification?: number;
  },
) {
  return authorizedBackendJson<void>(`/edms/documents/${documentId}/attachments`, {
    method: "POST",
    body: JSON.stringify({
      fileId: payload.fileId,
      filename: payload.filename,
      mimeType: cleanString(payload.mimeType),
      fileSizeBytes: cleanNumber(payload.fileSizeBytes),
      role: payload.role,
      classification: cleanNumber(payload.classification),
    }),
  });
}

export async function removeDocumentAttachment(documentId: string, attachmentId: string) {
  return authorizedBackendJson<void>(
    `/edms/documents/${documentId}/attachments/${attachmentId}`,
    {
      method: "DELETE",
    },
  );
}

export async function startDocumentWorkflow(documentId: string) {
  return authorizedBackendJson<void>(`/edms/documents/${documentId}/workflow/start`, {
    method: "POST",
  });
}

export async function resumeDocumentWorkflow(documentId: string) {
  return authorizedBackendJson<void>(`/edms/documents/${documentId}/workflow/resume`, {
    method: "POST",
  });
}

export async function actOnWorkflowStep(
  documentId: string,
  stepId: string,
  payload: { action: string; remarks?: string; returnToStep?: string },
) {
  return authorizedBackendJson<void>(
    `/edms/documents/${documentId}/workflow/steps/${stepId}/act`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function issueDocumentResolution(
  documentId: string,
  payload: {
    text: string;
    priority?: string;
    deadline?: string;
    workflowStepId?: string;
    executors: Array<{
      positionId: string;
      role?: string;
      instruction?: string;
      deadline?: string;
    }>;
  },
) {
  return authorizedBackendJson<void>(`/edms/documents/${documentId}/resolutions`, {
    method: "POST",
    body: JSON.stringify({
      text: payload.text.trim(),
      priority: cleanString(payload.priority),
      deadline: cleanDate(payload.deadline),
      workflowStepId: cleanString(payload.workflowStepId),
      executors: payload.executors.map((executor) => ({
        positionId: executor.positionId,
        role: cleanString(executor.role),
        instruction: cleanString(executor.instruction),
        deadline: cleanDate(executor.deadline),
      })),
    }),
  });
}

export async function fileExecutorCompletionReport(
  assignmentId: string,
  payload: { report: string },
) {
  return authorizedBackendJson<void>(
    `/edms/documents/executor-assignments/${assignmentId}/complete`,
    {
      method: "POST",
      body: JSON.stringify({ report: payload.report.trim() }),
    },
  );
}
