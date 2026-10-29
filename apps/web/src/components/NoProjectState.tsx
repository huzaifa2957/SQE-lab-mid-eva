import { Plus, Sparkles } from 'lucide-react';
import type { Navigate } from '../state/navigation';
import { useLoadSample } from '../state/useLoadSample';
import { Button } from './ui/Button';
import { FeaturePanel } from './ui/Card';

/** Shown on project pages when no project is selected. */
export function NoProjectState({ onNavigate, what }: { onNavigate: Navigate; what: string }) {
  const loadSample = useLoadSample();
  return (
    <FeaturePanel
      eyebrow="No project selected"
      title={`Create a project to see ${what}`}
      actions={
        <>
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => onNavigate('projects', { new: '1' })}
          >
            Create project
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
      The sample project is a 12-task building job with six status updates — a quick way to explore
      the dashboard.
    </FeaturePanel>
  );
}
