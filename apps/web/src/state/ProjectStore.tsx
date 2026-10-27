// Project documents in memory + auto-save to local storage (FR-08). Every change goes through
// `commit`, which updates state and persists the changed documents.

import {
  createProjectDocument,
  parseProjectFile,
  type ProjectDocument,
  type ProjectInput,
} from '@evm/core';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { newId, nowIso } from '../lib/ids';
import { preferences, type ProjectStorage } from '../lib/storage';
import { useToast } from './ToastProvider';

const CURRENT_KEY = 'evm.currentProject';

export interface ProjectStore {
  status: 'loading' | 'ready';
  documents: ProjectDocument[];
  current: ProjectDocument | null;
  selectProject: (id: string | null) => void;
  createProject: (input: ProjectInput) => ProjectDocument;
  updateProject: (id: string, input: ProjectInput) => void;
  deleteProject: (id: string) => void;
  /** Adds or replaces a whole document (open file, sample project, undo). */
  putDocument: (document: ProjectDocument, options?: { select?: boolean }) => void;
  /** Applies a change to the current project's document. */
  updateCurrent: (change: (document: ProjectDocument) => ProjectDocument) => void;
}

const StoreContext = createContext<ProjectStore | null>(null);

function touch(document: ProjectDocument): ProjectDocument {
  return { ...document, project: { ...document.project, updatedAt: nowIso() } };
}

export function ProjectStoreProvider({
  storage,
  children,
}: {
  storage: ProjectStorage;
  children: ReactNode;
}) {
  const toast = useToast();
  const [status, setStatus] = useState<ProjectStore['status']>('loading');
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(() => preferences.get(CURRENT_KEY));
  const documentsRef = useRef<ProjectDocument[]>([]);

  // Load once. Every stored document is re-validated with the core schemas.
  useEffect(() => {
    let cancelled = false;
    storage
      .loadAll()
      .then((stored) => {
        if (cancelled) return;
        const valid: ProjectDocument[] = [];
        let skipped = 0;
        for (const item of stored) {
          const parsed = parseProjectFile(item);
          if (parsed.document) valid.push(parsed.document);
          else skipped++;
        }
        documentsRef.current = valid;
        setDocuments(valid);
        setCurrentId((id) =>
          id && valid.some((d) => d.project.id === id) ? id : (valid[0]?.project.id ?? null),
        );
        if (skipped > 0) {
          toast({
            tone: 'warning',
            title: `${skipped} saved project${skipped === 1 ? '' : 's'} could not be loaded`,
            description: 'The stored data was damaged and has been ignored.',
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          toast({
            tone: 'error',
            title: 'Saved projects could not be loaded',
            description:
              'This browser blocked local storage. Changes will not be kept after you close the page.',
          });
        }
      })
      .finally(() => {
        if (!cancelled) setStatus('ready');
      });
    return () => {
      cancelled = true;
    };
  }, [storage, toast]);

  useEffect(() => {
    preferences.set(CURRENT_KEY, currentId);
  }, [currentId]);

  const reportSaveError = useCallback(
    () =>
      toast({
        tone: 'error',
        title: 'Could not auto-save',
        description: 'Use “Save project file” to keep a copy of your work.',
      }),
    [toast],
  );

  const commit = useCallback(
    (next: ProjectDocument[], changed: ProjectDocument[] = [], removedIds: string[] = []) => {
      documentsRef.current = next;
      setDocuments(next);
      for (const document of changed) storage.save(document).catch(reportSaveError);
      for (const id of removedIds) storage.remove(id).catch(reportSaveError);
    },
    [storage, reportSaveError],
  );

  const putDocument = useCallback<ProjectStore['putDocument']>(
    (document, options = {}) => {
      const list = documentsRef.current;
      const exists = list.some((d) => d.project.id === document.project.id);
      const next = exists
        ? list.map((d) => (d.project.id === document.project.id ? document : d))
        : [document, ...list];
      commit(next, [document]);
      if (options.select !== false) setCurrentId(document.project.id);
    },
    [commit],
  );

  const createProject = useCallback<ProjectStore['createProject']>(
    (input) => {
      const document = createProjectDocument(input, { id: newId(), now: nowIso() });
      putDocument(document);
      return document;
    },
    [putDocument],
  );

  const updateDocument = useCallback(
    (id: string, change: (document: ProjectDocument) => ProjectDocument) => {
      const target = documentsRef.current.find((d) => d.project.id === id);
      if (!target) return;
      const updated = touch(change(target));
      commit(
        documentsRef.current.map((d) => (d.project.id === id ? updated : d)),
        [updated],
      );
    },
    [commit],
  );

  const updateProject = useCallback<ProjectStore['updateProject']>(
    (id, input) => updateDocument(id, (d) => ({ ...d, project: { ...d.project, ...input } })),
    [updateDocument],
  );

  const deleteProject = useCallback<ProjectStore['deleteProject']>(
    (id) => {
      const next = documentsRef.current.filter((d) => d.project.id !== id);
      commit(next, [], [id]);
      setCurrentId((current) => (current === id ? (next[0]?.project.id ?? null) : current));
    },
    [commit],
  );

  const current = documents.find((d) => d.project.id === currentId) ?? null;

  const updateCurrent = useCallback<ProjectStore['updateCurrent']>(
    (change) => {
      if (currentId) updateDocument(currentId, change);
    },
    [currentId, updateDocument],
  );

  const value = useMemo<ProjectStore>(
    () => ({
      status,
      documents,
      current,
      selectProject: setCurrentId,
      createProject,
      updateProject,
      deleteProject,
      putDocument,
      updateCurrent,
    }),
    [
      status,
      documents,
      current,
      createProject,
      updateProject,
      deleteProject,
      putDocument,
      updateCurrent,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useProjects(): ProjectStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useProjects must be used inside <ProjectStoreProvider>');
  return store;
}
