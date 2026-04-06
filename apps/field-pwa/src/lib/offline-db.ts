/**
 * IndexedDB schema for the field operator PWA.
 * Stores pending operations that couldn't be sent due to no connectivity.
 */
import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface PendingOperation {
  id?: number;
  type: 'create_incident' | 'update_task_status' | 'submit_form';
  url: string;
  method: string;
  body: string; // JSON-stringified request body
  headers: Record<string, string>;
  createdAt: string;
  attempts: number;
}

export interface CachedTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignedTo: string | null;
  description: string | null;
  dueDate: string | null;
  cachedAt: string;
}

interface FieldPwaDb extends DBSchema {
  pending_ops: {
    key: number;
    value: PendingOperation;
    indexes: { 'by-type': string; 'by-created': string };
  };
  cached_tasks: {
    key: string;
    value: CachedTask;
    indexes: { 'by-status': string };
  };
  cached_incidents: {
    key: string;
    value: { id: string; data: any; cachedAt: string };
  };
}

let dbPromise: Promise<IDBPDatabase<FieldPwaDb>> | null = null;

export function getDb(): Promise<IDBPDatabase<FieldPwaDb>> {
  if (!dbPromise) {
    dbPromise = openDB<FieldPwaDb>('coescd-field', 1, {
      upgrade(db) {
        const opsStore = db.createObjectStore('pending_ops', {
          keyPath: 'id',
          autoIncrement: true,
        });
        opsStore.createIndex('by-type', 'type');
        opsStore.createIndex('by-created', 'createdAt');

        const tasksStore = db.createObjectStore('cached_tasks', { keyPath: 'id' });
        tasksStore.createIndex('by-status', 'status');

        db.createObjectStore('cached_incidents', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
}

export async function enqueueOperation(op: Omit<PendingOperation, 'id'>): Promise<number> {
  const db = await getDb();
  return db.add('pending_ops', op);
}

export async function getPendingOperations(): Promise<PendingOperation[]> {
  const db = await getDb();
  return db.getAll('pending_ops');
}

export async function deletePendingOperation(id: number): Promise<void> {
  const db = await getDb();
  await db.delete('pending_ops', id);
}

export async function incrementAttempts(id: number): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('pending_ops', 'readwrite');
  const op = await tx.store.get(id);
  if (op) {
    op.attempts += 1;
    await tx.store.put(op);
  }
  await tx.done;
}

export async function cacheTasks(tasks: CachedTask[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('cached_tasks', 'readwrite');
  await Promise.all(tasks.map((t) => tx.store.put(t)));
  await tx.done;
}

export async function getCachedTasks(): Promise<CachedTask[]> {
  const db = await getDb();
  return db.getAll('cached_tasks');
}
