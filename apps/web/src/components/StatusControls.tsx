// Status date picker (FR-15) and "Record status" (FR-07), shared by the Data and Dashboard pages.

import {
  createSnapshot,
  findSnapshot,
  type ProjectDocument,
  type StatusSnapshot,
  upsertSnapshot,
  validateProject,
} from '@evm/core';
import { Camera } from 'lucide-react';
import { useState } from 'react';
import { useProjects } from '../state/ProjectStore';
import { useToast } from '../state/ToastProvider';
import { Button } from './ui/Button';
import { Input } from './ui/Field';
import { ConfirmDialog } from './ui/Modal';

interface StatusDateInputProps {
  document: ProjectDocument;
  /** Hide the visible hint (compact header use). */
  compact?: boolean;
  className?: string;
}

/** Changing the status date recalculates everything; the date is checked with VR-09 first. */
export function StatusDateInput({ document, compact, className }: StatusDateInputProps) {
  const { updateCurrent } = useProjects();
  const { project } = document;
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();

  const change = (value: string) => {
    setDraft(value);
    const issue = validateProject({ ...project, statusDate: value }).errors.find(
      (e) => e.column === 'Status Date',
    );
    if (issue) {
      setError(issue.detail ?? issue.message);
      return;
    }
    setError(undefined);
    setDraft(null);
    updateCurrent((d) => ({ ...d, project: { ...d.project, statusDate: value } }));
  };

  return (
    <Input
      label="Status date"
      type="date"
      value={draft ?? project.statusDate}
      onChange={(event) => change(event.target.value)}
      error={error}
      hint={compact ? undefined : `Project runs ${project.startDate} → ${project.endDate}`}
      fieldClassName={className ?? 'w-64'}
    />
  );
}

/** "Record status" button plus its replace-confirmation dialog. */
export function RecordStatusButton({ document }: { document: ProjectDocument }) {
  const { updateCurrent, putDocument } = useProjects();
  const toast = useToast();
  const [replace, setReplace] = useState<StatusSnapshot | null>(null);

  const save = (snapshot: StatusSnapshot) => {
    const before = document;
    updateCurrent((d) => ({ ...d, snapshots: upsertSnapshot(d.snapshots, snapshot) }));
    setReplace(null);
    toast({
      tone: 'success',
      title: `Status recorded for ${snapshot.date}`,
      action: { label: 'Undo', onClick: () => putDocument(before) },
    });
  };

  const record = () => {
    const snapshot = createSnapshot(document.tasks, document.project.statusDate);
    if (!snapshot) {
      toast({
        tone: 'error',
        title: 'Could not record status',
        description: 'Check the task dates and status date.',
      });
      return;
    }
    if (findSnapshot(document.snapshots, snapshot.date)) setReplace(snapshot);
    else save(snapshot);
  };

  return (
    <>
      <Button
        variant="primary"
        icon={Camera}
        onClick={record}
        disabled={document.tasks.length === 0}
      >
        Record status
      </Button>
      <ConfirmDialog
        open={replace !== null}
        title="Replace snapshot?"
        confirmLabel="Replace snapshot"
        message={`A snapshot for ${replace?.date} already exists. Replace it with the current figures?`}
        onConfirm={() => replace && save(replace)}
        onCancel={() => setReplace(null)}
      />
    </>
  );
}
