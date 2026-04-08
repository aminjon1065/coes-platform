import { authorizedBackendJson, getSessionUser } from "@/lib/auth";

type BackendTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  deadline: string | null;
  isOverdue: boolean;
};

type BackendDocument = {
  id: string;
  subject: string;
  status: string;
  direction: string;
  registrationNumber: string | null;
  updatedAt: string;
};

type BackendNotification = {
  id: string;
  title: string;
  body: string | null;
  priority: string;
  actionUrl: string | null;
  createdAt: string;
};

export type DashboardData = {
  user: {
    displayName: string;
    clearanceLevel: number;
  };
  stats: {
    taskCount: number;
    overdueTaskCount: number;
    documentsInWorkflow: number;
    unreadNotifications: number;
  };
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    dueAt: string | null;
    isOverdue: boolean;
  }>;
  documents: Array<{
    id: string;
    title: string;
    status: string;
    registrationNumber: string | null;
    direction: string;
    updatedAt: string;
  }>;
  notifications: Array<{
    id: string;
    title: string;
    body: string | null;
    priority: string;
    href: string | null;
    createdAt: string;
  }>;
};

function normalizeStatus(value: string) {
  return value.toLowerCase();
}

export async function getDashboardData(): Promise<DashboardData> {
  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    throw new Error("AUTH_REQUIRED");
  }

  const [tasksResponse, overdueTasksResponse, workflowDocsResponse, recentDocsResponse, notificationsResponse] =
    await Promise.all([
      authorizedBackendJson<{ data: BackendTask[]; total: number }>("/tasks?limit=5"),
      authorizedBackendJson<{ data: BackendTask[]; total: number }>("/tasks?isOverdue=true&limit=1"),
      authorizedBackendJson<{ items: BackendDocument[]; total: number }>(
        "/edms/documents?status=in_workflow&limit=1",
      ),
      authorizedBackendJson<{ items: BackendDocument[]; total: number }>(
        "/edms/documents?limit=5",
      ),
      authorizedBackendJson<{
        items: BackendNotification[];
        total: number;
        unreadCount: number;
      }>("/notifications?unreadOnly=true&limit=5"),
    ]);

  return {
    user: {
      displayName: sessionUser.displayName,
      clearanceLevel: sessionUser.clearanceLevel,
    },
    stats: {
      taskCount: tasksResponse.total,
      overdueTaskCount: overdueTasksResponse.total,
      documentsInWorkflow: workflowDocsResponse.total,
      unreadNotifications: notificationsResponse.unreadCount,
    },
    tasks: tasksResponse.data.map((task) => ({
      id: task.id,
      title: task.title,
      status: normalizeStatus(task.status),
      priority: normalizeStatus(task.priority),
      dueAt: task.deadline,
      isOverdue: task.isOverdue,
    })),
    documents: recentDocsResponse.items.map((document) => ({
      id: document.id,
      title: document.subject,
      status: normalizeStatus(document.status),
      registrationNumber: document.registrationNumber,
      direction: normalizeStatus(document.direction),
      updatedAt: document.updatedAt,
    })),
    notifications: notificationsResponse.items.map((notification) => ({
      id: notification.id,
      title: notification.title,
      body: notification.body,
      priority: normalizeStatus(notification.priority),
      href: notification.actionUrl,
      createdAt: notification.createdAt,
    })),
  };
}
