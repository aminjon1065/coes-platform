import { authorizedBackendJson } from "@/lib/auth";

type BackendTaskListItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  deadline: string | null;
  isOverdue: boolean;
};

type BackendTaskComment = {
  id: string;
  authorId: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
};

type BackendTaskAttachment = {
  id: string;
  fileId: string;
  fileName: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  classification: number;
  createdAt: string;
};

type BackendTaskDetail = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  deadline: string | null;
  isOverdue: boolean;
  progressPercent: number;
  progressNote: string | null;
  responsiblePositionId: string;
  assigningPositionId: string;
  subtasks?: BackendTaskListItem[];
  comments?: BackendTaskComment[];
  attachments?: BackendTaskAttachment[];
  createdAt: string;
  updatedAt: string;
};

type BackendResolvedUser = {
  credentialId: string;
  displayName: string;
};

export type TaskListData = {
  total: number;
  items: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    dueAt: string | null;
    isOverdue: boolean;
  }>;
};

export type TaskDetailData = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueAt: string | null;
  isOverdue: boolean;
  progressPercent: number;
  progressNote: string | null;
  responsiblePositionId: string;
  assigningPositionId: string;
  createdAt: string;
  updatedAt: string;
  subtasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    dueAt: string | null;
    isOverdue: boolean;
  }>;
  comments: Array<{
    id: string;
    authorLabel: string;
    body: string;
    isInternal: boolean;
    createdAt: string;
  }>;
  attachments: Array<{
    id: string;
    fileId: string;
    name: string;
    mimeType: string | null;
    sizeBytes: number | null;
    classification: number;
    createdAt: string;
  }>;
};

type TaskListFilters = {
  status?: string;
  priority?: string;
  isOverdue?: boolean;
  limit?: number;
  offset?: number;
};

function normalizeValue(value: string) {
  return value.toLowerCase();
}

function mapTaskListItem(task: BackendTaskListItem) {
  return {
    id: task.id,
    title: task.title,
    status: normalizeValue(task.status),
    priority: normalizeValue(task.priority),
    dueAt: task.deadline,
    isOverdue: task.isOverdue,
  };
}

export async function getTasksData(filters: TaskListFilters = {}): Promise<TaskListData> {
  const searchParams = new URLSearchParams();

  if (filters.status) searchParams.set("status", filters.status);
  if (filters.priority) searchParams.set("priority", filters.priority);
  if (filters.isOverdue !== undefined) {
    searchParams.set("isOverdue", String(filters.isOverdue));
  }
  searchParams.set("limit", String(filters.limit ?? 20));
  searchParams.set("offset", String(filters.offset ?? 0));

  const response = await authorizedBackendJson<{
    data: BackendTaskListItem[];
    total: number;
  }>(`/tasks?${searchParams.toString()}`);

  return {
    total: response.total,
    items: response.data.map(mapTaskListItem),
  };
}

export async function getTaskDetailData(taskId: string): Promise<TaskDetailData> {
  const task = await authorizedBackendJson<BackendTaskDetail>(`/tasks/${taskId}`);
  const authorIds = [...new Set((task.comments ?? []).map((comment) => comment.authorId))];
  const resolvedUsers: BackendResolvedUser[] =
    authorIds.length === 0
      ? []
      : (
          await authorizedBackendJson<{ items: BackendResolvedUser[] }>(
            "/users/resolve-by-credential",
            {
              method: "POST",
              body: JSON.stringify({ credentialIds: authorIds }),
            },
          )
        ).items;
  const displayNameByCredentialId = new Map(
    resolvedUsers.map((user) => [user.credentialId, user.displayName]),
  );

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: normalizeValue(task.status),
    priority: normalizeValue(task.priority),
    dueAt: task.deadline,
    isOverdue: task.isOverdue,
    progressPercent: task.progressPercent,
    progressNote: task.progressNote,
    responsiblePositionId: task.responsiblePositionId,
    assigningPositionId: task.assigningPositionId,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    subtasks: (task.subtasks ?? []).map(mapTaskListItem),
    comments: (task.comments ?? []).map((comment) => ({
      id: comment.id,
      authorLabel: displayNameByCredentialId.get(comment.authorId) ?? comment.authorId,
      body: comment.body,
      isInternal: comment.isInternal,
      createdAt: comment.createdAt,
    })),
    attachments: (task.attachments ?? []).map((attachment) => ({
      id: attachment.id,
      fileId: attachment.fileId,
      name: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.fileSizeBytes,
      classification: attachment.classification,
      createdAt: attachment.createdAt,
    })),
  };
}

export async function transitionTask(
  taskId: string,
  payload: {
    targetStatus: string;
    reason?: string;
    completionReport?: string;
    progressPercent?: number;
    progressNote?: string;
  },
) {
  return authorizedBackendJson<void>(`/tasks/${taskId}/transition`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function addTaskComment(
  taskId: string,
  payload: {
    body: string;
    isInternal?: boolean;
  },
) {
  return authorizedBackendJson<void>(`/tasks/${taskId}/comments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
