// Core helpers added for the Phase 3 UI: snapshots, project files, project sheets,
// variance status and file names.

import { describe, expect, it } from 'vitest';
import {
  classifyVariance,
  createProjectDocument,
  createSnapshot,
  findSnapshot,
  importTasksCsv,
  parseProjectFile,
  parseProjectSheet,
  projectFileName,
  sanitizeFileName,
  serializeProjectFile,
  upsertSnapshot,
  validateFullProject,
  validateProjectFileMeta,
} from '../src';
import { workedProject, workedTasks } from './fixtures/worked-example';

const document = () => ({
  ...createProjectDocument(
    {
      name: workedProject.name,
      currency: workedProject.currency,
      startDate: workedProject.startDate,
      endDate: workedProject.endDate,
      statusDate: workedProject.statusDate,
    },
    { id: 'p1', now: '2026-03-11T00:00:00.000Z' },
  ),
  tasks: workedTasks,
});

describe('snapshots (FR-07)', () => {
  it('UT-SNAP-01 createSnapshot captures cumulative PV/EV/AC and task states', () => {
    const snapshot = createSnapshot(workedTasks, '2026-03-11');
    expect(snapshot).toMatchObject({ date: '2026-03-11', pv: 40_000, ev: 32_000, ac: 40_000 });
    expect(snapshot!.taskStates).toHaveLength(5);
    expect(snapshot!.taskStates![0]).toEqual({
      taskId: 'T1',
      percentComplete: 100,
      actualCost: 12_000,
    });
  });

  it('UT-SNAP-02 createSnapshot returns null for an invalid date or uncomputable PV', () => {
    expect(createSnapshot(workedTasks, 'not-a-date')).toBeNull();
    expect(createSnapshot([{ ...workedTasks[0]!, plannedStart: 'bad' }], '2026-03-11')).toBeNull();
    expect(createSnapshot([], '2026-03-11')).toMatchObject({ pv: 0, ev: 0, ac: 0, taskStates: [] });
  });

  it('UT-SNAP-03 upsertSnapshot replaces the same date and keeps date order', () => {
    const a = { date: '2026-02-01', pv: 1, ev: 1, ac: 1 };
    const b = { date: '2026-01-01', pv: 2, ev: 2, ac: 2 };
    const a2 = { ...a, ac: 9 };
    const list = upsertSnapshot(upsertSnapshot([], a), b);
    expect(list.map((s) => s.date)).toEqual(['2026-01-01', '2026-02-01']);
    const replaced = upsertSnapshot(list, a2);
    expect(replaced).toHaveLength(2);
    expect(findSnapshot(replaced, '2026-02-01')!.ac).toBe(9);
    expect(findSnapshot(replaced, '2026-03-01')).toBeUndefined();
  });
});

describe('project files (FR-08)', () => {
  it('UT-PF-01 a document survives serialise → parse unchanged', () => {
    const doc = { ...document(), snapshots: [createSnapshot(workedTasks, '2026-03-11')!] };
    const parsed = parseProjectFile(serializeProjectFile(doc));
    expect(parsed.valid).toBe(true);
    expect(parsed.errors).toEqual([]);
    expect(parsed.document).toEqual(doc);
  });

  it('UT-PF-02 rejects non-JSON, wrong format, wrong version and damaged envelopes', () => {
    expect(parseProjectFile('{ not json').errors[0]!.message).toBe(
      'The file is not valid JSON, so it cannot be opened as a project file.',
    );
    expect(parseProjectFile('[]').errors[0]!.message).toBe(
      'This file is not an EVM Cost Tracker project file.',
    );
    expect(parseProjectFile({ format: 'other' }).valid).toBe(false);
    expect(parseProjectFile({ format: 'evm-cost-tracker', version: 2 }).errors[0]!.message).toBe(
      'Project file version 2 is not supported (expected version 1).',
    );
    expect(
      parseProjectFile({
        format: 'evm-cost-tracker',
        version: 1,
        project: {},
        tasks: 'x',
        snapshots: [],
      }).errors[0]!.message,
    ).toBe('The project file is damaged: tasks and snapshots must be lists.');
  });

  it('UT-PF-03 reports invalid project, task and snapshot fields with a section prefix', () => {
    const doc = document();
    const bad = {
      ...doc,
      project: { ...doc.project, endDate: '2025-01-01' },
      tasks: [{ ...workedTasks[0]!, percentComplete: 150 }],
      snapshots: [{ date: 'x', pv: 0, ev: 0, ac: 0 }],
    };
    const result = parseProjectFile(bad);
    expect(result.valid).toBe(false);
    expect(result.document).toBeNull();
    expect(result.errors.map((e) => [e.ruleId, e.message])).toEqual([
      ['VR-09', "Project: 'End Date': value 2025-01-01 must be after the start date (2026-01-01)"],
      ['VR-07', "Tasks: Row 1, '% Complete': value 150 must be between 0 and 100"],
      ['VR-08', 'Snapshots: Row 1, \'Date\': value "x" is not a valid date (use YYYY-MM-DD)'],
    ]);
  });

  it('UT-PF-04 a project with no tasks loads with a VR-13 warning', () => {
    const result = parseProjectFile(serializeProjectFile({ ...document(), tasks: [] }));
    expect(result.valid).toBe(true);
    expect(result.warnings.map((w) => [w.ruleId, w.severity])).toEqual([['VR-13', 'warning']]);
  });

  it('UT-PF-05 file name and file checks', () => {
    expect(projectFileName('Clinic: Phase 2 / Block-A')).toBe('Clinic_Phase_2_Block_A.evm.json');
    expect(projectFileName('???')).toBe('project.evm.json');
    expect(validateProjectFileMeta({ name: 'x.evm.json', size: 10 }).valid).toBe(true);
    expect(validateProjectFileMeta({ name: 'x.csv', size: 10 }).valid).toBe(false);
    expect(validateProjectFileMeta({ name: 'x.json', size: 0 }).valid).toBe(false);
    expect(validateProjectFileMeta({ name: 'x.json', size: 6 * 1024 * 1024 }).valid).toBe(false);
  });

  it('UT-PF-06 validateFullProject requires id and timestamps', () => {
    const { project } = document();
    expect(validateFullProject(project).valid).toBe(true);
    const { id: _id, ...noId } = project;
    void _id;
    expect(validateFullProject(noId).errors[0]).toMatchObject({ ruleId: 'FR-08', column: 'id' });
  });
});

