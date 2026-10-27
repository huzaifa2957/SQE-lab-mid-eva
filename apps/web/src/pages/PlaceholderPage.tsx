import { FeaturePanel } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';

interface PlaceholderPageProps {
  title: string;
  phase: number;
  description: string;
}

/** Dashboard, Insights and Report arrive in Phases 4–6. */
export function PlaceholderPage({ title, phase, description }: PlaceholderPageProps) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} />
      <FeaturePanel eyebrow={`Coming in Phase ${phase}`} title={`${title} is on its way`}>
        {description}
      </FeaturePanel>
    </div>
  );
}
