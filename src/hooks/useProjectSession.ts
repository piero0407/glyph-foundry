import { useCallback, useEffect, useRef, useState } from "react";
import { decodeAtlas, isAtlasFile, type DecodedAtlas } from "../lib/atlas";
import { parseFnt } from "../lib/fnt";
import { SaveQueue } from "../lib/saveQueue";
import {
  projectStore,
  summarizeProject,
  type ProjectDocument,
  type ProjectSummary,
} from "../lib/projectStore";
import {
  projectFromFnt,
  projectFromImage,
  updateProject,
  type WorkState,
} from "../lib/project";
import type { AtlasImage } from "../types";

export type ProjectEditorState = {
  glyphs: ProjectDocument["glyphs"];
  selectedId: ProjectDocument["selectedId"];
  work: WorkState;
};

export type SaveState = "idle" | "saving" | "saved" | "error";

type Props = {
  current: ProjectEditorState;
  onProjectLoaded: (project: ProjectDocument) => void;
  onWorkspaceCleared: () => void;
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useProjectSession({ current, onProjectLoaded, onWorkspaceCleared }: Props) {
  const { glyphs, selectedId, work } = current;
  const [atlas, setAtlas] = useState<AtlasImage | null>(null);
  const [atlasBlob, setAtlasBlob] = useState<Blob | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProjectName, setActiveProjectName] = useState("");
  const [activeProjectCreatedAt, setActiveProjectCreatedAt] = useState(0);
  const [storageReady, setStorageReady] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [storageMessage, setStorageMessage] = useState("");
  const atlasUrlRef = useRef<string | null>(null);
  const bootStartedRef = useRef(false);
  const persistenceRequestedRef = useRef(false);
  const saveRevisionRef = useRef(0);
  // Bumped by every project switch, so a slower earlier load cannot replace a newer one.
  const projectLoadRef = useRef(0);
  // Saves still queued for a deleted project must not write it back.
  const deletedProjectIdsRef = useRef(new Set<string>());
  const saveQueueRef = useRef<SaveQueue<ProjectDocument> | null>(null);

  if (!saveQueueRef.current) {
    saveQueueRef.current = new SaveQueue((project) => deletedProjectIdsRef.current.has(project.id)
      ? Promise.resolve()
      : projectStore.put(project));
  }

  const reportError = useCallback((error: unknown, fallback: string, ready = true) => {
    if (ready) setStorageReady(true);
    setSaveState("error");
    setStorageMessage(errorMessage(error, fallback));
  }, []);

  const upsertProject = useCallback((project: ProjectDocument) => {
    setProjects((currentProjects) => [
      summarizeProject(project),
      ...currentProjects.filter(({ id }) => id !== project.id),
    ]);
  }, []);

  const applyAtlas = useCallback((decoded: DecodedAtlas, blob: Blob) => {
    if (atlasUrlRef.current) URL.revokeObjectURL(atlasUrlRef.current);
    atlasUrlRef.current = decoded.url;
    setAtlas(decoded.atlas);
    setAtlasBlob(blob);
  }, []);

  const applyProjectState = useCallback((project: ProjectDocument) => {
    setActiveProjectId(project.id);
    setActiveProjectName(project.name);
    setActiveProjectCreatedAt(project.createdAt);
    onProjectLoaded(project);
    setSaveState("saved");
    setStorageMessage("");
    setStorageReady(true);
  }, [onProjectLoaded]);

  const applyProject = useCallback(async (project: ProjectDocument) => {
    const load = ++projectLoadRef.current;
    setStorageReady(false);
    let decoded: DecodedAtlas;
    try {
      decoded = await decodeAtlas(project.atlas.blob, project.atlas.name);
    } catch (error) {
      // The current project is still shown, so it keeps autosaving.
      if (load === projectLoadRef.current) setStorageReady(true);
      throw error;
    }
    if (load !== projectLoadRef.current) {
      URL.revokeObjectURL(decoded.url);
      return;
    }
    applyAtlas(decoded, project.atlas.blob);
    applyProjectState(project);
  }, [applyAtlas, applyProjectState]);

  const buildCurrentProject = useCallback((): ProjectDocument | null => {
    if (!activeProjectId || !atlas || !atlasBlob) return null;
    return updateProject(
      {
        id: activeProjectId,
        createdAt: activeProjectCreatedAt || Date.now(),
        atlas: {
          name: atlas.name,
          type: atlasBlob.type || "application/octet-stream",
          blob: atlasBlob,
        },
      },
      activeProjectName || work.fontName || "Untitled project",
      glyphs,
      selectedId,
      work,
      Date.now(),
    );
  }, [activeProjectCreatedAt, activeProjectId, activeProjectName, atlas, atlasBlob, glyphs, selectedId, work]);

  const saveCurrentProject = useCallback(async () => {
    const project = buildCurrentProject();
    if (!project) return true;
    const revision = ++saveRevisionRef.current;
    setSaveState("saving");
    try {
      const saved = await saveQueueRef.current!.save(project);
      if (deletedProjectIdsRef.current.has(saved.id)) return true;
      upsertProject(saved);
      if (revision === saveRevisionRef.current) {
        setSaveState("saved");
        setStorageMessage("");
      }
      if (!persistenceRequestedRef.current && navigator.storage?.persist) {
        persistenceRequestedRef.current = true;
        void navigator.storage.persist();
      }
      return true;
    } catch (error) {
      if (revision === saveRevisionRef.current) {
        setSaveState("error");
        setStorageMessage(errorMessage(error, "Local save failed."));
      }
      return false;
    }
  }, [buildCurrentProject, upsertProject]);

  const confirmBeforeSwitch = useCallback(async (message: string) => {
    if (!storageReady || !activeProjectId) return true;
    const saved = await saveCurrentProject();
    return saved || window.confirm(message);
  }, [activeProjectId, saveCurrentProject, storageReady]);

  const createProjectFromImage = useCallback(async (file: File) => {
    if (!isAtlasFile(file)) return false;
    const load = ++projectLoadRef.current;
    setStorageReady(false);
    let decoded: DecodedAtlas | null = null;
    let atlasApplied = false;
    try {
      decoded = await decodeAtlas(file, file.name);
      const now = Date.now();
      const project = projectFromImage({
        id: crypto.randomUUID(),
        now,
        atlas: { name: file.name, type: file.type || "application/octet-stream", blob: file },
        height: decoded.atlas.height,
      });
      await projectStore.put(project);
      upsertProject(project);
      if (load !== projectLoadRef.current) {
        URL.revokeObjectURL(decoded.url);
        return false;
      }
      applyAtlas(decoded, file);
      atlasApplied = true;
      applyProjectState(project);
      return true;
    } catch (error) {
      if (decoded && !atlasApplied) URL.revokeObjectURL(decoded.url);
      reportError(error, "Could not create project.", load === projectLoadRef.current);
      return false;
    }
  }, [applyAtlas, applyProjectState, reportError, upsertProject]);

  const startProjectFromImage = useCallback(async (file: File) => {
    if (!await confirmBeforeSwitch("Latest changes could not be saved. Create a new project anyway?")) return false;
    return createProjectFromImage(file);
  }, [confirmBeforeSwitch, createProjectFromImage]);

  const importFntAndAtlas = useCallback(async (files: File[]) => {
    const fntFile = files.find((file) => /\.fnt$/i.test(file.name));
    const imageFile = files.find(isAtlasFile);
    if (!fntFile || !imageFile) {
      reportError(new Error("Choose one .fnt file and one PNG or WebP atlas."), "Could not import BMFont project.", false);
      return false;
    }
    if (!await confirmBeforeSwitch("Latest changes could not be saved. Import a new project anyway?")) return false;

    const load = ++projectLoadRef.current;
    setStorageReady(false);
    let decoded: DecodedAtlas | null = null;
    let atlasApplied = false;
    try {
      const parsed = parseFnt(await fntFile.text());
      const expectedImageName = parsed.imageName.split(/[\\/]/).pop()?.toLowerCase();
      if (expectedImageName !== imageFile.name.toLowerCase()) {
        throw new Error(`BMFont expects ${parsed.imageName}, but ${imageFile.name} was selected.`);
      }
      decoded = await decodeAtlas(imageFile, imageFile.name);
      if (decoded.atlas.width !== parsed.imageWidth || decoded.atlas.height !== parsed.imageHeight) {
        throw new Error(`Atlas is ${decoded.atlas.width}×${decoded.atlas.height}; BMFont expects ${parsed.imageWidth}×${parsed.imageHeight}.`);
      }
      const invalidGlyph = parsed.glyphs.find((glyph) =>
        glyph.x + glyph.width > decoded!.atlas.width || glyph.y + glyph.height > decoded!.atlas.height,
      );
      if (invalidGlyph) throw new Error(`Character ${invalidGlyph.char} extends outside the atlas.`);

      const now = Date.now();
      const project = projectFromFnt({
        id: crypto.randomUUID(),
        now,
        atlas: { name: imageFile.name, type: imageFile.type || "application/octet-stream", blob: imageFile },
        parsed,
      });
      await projectStore.put(project);
      upsertProject(project);
      if (load !== projectLoadRef.current) {
        URL.revokeObjectURL(decoded.url);
        return false;
      }
      applyAtlas(decoded, imageFile);
      atlasApplied = true;
      applyProjectState(project);
      return true;
    } catch (error) {
      if (decoded && !atlasApplied) URL.revokeObjectURL(decoded.url);
      reportError(error, "Could not import BMFont project.", load === projectLoadRef.current);
      return false;
    }
  }, [applyAtlas, applyProjectState, confirmBeforeSwitch, reportError, upsertProject]);

  const openStoredProject = useCallback(async (id: string) => {
    if (id === activeProjectId) return true;
    if (!await confirmBeforeSwitch("Latest changes could not be saved. Switch projects anyway?")) return false;
    try {
      const project = await projectStore.get(id);
      if (!project) throw new Error("Project no longer exists.");
      await applyProject(project);
      return true;
    } catch (error) {
      reportError(error, "Could not open project.");
      return false;
    }
  }, [activeProjectId, applyProject, confirmBeforeSwitch, reportError]);

  const renameStoredProject = useCallback(async (summary: ProjectSummary) => {
    const name = window.prompt("Project name", summary.name)?.trim();
    if (!name || name === summary.name) return false;
    try {
      let renamed: ProjectDocument;
      if (summary.id === activeProjectId) {
        const project = buildCurrentProject();
        if (!project) throw new Error("Project no longer exists.");
        setActiveProjectName(name);
        renamed = await saveQueueRef.current!.save({ ...project, name });
      } else {
        renamed = await saveQueueRef.current!.run(async () => {
          const project = await projectStore.get(summary.id);
          if (!project) throw new Error("Project no longer exists.");
          const next = { ...project, name, updatedAt: Date.now() };
          await projectStore.put(next);
          return next;
        });
      }
      upsertProject(renamed);
      return true;
    } catch (error) {
      reportError(error, "Could not rename project.", false);
      return false;
    }
  }, [activeProjectId, buildCurrentProject, reportError, upsertProject]);

  const duplicateStoredProject = useCallback(async (summary: ProjectSummary) => {
    if (!await confirmBeforeSwitch("Latest changes could not be saved. Duplicate and switch projects anyway?")) return false;
    try {
      const source = summary.id === activeProjectId ? buildCurrentProject() : await projectStore.get(summary.id);
      if (!source) throw new Error("Project no longer exists.");
      const now = Date.now();
      const copy: ProjectDocument = {
        ...source,
        id: crypto.randomUUID(),
        name: `${source.name} copy`,
        createdAt: now,
        updatedAt: now,
      };
      await projectStore.put(copy);
      upsertProject(copy);
      await applyProject(copy);
      return true;
    } catch (error) {
      reportError(error, "Could not duplicate project.", false);
      return false;
    }
  }, [activeProjectId, applyProject, buildCurrentProject, confirmBeforeSwitch, reportError, upsertProject]);

  const clearWorkspace = useCallback(() => {
    projectLoadRef.current += 1;
    if (atlasUrlRef.current) URL.revokeObjectURL(atlasUrlRef.current);
    atlasUrlRef.current = null;
    setAtlas(null);
    setAtlasBlob(null);
    setActiveProjectId(null);
    setActiveProjectName("");
    setActiveProjectCreatedAt(0);
    onWorkspaceCleared();
    setStorageReady(true);
    setSaveState("idle");
    setStorageMessage("");
  }, [onWorkspaceCleared]);

  const removeStoredProject = useCallback(async (summary: ProjectSummary) => {
    if (!window.confirm(`Delete local project "${summary.name}"? This cannot be undone.`)) return false;
    const isActive = summary.id === activeProjectId;
    if (isActive) setStorageReady(false);
    deletedProjectIdsRef.current.add(summary.id);
    try {
      // Queued behind pending saves, so none of them can recreate the project afterwards.
      await saveQueueRef.current!.run(() => projectStore.delete(summary.id));
    } catch (error) {
      deletedProjectIdsRef.current.delete(summary.id);
      reportError(error, "Could not delete project.", isActive);
      return false;
    }
    const remaining = projects.filter(({ id }) => id !== summary.id);
    setProjects((currentProjects) => currentProjects.filter(({ id }) => id !== summary.id));
    if (!isActive) return true;
    try {
      const nextProject = remaining[0] ? await projectStore.get(remaining[0].id) : null;
      if (nextProject) await applyProject(nextProject);
      else clearWorkspace();
    } catch (error) {
      clearWorkspace();
      reportError(error, "Could not open the next project.");
    }
    return true;
  }, [activeProjectId, applyProject, clearWorkspace, projects, reportError]);

  const loadSampleProject = useCallback(async () => {
    try {
      const { createSampleAtlas } = await import("../lib/sampleAtlas");
      const sample = await createSampleAtlas();
      return startProjectFromImage(sample.file);
    } catch (error) {
      reportError(error, "Could not load sample font.");
      return false;
    }
  }, [reportError, startProjectFromImage]);

  useEffect(() => {
    if (bootStartedRef.current) return;
    bootStartedRef.current = true;
    void (async () => {
      try {
        const storedProjects = await projectStore.list();
        setProjects(storedProjects);
        if (storedProjects[0]) {
          const project = await projectStore.get(storedProjects[0].id);
          if (project) await applyProject(project);
          else setStorageReady(true);
        } else {
          setStorageReady(true);
        }
      } catch (error) {
        reportError(error, "Could not load local projects.");
      }
    })();
  }, [applyProject, reportError]);

  useEffect(() => {
    if (!storageReady || !activeProjectId || !atlasBlob) return;
    const timer = window.setTimeout(() => void saveCurrentProject(), 500);
    return () => window.clearTimeout(timer);
  }, [activeProjectId, atlasBlob, saveCurrentProject, storageReady]);

  useEffect(() => {
    const checkpoint = () => {
      if (document.visibilityState === "hidden" && storageReady) void saveCurrentProject();
    };
    document.addEventListener("visibilitychange", checkpoint);
    return () => document.removeEventListener("visibilitychange", checkpoint);
  }, [saveCurrentProject, storageReady]);

  useEffect(() => () => {
    if (atlasUrlRef.current) URL.revokeObjectURL(atlasUrlRef.current);
  }, []);

  return {
    atlas,
    atlasBlob,
    projects,
    activeProjectId,
    activeProjectName,
    saveState,
    storageMessage,
    startProjectFromImage,
    importFntAndAtlas,
    openStoredProject,
    renameStoredProject,
    duplicateStoredProject,
    removeStoredProject,
    loadSampleProject,
  };
}