describe('Project sheet layouts', () => {
  it('UT-PS-01 header row + values row', () => {
    const result = parseProjectSheet({
      headers: ['Name', 'Currency', 'Start Date', 'End Date', 'Status Date'],
      rows: [[], ['Fit-out', 'usd', '2026-01-01', '2026-06-30', '2026-03-11']],
    });
    expect(result.project).toEqual({
      name: 'Fit-out',
      currency: 'USD',
      startDate: '2026-01-01',
      endDate: '2026-06-30',
      statusDate: '2026-03-11',
    });
  });

  it('UT-PS-02 label / value pairs, one per row', () => {
    const result = parseProjectSheet({
      headers: ['Name', 'Fit-out'],
      rows: [
        ['Currency', 'PKR'],
        ['Start Date', '01/01/2026'],
        ['End Date', 46203],
        ['', ''],
        ['Status Date', new Date(Date.UTC(2026, 2, 11))],
      ],
    });
    expect(result.valid).toBe(true);
    expect(result.project).toMatchObject({
      currency: 'PKR',
      endDate: '2026-06-30',
      statusDate: '2026-03-11',
    });
  });

  it('UT-PS-03 missing fields are reported', () => {
    expect(parseProjectSheet({ headers: ['Name', 'X'], rows: [] }).errors[0]).toMatchObject({
      ruleId: 'VR-03',
    });
  });
});

describe('small helpers', () => {
  it('UT-HLP-01 classifyVariance', () => {
    expect(classifyVariance(10)).toBe('favourable');
    expect(classifyVariance(0)).toBe('neutral');
    expect(classifyVariance(-0.01)).toBe('unfavourable');
    expect(classifyVariance(null)).toBeNull();
  });

  it('UT-HLP-02 sanitizeFileName', () => {
    expect(sanitizeFileName('Café Ünïcode  report')).toBe('Cafe_Unicode_report');
    expect(sanitizeFileName('../../etc/passwd')).toBe('etcpasswd');
    expect(sanitizeFileName('CON')).toBe('CON_file');
    expect(sanitizeFileName('   ', 'x')).toBe('x');
    expect(sanitizeFileName('a'.repeat(100))).toHaveLength(80);
  });

  it('UT-HLP-04 every problem in a row is reported at once (parse, duplicate and range errors)', () => {
    const result = importTasksCsv(
      [
        'Task ID,Task Name,Budget,Planned Start,Planned Finish,% Complete,Actual Cost',
        '1,A,100,2026-01-01,2026-01-02,0,0',
        '1,B,abc,2026-01-01,2026-01-02,120,0',
      ].join('\n'),
    );
    expect(result.errors.map((e) => [e.ruleId, e.row, e.column])).toEqual([
      ['VR-06', 3, 'Budget'],
      ['VR-04', 3, 'Task ID'],
      ['VR-07', 3, '% Complete'],
    ]);
    expect(result.tasks.map((t) => t.name)).toEqual(['A']);
  });

  it('UT-HLP-03 issues carry a detail without the location prefix', () => {
    const result = importTasksCsv(
      'Task ID,Task Name,Budget,Planned Start,Planned Finish,% Complete,Actual Cost\n1,A,abc,2026-01-01,2026-01-02,0,0',
    );
    expect(result.errors[0]).toMatchObject({
      message: `Row 2, 'Budget': value "abc" is not a valid number`,
      detail: 'value "abc" is not a valid number',
    });
  });
});
