import {
  budgetAtCompletion,
  formatCurrency,
  type ProjectDocument,
  type ProjectInput,
} from '@evm/core';
import {
  ArrowRight,
  CircleX,
  Download,
  FolderOpen,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, FeaturePanel } from '../../components/ui/Card';
import { cx } from '../../components/ui/cx';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { defaultProjectInput } from '../../lib/ids';
import type { Navigate, PageParams } from '../../state/navigation';
import { useProjects } from '../../state/ProjectStore';
import { useToast } from '../../state/ToastProvider';
import { useLoadSample } from '../../state/useLoadSample';
import { useProjectFiles } from '../../state/useProjectFiles';
import { ProjectFormModal } from './ProjectFormModal';

type FormState = { mode: 'create' } | { mode: 'edit'; document: ProjectDocument } | null;

const inputFromDocument = ({ project }: ProjectDocument): ProjectInput => ({
  name: project.name,
  currency: project.currency,
  startDate: project.startDate,
  endDate: project.endDate,
  statusDate: project.statusDate,
});

export function ProjectsPage({
  onNavigate,
  params = {},
}: {
  onNavigate: Navigate;
  params?: PageParams;
}) {
  const store = useProjects();
  const toast = useToast();
  const files = useProjectFiles();
  const loadSample = useLoadSample();
  const fileInput = useRef<HTMLInputElement>(null);
  // "Create project" from other pages arrives as #/projects?new=1
  const [form, setForm] = useState<FormState>(() =>
    params.new === '1' ? { mode: 'create' } : null,
  );
  const [toDelete, setToDelete] = useState<ProjectDocument | null>(null);

  const submitForm = (input: ProjectInput) => {
    if (form?.mode === 'edit') {
      store.updateProject(form.document.project.id, input);
      toast({ tone: 'success', title: 'Project updated' });
    } else {
      const created = store.createProject(input);
      toast({ tone: 'success', title: `Created “${created.project.name}”` });
    }
    setForm(null);
  };

  const confirmDelete = () => {
    if (!toDelete) return;
    const removed = toDelete;
    store.deleteProject(removed.project.id);
    setToDelete(null);
    toast({
      tone: 'success',
      title: `Deleted “${removed.project.name}”`,
      action: { label: 'Undo', onClick: () => store.putDocument(removed) },
    });
  };

  // Desktop: native Open dialog; browser: the hidden file input.
  const openProjectFile = async () => {
    if (!(await files.openFromDialog())) fileInput.current?.click();
  };

  // The desktop File → Open project menu arrives as #/projects?open=<n>.
  const openRequest = params.open;
  const handledOpen = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!openRequest || handledOpen.current === openRequest) return;
    handledOpen.current = openRequest;
    void files.openFromDialog();
  }, [openRequest, files]);

  const open = (document: ProjectDocument) => {
    store.selectProject(document.project.id);
    onNavigate('data');
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Projects"
        description="Create a project, open a saved project file or try the sample project."
        actions={
          <>
            <Button variant="secondary" icon={FolderOpen} onClick={() => void openProjectFile()}>
              Open project file
            </Button>
            <Button variant="secondary" icon={Sparkles} onClick={loadSample}>
              Load sample project
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setForm({ mode: 'create' })}>
              New project
            </Button>
          </>
        }
      />
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        aria-label="Open project file"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void files.openFile(file);
        }}
      />

      {store.status === 'ready' && store.documents.length === 0 && (
        <FeaturePanel
          eyebrow="Get started"
          title="No projects yet"
          actions={
            <>
              <Button variant="primary" icon={Plus} onClick={() => setForm({ mode: 'create' })}>
                New project
              </Button>
              <Button
                variant="secondary"
                icon={Sparkles}
                onClick={loadSample}
                className="border-feature-muted text-feature-text hover:bg-feature"
              >
                Load sample project
              </Button>
            </>
          }
        >
          Create a project to enter tasks by hand or import them from Excel or CSV. The sample
          project shows a 12-task building job that starts healthy and then runs over budget.
        </FeaturePanel>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {store.documents.map((document) => {
          const selected = store.current?.project.id === document.project.id;
          const { project } = document;
          return (
            <Card
              key={project.id}
              aria-label={project.name}
              className={cx(selected && 'border-accent ring-1 ring-accent')}
              title={project.name}
              description={`${project.startDate} → ${project.endDate}`}
              actions={selected ? <Badge tone="success">Current</Badge> : undefined}
            >
              <dl className="grid grid-cols-3 gap-4">
                <Stat
                  label="Budget (BAC)"
                  value={formatCurrency(budgetAtCompletion(document.tasks), project.currency)}
                />
                <Stat label="Tasks" value={String(document.tasks.length)} />
                <Stat label="Status date" value={project.statusDate} />
              </dl>
              <div className="mt-6 flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  icon={ArrowRight}
                  onClick={() => open(document)}
                >
                  Open
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Pencil}
                  onClick={() => setForm({ mode: 'edit', document })}
                >
                  Edit
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Download}
                  onClick={() => files.saveFile(document)}
                >
                  Save file
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  icon={Trash2}
                  onClick={() => setToDelete(document)}
                >
                  Delete
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {form && (
        <ProjectFormModal
          open
          mode={form.mode}
          initial={form.mode === 'edit' ? inputFromDocument(form.document) : defaultProjectInput()}
          onCancel={() => setForm(null)}
          onSubmit={submitForm}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete project?"
        tone="danger"
        confirmLabel="Delete project"
        message={
          <>
            “{toDelete?.project.name}” and its {toDelete?.tasks.length ?? 0} tasks will be removed
            from this browser. Save a project file first if you want to keep a copy.
          </>
        }
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />

      <ConfirmDialog
        open={files.pendingReplace !== null}
        title="Replace project?"
        confirmLabel="Replace"
        message={
          <>
            A project with the same id (“{files.pendingReplace?.project.name}”) is already in this
            browser. Replace it with the version from the file? You can undo this.
          </>
        }
        onConfirm={files.confirmReplace}
        onCancel={files.cancelReplace}
      />

      <Modal
        open={files.problem !== null}
        title="Project file not opened"
        description={files.problem?.fileName}
        onClose={files.clearProblem}
        footer={
          <Button variant="primary" onClick={files.clearProblem}>
            OK
          </Button>
        }
      >
        <ul className="flex flex-col gap-2">
          {files.problem?.errors.slice(0, 20).map((issue, i) => (
            <li key={i} className="flex items-start gap-2 text-control text-error-strong">
              <CircleX size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
              <span>{issue.message}</span>
            </li>
          ))}
        </ul>
        {(files.problem?.errors.length ?? 0) > 20 && (
          <p className="mt-3 text-support text-muted">
            …and {files.problem!.errors.length - 20} more.
          </p>
        )}
      </Modal>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-support tracking-wider text-muted uppercase">{label}</dt>
      <dd className="mt-1 truncate font-display text-subsection font-medium tabular-nums">
        {value}
      </dd>
    </div>
  );
}
