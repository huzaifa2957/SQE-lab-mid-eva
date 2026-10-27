// FR-08: save / open .evm.json project files. Opening validates with the core schemas first.

import {
  parseProjectFile,
  projectFileName,
  type ProjectDocument,
  serializeProjectFile,
  type ValidationIssue,
  validateProjectFileMeta,
} from '@evm/core';
import { useCallback, useState } from 'react';
import { downloadText, errorMessage, readFileText } from '../lib/files';
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
    (document: ProjectDocument) => {
      try {
        const name = projectFileName(document.project.name);
        downloadText(serializeProjectFile(document), name, 'application/json');
        toast({ tone: 'success', title: `Saved ${name}` });
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

  const openFile = useCallback(
    async (file: File) => {
      const check = validateProjectFileMeta({ name: file.name, size: file.size, type: file.type });
      if (!check.valid) {
        setProblem({ fileName: file.name, errors: check.errors });
        return;
      }
      try {
        const result = parseProjectFile(await readFileText(file));
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

  const confirmReplace = useCallback(() => {
    if (pendingReplace) accept(pendingReplace);
    setPendingReplace(null);
  }, [accept, pendingReplace]);

  return {
    saveFile,
    openFile,
    problem,
    clearProblem: () => setProblem(null),
    pendingReplace,
    confirmReplace,
    cancelReplace: () => setPendingReplace(null),
  };
}
