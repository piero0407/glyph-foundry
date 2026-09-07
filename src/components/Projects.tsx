import { useState } from "react";
import {
  Clock,
  Copy,
  FolderOpen,
  Image,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { ProjectSummary } from "../lib/projectStore";

type Props = {
  open: boolean;
  projects: ProjectSummary[];
  activeId: string | null;
  error: string;
  onClose: () => void;
  onNew: () => void;
  onImport: () => void;
  onOpen: (id: string) => void;
  onRename: (project: ProjectSummary) => void;
  onCopy: (project: ProjectSummary) => void;
  onDelete: (project: ProjectSummary) => void;
};

export function Projects({
  open,
  projects,
  activeId,
  error,
  onClose,
  onNew,
  onImport,
  onOpen,
  onRename,
  onCopy,
  onDelete,
}: Props) {
  const [search, setSearch] = useState("");

  if (!open) return null;

  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.atlasName.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="modal-card projects-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="projects-dialog-title"
      >
        {/* HEADER */}
        <div className="modal-header">
          <div className="modal-header-title">
            <FolderOpen size={18} className="text-accent" />
            <h3 id="projects-dialog-title">Saved Projects</h3>
            <span className="badge badge--neutral">{projects.length}</span>
          </div>

          <button className="icon-btn" aria-label="Close projects" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* ACTIONS & SEARCH BAR */}
        <div className="projects-toolbar">
          <div className="projects-search-wrap">
            <Search size={14} className="search-icon" />
            <input
              type="search"
              placeholder="Search projects by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="projects-search-input"
            />
          </div>

          <div className="projects-toolbar-btns">
            <button className="btn btn--primary btn--sm" onClick={onNew}>
              <Plus size={14} /> New from Image
            </button>
            <button className="btn btn--subtle btn--sm" onClick={onImport}>
              <Upload size={14} /> Import .fnt
            </button>
          </div>
        </div>

        {error && <div className="callout callout--error mx-4 my-2">{error}</div>}

        {/* PROJECT LIST */}
        <div className="projects-list">
          {filtered.length === 0 ? (
            <div className="projects-empty">
              <FolderOpen size={36} className="text-muted" />
              <p>{search ? "No projects match your search." : "No saved projects yet."}</p>
              <button className="btn btn--primary btn--sm mt-2" onClick={onNew}>
                Create First Project
              </button>
            </div>
          ) : (
            filtered.map((project) => {
              const isActive = project.id === activeId;
              const formattedDate = new Date(project.updatedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <article
                  key={project.id}
                  className={`project-card ${isActive ? "is-active" : ""}`}
                >
                  <button
                    className="project-card-main"
                    onClick={() => onOpen(project.id)}
                    title={`Open ${project.name}`}
                  >
                    <div className="project-card-icon">
                      <Image size={18} />
                    </div>
                    <div className="project-card-details">
                      <div className="project-card-header">
                        <strong className="project-title">{project.name}</strong>
                        {isActive && <span className="badge badge--accent">Active</span>}
                      </div>
                      <span className="project-meta">
                        <span>{project.atlasName}</span>
                        <span>•</span>
                        <Clock size={11} />
                        <span>{formattedDate}</span>
                      </span>
                    </div>
                  </button>

                  <div className="project-card-actions">
                    <button
                      className="icon-btn icon-btn--sm"
                      aria-label={`Rename ${project.name}`}
                      title="Rename"
                      onClick={() => onRename(project)}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="icon-btn icon-btn--sm"
                      aria-label={`Duplicate ${project.name}`}
                      title="Duplicate"
                      onClick={() => onCopy(project)}
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      className="icon-btn icon-btn--sm icon-btn--danger"
                      aria-label={`Delete ${project.name}`}
                      title="Delete"
                      onClick={() => onDelete(project)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
