// FR-08 / FR-51: save / open .evm.json project files — downloads and <input type=file> in the
// browser, native dialogs on desktop. Opening validates with the core schemas first.

import {
  parseProjectFile,
  projectFileName,
  type ProjectDocument,
  serializeProjectFile,
  type ValidationIssue,
  validateProjectFileMeta,
} from '@evm/core';
import { useCallback, useState } from 'react';
import { errorMessage, readFileText } from '../lib/files';
import { getPlatform } from '../platform';
import { useProjects } from './ProjectStore';
import { useToast } from './ToastProvider';

export interface OpenFileProblem {
  fileName: string;
  errors: ValidationIssue[];
}

export function useProjectFiles() {
  const { documents, putDocument } = useProjects();
  const toast = useToast();
  const [problem, setProblem] = useState<OpenFileProblem | null>(null);
  const [pendingReplace, setPendingReplace] = useState<ProjectDocument | null>(null);

  const saveFile = useCallback(
    async (document: ProjectDocument) => {
      try {
        const result = await getPlatform().saveFile({
          kind: 'project',
          name: projectFileName(document.project.name),
          data: serializeProjectFile(document),
          mimeType: 'application/json',
        });
        if (result.saved) toast({ tone: 'success', title: `Saved ${result.fileName}` });
      } catch (error) {
        toast({
          tone: 'error',
          title: 'Could not save the project file',
          description: errorMessage(error),
        });
      }
    },
    [toast],
  );

  const accept = useCallback(
    (document: ProjectDocument) => {
      const previous = documents.find((d) => d.project.id === document.project.id);
      putDocument(document);
      toast({
        tone: 'success',
        title: `Opened “${document.project.name}”`,
        description: `${document.tasks.length} tasks, ${document.snapshots.length} snapshots`,
        action: previous ? { label: 'Undo', onClick: () => putDocument(previous) } : undefined,
      });
    },
    [documents, putDocument, toast],
  );

  /** Validates and opens project file text (from a File in the browser or a native dialog). */
  const openText = useCallback(
    async (file: { name: string; size: number; type?: string }, read: () => Promise<string>) => {
      const check = validateProjectFileMeta({
        name: file.name,
        size: file.size,
        type: file.type ?? '',
      });
      if (!check.valid) {
        setProblem({ fileName: file.name, errors: check.errors });
        return;
      }
      try {
        const result = parseProjectFile(await read());
        if (!result.document) {
          setProblem({ fileName: file.name, errors: result.errors });
          toast({
            tone: 'error',
            title: `“${file.name}” could not be opened`,
            description: result.errors[0]?.message,
          });
          return;
        }
        if (documents.some((d) => d.project.id === result.document!.project.id)) {
          setPendingReplace(result.document);
          return;
        }
        accept(result.document);
      } catch (error) {
        const message = `“${file.name}” could not be read. ${errorMessage(error, '')}`.trim();
        setProblem({
          fileName: file.name,
          errors: [{ ruleId: 'FR-08', severity: 'error', message }],
        });
      }
    },
    [accept, documents, toast],
  );

  const openFile = useCallback(
    (file: File) => openText(file, () => readFileText(file)),
    [openText],
  );

  /** Desktop: native Open dialog (FR-51). Returns false where the platform has none. */
  const openFromDialog = useCallback(async (): Promise<boolean> => {
    const open = getPlatform().openProjectFile;
    if (!open) return false;
    try {
      const picked = await open();
      if (picked) await openText(picked, async () => picked.text);
    } catch {
      toast({ tone: 'error', title: 'Could not open the project file' });
    }
    return true;
  }, [openText, toast]);

  const confirmReplace = useCallback(() => {
    if (pendingReplace) accept(pendingReplace);
    setPendingReplace(null);
  }, [accept, pendingReplace]);

  return {
    saveFile,
    openFile,
    openFromDialog,
    problem,
    clearProblem: () => setProblem(null),
    pendingReplace,
    confirmReplace,
    cancelReplace: () => setPendingReplace(null),
  };
}
