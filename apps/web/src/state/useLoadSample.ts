import { useCallback } from 'react';
import { errorMessage } from '../lib/files';
import { newId, nowIso } from '../lib/ids';
import { buildSampleDocument } from '../lib/sampleProject';
import { useProjects } from './ProjectStore';
import { useToast } from './ToastProvider';

/** FR-09: adds the built-in sample project and selects it. */
export function useLoadSample(): () => boolean {
  const { putDocument } = useProjects();
  const toast = useToast();
  return useCallback(() => {
    try {
      const sample = buildSampleDocument(newId(), nowIso());
      putDocument(sample);
      toast({ tone: 'success', title: 'Sample project loaded', description: sample.project.name });
      return true;
    } catch (error) {
      toast({
        tone: 'error',
        title: 'Could not load the sample project',
        description: errorMessage(error),
      });
      return false;
    }
  }, [putDocument, toast]);
}
