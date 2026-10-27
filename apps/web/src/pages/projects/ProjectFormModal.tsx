import { type ProjectInput, PROJECT_COLUMNS, type ProjectField, validateProject } from '@evm/core';
import { type FormEvent, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';

const CURRENCIES = ['PKR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'INR', 'CAD', 'AUD', 'CNY', 'JPY'];
const FIELD_BY_LABEL = new Map(PROJECT_COLUMNS.map((c) => [c.label, c.field]));

interface ProjectFormModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  initial: ProjectInput;
  onCancel: () => void;
  onSubmit: (input: ProjectInput) => void;
}

/** FR-01: create / edit a project. Validation comes from the core ProjectInput schema (VR-08, VR-09). */
export function ProjectFormModal({
  open,
  mode,
  initial,
  onCancel,
  onSubmit,
}: ProjectFormModalProps) {
  const [values, setValues] = useState<ProjectInput>(initial);
  const [errors, setErrors] = useState<Partial<Record<ProjectField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const set = (field: ProjectField) => (event: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [field]: event.target.value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = validateProject(values);
    if (!result.project) {
      const next: Partial<Record<ProjectField, string>> = {};
      const other: string[] = [];
      for (const issue of result.errors) {
        const field = issue.column ? FIELD_BY_LABEL.get(issue.column) : undefined;
        if (field) next[field] ??= issue.detail ?? issue.message;
        else other.push(issue.message);
      }
      setErrors(next);
      setFormError(other[0] ?? null);
      return;
    }
    setErrors({});
    setFormError(null);
    onSubmit(result.project);
  };

  const currencyOptions = [...new Set([values.currency, ...CURRENCIES])]
    .filter(Boolean)
    .map((code) => ({ value: code, label: code }));

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={mode === 'create' ? 'New project' : 'Edit project'}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="project-form">
            {mode === 'create' ? 'Create project' : 'Save changes'}
          </Button>
        </>
      }
    >
      <form
        id="project-form"
        noValidate
        onSubmit={submit}
        className="grid grid-cols-1 gap-5 sm:grid-cols-2"
      >
        <Input
          label="Project name"
          value={values.name}
          onChange={set('name')}
          error={errors.name}
          maxLength={120}
          fieldClassName="sm:col-span-2"
          data-autofocus
        />
        <Select
          label="Currency"
          value={values.currency}
          onChange={set('currency')}
          options={currencyOptions}
          error={errors.currency}
        />
        <Input
          label="Status date"
          type="date"
          value={values.statusDate}
          onChange={set('statusDate')}
          error={errors.statusDate}
        />
        <Input
          label="Start date"
          type="date"
          value={values.startDate}
          onChange={set('startDate')}
          error={errors.startDate}
        />
        <Input
          label="End date"
          type="date"
          value={values.endDate}
          onChange={set('endDate')}
          error={errors.endDate}
        />
        {formError && <p className="text-control text-error-strong sm:col-span-2">{formError}</p>}
      </form>
    </Modal>
  );
}
