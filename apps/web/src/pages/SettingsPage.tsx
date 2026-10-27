import type { EacMethod } from '@evm/core';
import { Card } from '../components/ui/Card';
import { cx } from '../components/ui/cx';
import { Select } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { useProjects } from '../state/ProjectStore';
import { type ThemePreference, useTheme } from '../state/ThemeProvider';

const THEMES: { value: ThemePreference; label: string; hint: string }[] = [
  { value: 'system', label: 'System', hint: 'Follow the operating system setting' },
  { value: 'light', label: 'Light', hint: 'Always light' },
  { value: 'dark', label: 'Dark', hint: 'Always dark' },
];

const EAC_METHODS: { value: EacMethod; label: string }[] = [
  { value: 'typical', label: 'Typical — BAC ÷ CPI' },
  { value: 'atypical', label: 'Atypical — AC + (BAC − EV)' },
  { value: 'combined', label: 'Combined — AC + (BAC − EV) ÷ (CPI × SPI)' },
];

export function SettingsPage() {
  const { preference, setPreference } = useTheme();
  const { current, updateCurrent } = useProjects();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="Appearance and calculation options." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Appearance">
          <fieldset>
            <legend className="text-control font-medium">Theme</legend>
            <div className="mt-3 flex flex-col gap-2">
              {THEMES.map((option) => (
                <label
                  key={option.value}
                  className={cx(
                    'flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3',
                    preference === option.value ? 'border-accent bg-card-subtle' : 'border-border',
                  )}
                >
                  <input
                    type="radio"
                    name="theme"
                    value={option.value}
                    checked={preference === option.value}
                    onChange={() => setPreference(option.value)}
                    className="accent-feature"
                  />
                  <span>
                    <span className="block text-control font-medium">{option.label}</span>
                    <span className="block text-support text-muted">{option.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </Card>

        <Card
          title="Calculation"
          description="Primary estimate at completion used for ETC and VAC (FR-14)."
        >
          {current ? (
            <Select
              label={`EAC method for “${current.project.name}”`}
              value={current.eacMethod}
              options={EAC_METHODS}
              onChange={(event) =>
                updateCurrent((d) => ({ ...d, eacMethod: event.target.value as EacMethod }))
              }
            />
          ) : (
            <p className="text-control text-muted">Select a project to choose its EAC method.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
