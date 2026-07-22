import { Copy, Pencil, Plus, Trash2, Upload } from "lucide-react";
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

export function Projects({ open, projects, activeId, error, onClose, onNew, onImport, onOpen, onRename, onCopy, onDelete }: Props) {
  if (!open) return null;
  return (
    <div className="project-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="project-dialog" role="dialog" aria-modal="true" aria-labelledby="projects-title">
        <div className="project-dialog-header">
          <div><span className="eyebrow">LOCAL WORKSPACE</span><h2 id="projects-title">Projects</h2></div>
          <button className="icon-button" aria-label="Close projects" onClick={onClose}>×</button>
        </div>
        <div className="project-actions">
          <button className="button button--primary" onClick={onNew}><Plus size={16} /> New from image</button>
          <button className="button" onClick={onImport}><Upload size={16} /> Import .fnt + image</button>
        </div>
        {error && <p className="project-error">{error}</p>}
        <div className="project-list">
          {projects.length === 0 ? <p className="project-empty">No local projects yet.</p> : projects.map((project) => (
            <article className={`project-row ${project.id === activeId ? "is-active" : ""}`} key={project.id}>
              <button className="project-open" onClick={() => onOpen(project.id)}>
                <strong>{project.name}</strong>
                <small>{project.atlasName} · {new Date(project.updatedAt).toLocaleString()}</small>
              </button>
              <div className="project-row-actions">
                <button className="icon-button" aria-label={`Rename ${project.name}`} title="Rename" onClick={() => onRename(project)}><Pencil size={15} /></button>
                <button className="icon-button" aria-label={`Duplicate ${project.name}`} title="Duplicate" onClick={() => onCopy(project)}><Copy size={15} /></button>
                <button className="icon-button danger" aria-label={`Delete ${project.name}`} title="Delete" onClick={() => onDelete(project)}><Trash2 size={15} /></button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
