import type { DetectionSettings, Glyph, GridSettings, PaneSizes } from "../types";

const DATABASE_NAME = "glyph-foundry";
const DATABASE_VERSION = 1;
const PROJECT_STORE = "projects";

export type ProjectDocument = {
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  atlas: {
    name: string;
    type: string;
    blob: Blob;
  };
  glyphs: Glyph[];
  selectedId: number | null;
  zoom: number;
  settings: DetectionSettings;
  grid: GridSettings;
  candidateCharset: string;
  characterMap: string;
  recognitionThreshold: number;
  fontName: string;
  lineHeight: number;
  previewText: string;
  previewZoom: number;
  paneSizes: PaneSizes;
};

export type ProjectSummary = Pick<ProjectDocument, "id" | "name" | "createdAt" | "updatedAt"> & {
  atlasName: string;
};

export interface ProjectStore {
  list(): Promise<ProjectSummary[]>;
  get(id: string): Promise<ProjectDocument | null>;
  put(project: ProjectDocument): Promise<void>;
  delete(id: string): Promise<void>;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECT_STORE)) {
        const store = database.createObjectStore(PROJECT_STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local project storage."));
  });
}

function assertProject(value: unknown): asserts value is ProjectDocument {
  if (!value || typeof value !== "object") throw new Error("Saved project is invalid.");
  const project = value as Partial<ProjectDocument>;
  if (project.schemaVersion !== 1) throw new Error("Saved project uses an unsupported version.");
  if (typeof project.id !== "string" || typeof project.name !== "string") throw new Error("Saved project metadata is invalid.");
  if (!project.atlas || typeof project.atlas.name !== "string" || !(project.atlas.blob instanceof Blob)) {
    throw new Error("Saved project atlas is invalid.");
  }
  if (!Array.isArray(project.glyphs)) throw new Error("Saved project glyph data is invalid.");
}

export function validateProject(value: unknown): ProjectDocument {
  assertProject(value);
  return value;
}

export function summarizeProject(project: ProjectDocument): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    atlasName: project.atlas.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

/** Summarizes stored records newest first. A damaged record is skipped so it cannot hide the others. */
export function summarizeValidProjects(values: unknown[]): ProjectSummary[] {
  const summaries: ProjectSummary[] = [];
  for (const value of values) {
    try {
      summaries.push(summarizeProject(validateProject(value)));
    } catch (error) {
      console.warn("Skipping unreadable saved project.", error);
    }
  }
  return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const database = await openDatabase();
  try {
    const values = await requestResult(database.transaction(PROJECT_STORE).objectStore(PROJECT_STORE).getAll());
    return summarizeValidProjects(values);
  } finally {
    database.close();
  }
}

export async function getProject(id: string): Promise<ProjectDocument | null> {
  const database = await openDatabase();
  try {
    const value = await requestResult(database.transaction(PROJECT_STORE).objectStore(PROJECT_STORE).get(id));
    if (value === undefined) return null;
    return validateProject(value);
  } finally {
    database.close();
  }
}

export async function putProject(project: ProjectDocument): Promise<void> {
  validateProject(project);
  const database = await openDatabase();
  try {
    const transaction = database.transaction(PROJECT_STORE, "readwrite");
    transaction.objectStore(PROJECT_STORE).put(project);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function deleteProject(id: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(PROJECT_STORE, "readwrite");
    transaction.objectStore(PROJECT_STORE).delete(id);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export const projectStore: ProjectStore = {
  list: listProjects,
  get: getProject,
  put: putProject,
  delete: deleteProject,
};
