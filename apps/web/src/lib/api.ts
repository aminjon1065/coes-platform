import axios from 'axios';
import { useAuthStore } from '@/store/auth.store';

export const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401: try refresh token, retry once, then logout
let refreshing: Promise<string> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }
    original._retry = true;

    const { refreshToken, setTokens, clearTokens } = useAuthStore.getState();
    if (!refreshToken) {
      clearTokens();
      return Promise.reject(error);
    }

    if (!refreshing) {
      refreshing = axios
        .post('/api/v1/auth/refresh', { refreshToken })
        .then((r) => {
          const { accessToken, refreshToken: newRefresh, user } = r.data;
          setTokens(accessToken, newRefresh, user);
          return accessToken;
        })
        .catch((e) => {
          clearTokens();
          throw e;
        })
        .finally(() => { refreshing = null; });
    }

    const newToken = await refreshing;
    original.headers.Authorization = `Bearer ${newToken}`;
    return api(original);
  },
);

// ── Typed API helpers ──────────────────────────────────────────────────────

export const authApi = {
  login: (username: string, password: string) =>
    api.post<{ accessToken: string; refreshToken: string; user: UserProfile }>('/auth/login', { username, password }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get<UserProfile>('/auth/me'),
};

export const usersApi = {
  list: (params?: Record<string, unknown>) => api.get<Paginated<UserSummary>>('/users', { params }),
  get: (id: string) => api.get<UserProfile>(`/users/${id}`),
  create: (body: CreateUserDto) => api.post<UserProfile>('/users', body),
  update: (id: string, body: Partial<CreateUserDto>) => api.patch<UserProfile>(`/users/${id}`, body),
  deactivate: (id: string) => api.delete(`/users/${id}`),
};

export const orgApi = {
  departments: () => api.get<Department[]>('/org/departments'),
  departmentTree: () => api.get<Department[]>('/org/departments/tree'),
  positions: (deptId?: string) => api.get<Position[]>('/org/positions', { params: { departmentId: deptId } }),
  createDepartment: (body: unknown) => api.post<Department>('/org/departments', body),
  createPosition: (body: unknown) => api.post<Position>('/org/positions', body),
};

export const rolesApi = {
  list: () => api.get<Role[]>('/authorization/roles'),
  create: (body: unknown) => api.post<Role>('/authorization/roles', body),
  delete: (id: string) => api.delete(`/authorization/roles/${id}`),
  capabilities: () => api.get<string[]>('/authorization/capabilities'),
  assignToUser: (userId: string, roleId: string) =>
    api.post(`/authorization/users/${userId}/roles`, { roleId }),
  revokeFromUser: (userId: string, roleId: string) =>
    api.delete(`/authorization/users/${userId}/roles/${roleId}`),
};

export const edmsApi = {
  list: (params?: Record<string, unknown>) => api.get<Paginated<DocumentSummary>>('/edms/documents', { params }),
  get: (id: string) => api.get<DocumentDetail>(`/edms/documents/${id}`),
  create: (body: unknown) => api.post<DocumentDetail>('/edms/documents', body),
  update: (id: string, body: unknown) => api.patch<DocumentDetail>(`/edms/documents/${id}`, body),
  transition: (id: string, status: string) =>
    api.post(`/edms/documents/${id}/transition`, { status }),
  versions: (id: string) => api.get(`/edms/documents/${id}/versions`),
  archive: (params?: Record<string, unknown>) =>
    api.get<Paginated<DocumentSummary>>('/edms/documents/archive', { params }),
};

export const tasksApi = {
  myTasks: (params?: Record<string, unknown>) =>
    api.get<Paginated<TaskSummary>>('/tasks', { params }),
  oversight: (params?: Record<string, unknown>) =>
    api.get<Paginated<TaskSummary>>('/tasks/oversight', { params }),
  get: (id: string) => api.get<TaskDetail>(`/tasks/${id}`),
  create: (body: unknown) => api.post<TaskDetail>('/tasks', body),
  transition: (id: string, status: string) =>
    api.post(`/tasks/${id}/transition`, { status }),
  comment: (id: string, body: string) =>
    api.post(`/tasks/${id}/comments`, { body }),
};

export const notificationsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<Paginated<Notification>>('/notifications', { params }),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
  preferences: () => api.get('/notifications/preferences'),
  updatePreferences: (body: unknown) => api.patch('/notifications/preferences', body),
};

export const searchApi = {
  query: (q: string, params?: Record<string, unknown>) =>
    api.get<SearchResults>('/search', { params: { q, ...params } }),
};

// ── Shared Types ──────────────────────────────────────────────────────────

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  displayName: string;
  clearanceLevel: number;
  isActive: boolean;
  roles?: string[];
}

export interface UserSummary {
  id: string;
  username: string;
  displayName: string;
  email: string;
  isActive: boolean;
  clearanceLevel: number;
}

export interface CreateUserDto {
  username: string;
  email: string;
  displayName: string;
  password?: string;
  clearanceLevel: number;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  parentId?: string;
  isActive: boolean;
  children?: Department[];
}

export interface Position {
  id: string;
  title: string;
  departmentId: string;
  isVacant: boolean;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
}

export interface DocumentSummary {
  id: string;
  registrationNumber?: string;
  title: string;
  documentType: string;
  status: string;
  classification: number;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentDetail extends DocumentSummary {
  body?: string;
  authorId: string;
  currentVersionId?: string;
  workflowInstanceId?: string;
  attachments: Attachment[];
}

export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface TaskSummary {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate?: string;
  isOverdue: boolean;
  assigneeName?: string;
}

export interface TaskDetail extends TaskSummary {
  description?: string;
  parentTaskId?: string;
  subtasks: TaskSummary[];
  comments: TaskComment[];
  createdAt: string;
}

export interface TaskComment {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  priority: string;
  isRead: boolean;
  createdAt: string;
  link?: string;
}

export interface SearchResults {
  documents: DocumentSummary[];
  tasks: TaskSummary[];
  messages: unknown[];
}
