// FR-09: the built-in demo project, read from the files in samples/ so there is one source.

import {
  createProjectDocument,
  importPeriodsCsv,
  importTasksCsv,
  parseCsv,
  parseProjectSheet,
  type ProjectDocument,
} from '@evm/core';
import periodsCsv from '../../../../samples/sample_periods.csv?raw';
import infoCsv from '../../../../samples/sample_project_info.csv?raw';
import tasksCsv from '../../../../samples/sample_project.csv?raw';

export function buildSampleDocument(id: string, now: string): ProjectDocument {
  const info = parseProjectSheet(parseCsv(infoCsv).sheet);
  if (!info.project) throw new Error('The built-in sample project information is invalid.');
  const tasks = importTasksCsv(tasksCsv, { project: info.project });
  const periods = importPeriodsCsv(periodsCsv);
  if (!tasks.valid || !periods.valid) throw new Error('The built-in sample data is invalid.');
  return {
    ...createProjectDocument(info.project, { id, now }),
    tasks: tasks.tasks,
    snapshots: periods.snapshots,
  };
}
