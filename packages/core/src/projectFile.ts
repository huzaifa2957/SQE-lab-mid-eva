// Project documents and the .evm.json file format (FR-08).

import { z } from 'zod';
import { type StoredSummary, StoredSummarySchema } from './aiSummary';
import { sanitizeFileName } from './format';
import type { EacMethod, Project, StatusSnapshot, Task } from './types';
import {
  type FileMeta,
  type ProjectInput,
  VALIDATION_LIMITS,
  type ValidationIssue,
  type ValidationResult,
  validateFullProject,
  validateSnapshots,
  validateTasks,
} from './validation';

export const PROJECT_FILE_FORMAT = 'evm-cost-tracker';
export const PROJECT_FILE_VERSION = 1;
export const PROJECT_FILE_EXTENSION = '.evm.json';

/** Everything saved for one project: in IndexedDB and in .evm.json files. */
export interface ProjectDocument {
  format: typeof PROJECT_FILE_FORMAT;
  version: typeof PROJECT_FILE_VERSION;
  project: Project;
  tasks: Task[];
  snapshots: StatusSnapshot[];
  eacMethod: EacMethod;
  /** Last AI or offline summary (FR-35), kept for the report. */
  aiSummary?: StoredSummary;
}

export function createProjectDocument(
  input: ProjectInput,
  options: { id: string; now: string },
): ProjectDocument {
  return {
    format: PROJECT_FILE_FORMAT,
    version: PROJECT_FILE_VERSION,
    project: { ...input, id: options.id, createdAt: options.now, updatedAt: options.now },
    tasks: [],
    snapshots: [],
    eacMethod: 'typical',
  };
}

export function serializeProjectFile(document: ProjectDocument): string {
  const { format, version, project, tasks, snapshots, eacMethod, aiSummary } = document;
  const file = { format, version, project, tasks, snapshots, eacMethod, aiSummary };
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** "Clinic: Phase 2" → "Clinic_Phase_2.evm.json" */
export function projectFileName(projectName: string): string {
  return `${sanitizeFileName(projectName, 'project')}${PROJECT_FILE_EXTENSION}`;
}

const fileIssue = (message: string): ValidationIssue => ({
  ruleId: 'FR-08',
  severity: 'error',
  message,
  detail: message,
});

/** Extension and size checks before reading a project file. */
export function validateProjectFileMeta(file: FileMeta): ValidationResult {
  const errors: ValidationIssue[] = [];
  if (!file.name.toLowerCase().endsWith('.json')) {
    errors.push(fileIssue(`File "${file.name}" is not a project file. Choose a .evm.json file.`));
  }
  if (file.size === 0) errors.push(fileIssue(`File "${file.name}" is empty.`));
  else if (file.size > VALIDATION_LIMITS.maxFileBytes) {
    errors.push(fileIssue(`File "${file.name}" is larger than 5 MB.`));
  }
  return { valid: errors.length === 0, errors, warnings: [] };
}

const EnvelopeSchema = z.object({
  project: z.unknown(),
  tasks: z.array(z.unknown()),
  snapshots: z.array(z.unknown()),
  eacMethod: z.enum(['typical', 'atypical', 'combined']).default('typical'),
  aiSummary: z.unknown().optional(),
});

function prefixed(prefix: string, issues: ValidationIssue[]): ValidationIssue[] {
  return issues.map((issue) => ({ ...issue, message: `${prefix}: ${issue.message}` }));
}

/**
 * Parses and validates a project file (JSON text or an already-parsed value) using the
 * core schemas. Nothing is accepted unless every project, task and snapshot field is valid.
 * A project with no tasks is allowed (VR-13 becomes a warning here).
 */
export function parseProjectFile(
  input: unknown,
): ValidationResult & { document: ProjectDocument | null } {
  const fail = (message: string) => ({
    valid: false,
    errors: [fileIssue(message)],
    warnings: [],
    document: null,
  });

  let data: unknown = input;
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input);
    } catch {
      return fail('The file is not valid JSON, so it cannot be opened as a project file.');
    }
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return fail('This file is not an EVM Cost Tracker project file.');
  }
  const record = data as Record<string, unknown>;
  if (record.format !== PROJECT_FILE_FORMAT) {
    return fail('This file is not an EVM Cost Tracker project file.');
  }
  if (record.version !== PROJECT_FILE_VERSION) {
    return fail(
      `Project file version ${String(record.version)} is not supported (expected version ${PROJECT_FILE_VERSION}).`,
    );
  }
  const envelope = EnvelopeSchema.safeParse(record);
  if (!envelope.success) {
    return fail('The project file is damaged: tasks and snapshots must be lists.');
  }

  const project = validateFullProject(envelope.data.project);
  const tasks = validateTasks(envelope.data.tasks, { project: project.project ?? undefined });
  const snapshots = validateSnapshots(envelope.data.snapshots);

  // A damaged summary is dropped with a warning; it never blocks opening the project.
  const summary =
    envelope.data.aiSummary === undefined
      ? null
      : StoredSummarySchema.safeParse(envelope.data.aiSummary);

  const isBac = (issue: ValidationIssue) => issue.ruleId === 'VR-13';
  const errors = [
    ...prefixed('Project', project.errors),
    ...prefixed(
      'Tasks',
      tasks.errors.filter((i) => !isBac(i)),
    ),
    ...prefixed('Snapshots', snapshots.errors),
  ];
  const warnings = [
    ...prefixed('Project', project.warnings),
    ...prefixed(
      'Tasks',
      [...tasks.errors.filter(isBac), ...tasks.warnings].map((i) => ({
        ...i,
        severity: 'warning' as const,
      })),
    ),
    ...prefixed('Snapshots', snapshots.warnings),
    ...(summary && !summary.success
      ? [
          {
            ...fileIssue('The saved AI summary was damaged and has been removed.'),
            ruleId: 'FR-35',
            severity: 'warning' as const,
          },
        ]
      : []),
  ];

  const valid = errors.length === 0 && project.project !== null;
  return {
    valid,
    errors,
    warnings,
    document: valid
      ? {
          format: PROJECT_FILE_FORMAT,
          version: PROJECT_FILE_VERSION,
          project: project.project!,
          tasks: tasks.tasks,
          snapshots: snapshots.snapshots,
          eacMethod: envelope.data.eacMethod,
          ...(summary?.success && { aiSummary: summary.data }),
        }
      : null,
  };
}
