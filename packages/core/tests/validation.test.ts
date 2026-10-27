import { describe, expect, it } from 'vitest';
import {
  importPeriodsCsv,
  importTasksCsv,
  parseCsv,
  parseProjectRecord,
  type Task,
  type ValidationIssue,
  validateFileMeta,
  validateProject,
  validateSnapshots,
  validateTask,
  validateTaskRows,
  validateTasks,
} from '../src';

const BELL = String.fromCharCode(0x07);

const HEADER =
  'Task ID,Task Name,Category,Budget,Planned Start,Planned Finish,% Complete,Actual Cost';
type Row = {
  id: string;
  name: string;
  category: string;
  budget: string;
  start: string;
  finish: string;
  pct: string;
  ac: string;
};
const BASE: Row = {
  id: '1.1',
  name: 'Design',
  category: 'Labour',
  budget: '1000',
  start: '2026-01-05',
  finish: '2026-01-20',
  pct: '50',
  ac: '400',
};
const quote = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const line = (r: Partial<Row>) => {
  const v = { ...BASE, ...r };
  return [v.id, v.name, v.category, v.budget, v.start, v.finish, v.pct, v.ac].map(quote).join(',');
};
const csv = (...rows: Partial<Row>[]) => [HEADER, ...rows.map(line)].join('\n');

const byRule = (
  result: { errors: ValidationIssue[]; warnings: ValidationIssue[] },
  ruleId: string,
) => [...result.errors, ...result.warnings].filter((i) => i.ruleId === ruleId);
const messages = (issues: ValidationIssue[]) => issues.map((i) => i.message);

const validTask: Task = {
  id: '1.1',
  name: 'Design',
  category: 'Labour',
  budget: 1000,
  plannedStart: '2026-01-05',
  plannedFinish: '2026-01-20',
  percentComplete: 50,
  actualCost: 400,
};

describe('VR-01 file type', () => {
  it('UT-VR-01-P accepts .csv and .xlsx with matching or empty MIME types', () => {
    expect(validateFileMeta({ name: 'tasks.csv', size: 100, type: 'text/csv' }).valid).toBe(true);
    expect(
      validateFileMeta({ name: 'TASKS.CSV', size: 100, type: 'application/vnd.ms-excel' }).valid,
    ).toBe(true);
    expect(validateFileMeta({ name: 'tasks.csv', size: 100, type: '' }).valid).toBe(true);
    expect(
      validateFileMeta({
        name: 'project.xlsx',
        size: 100,
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }).valid,
    ).toBe(true);
  });

  it('UT-VR-01-F rejects other extensions, mismatched MIME types and malformed CSV', () => {
    const txt = validateFileMeta({ name: 'tasks.txt', size: 100, type: 'text/plain' });
    expect(txt.valid).toBe(false);
    expect(txt.errors[0]).toMatchObject({ ruleId: 'VR-01' });
    expect(txt.errors[0]!.message).toBe(
      'File "tasks.txt" is not supported. Upload a .csv or .xlsx file.',
    );
    expect(validateFileMeta({ name: 'noextension', size: 100 }).valid).toBe(false);
    expect(validateFileMeta({ name: 'tasks.xls', size: 100 }).valid).toBe(false);

    const disguised = validateFileMeta({ name: 'photo.csv', size: 100, type: 'image/png' });
    expect(disguised.errors[0]!.message).toBe(
      'File "photo.csv" reports type "image/png", which does not match a .csv file.',
    );

    const broken = parseCsv(`${HEADER}\n1.1,"Design,Labour,1000`);
    expect(broken.errors[0]).toMatchObject({ ruleId: 'VR-01', severity: 'error' });
    expect(importTasksCsv(`${HEADER}\n1.1,"Design,Labour,1000`).valid).toBe(false);
  });
});

describe('VR-02 size and row limits', () => {
  it('UT-VR-02-P accepts exactly 5 MB and exactly 5,000 rows', () => {
    expect(validateFileMeta({ name: 'a.csv', size: 5 * 1024 * 1024 }).valid).toBe(true);
    const rows = Array.from({ length: 5000 }, (_, i) => ({ id: `T${i}` }));
    const result = importTasksCsv(csv(...rows));
    expect(result.valid).toBe(true);
    expect(result.tasks).toHaveLength(5000);
  });

  it('UT-VR-02-F rejects files over 5 MB and more than 5,000 rows', () => {
    const big = validateFileMeta({ name: 'a.csv', size: 5 * 1024 * 1024 + 1 });
    expect(big.errors[0]).toMatchObject({
      ruleId: 'VR-02',
      message: 'File "a.csv" is 5.0 MB; the maximum is 5 MB.',
    });
    const rows = Array.from({ length: 5001 }, (_, i) => ({ id: `T${i}` }));
    const result = importTasksCsv(csv(...rows));
    expect(result.valid).toBe(false);
    expect(messages(byRule(result, 'VR-02'))).toEqual([
      'The file has 5,001 data rows; the maximum is 5,000.',
    ]);
    expect(result.tasks).toEqual([]);
  });
});

describe('VR-03 required columns', () => {
  it('UT-VR-03-P accepts all required columns in any order and spelling; Category is optional', () => {
    const text = [
      'actual_cost,PERCENT COMPLETE,planned-finish,Planned Start,budget,task name,TASK_ID',
      '400,50,2026-01-20,2026-01-05,1000,Design,1.1',
    ].join('\n');
    const result = importTasksCsv(text);
    expect(result.valid).toBe(true);
    expect(result.tasks[0]).toEqual({ ...validTask, category: 'Other' });
  });

  it('UT-VR-03-F reports each missing column; duplicate columns are a warning', () => {
    const result = importTasksCsv('Task ID,Task Name,Budget\n1.1,Design,1000');
    expect(result.valid).toBe(false);
    expect(messages(byRule(result, 'VR-03'))).toEqual([
      "Missing required column 'Planned Start'.",
      "Missing required column 'Planned Finish'.",
      "Missing required column '% Complete'.",
      "Missing required column 'Actual Cost'.",
    ]);

    const dup = importTasksCsv(`${HEADER},Budget\n${line({})},999`);
    expect(dup.valid).toBe(true);
    expect(dup.warnings[0]).toMatchObject({ ruleId: 'VR-03', severity: 'warning' });
    expect(dup.tasks[0]!.budget).toBe(1000); // first column wins
  });
});

describe('VR-04 Task ID', () => {
  it('UT-VR-04-P accepts unique IDs up to 20 characters', () => {
    const result = importTasksCsv(csv({ id: '1.1' }, { id: 'A'.repeat(20) }));
    expect(result.valid).toBe(true);
    expect(result.tasks.map((t) => t.id)).toEqual(['1.1', 'A'.repeat(20)]);
  });

  it('UT-VR-04-F rejects empty, too-long and duplicate IDs', () => {
    const result = importTasksCsv(
      csv({ id: '' }, { id: 'A'.repeat(21) }, { id: '2' }, { id: '2' }),
    );
    expect(messages(byRule(result, 'VR-04'))).toEqual([
      "Row 2, 'Task ID': a value is required",
      `Row 3, 'Task ID': value "${'A'.repeat(21)}" must be at most 20 characters`,
      `Row 5, 'Task ID': value "2" is already used in row 4; Task IDs must be unique`,
    ]);
    expect(result.tasks.map((t) => t.id)).toEqual(['2']);
  });
});

describe('VR-05 Task Name', () => {
  it('UT-VR-05-P accepts 1–100 characters and trims whitespace', () => {
    const result = importTasksCsv(csv({ name: '  Design  ' }, { id: '2', name: 'N'.repeat(100) }));
    expect(result.valid).toBe(true);
    expect(result.tasks[0]!.name).toBe('Design');
  });

  it('UT-VR-05-F rejects empty and over-long names', () => {
    const result = importTasksCsv(csv({ name: '   ' }, { id: '2', name: 'N'.repeat(101) }));
    const issues = byRule(result, 'VR-05');
    expect(issues.map((i) => i.row)).toEqual([2, 3]);
    expect(issues[0]!.message).toBe("Row 2, 'Task Name': a value is required");
    expect(issues[1]!.message).toMatch(
      /^Row 3, 'Task Name': value ".*" must be at most 100 characters$/,
    );
  });
});

describe('VR-06 Budget and Actual Cost', () => {
  it('UT-VR-06-P accepts "1,200", "Rs 1200", "$1,200.50", 0 and 1e12', () => {
    const result = importTasksCsv(
      csv(
        { budget: '1,200', ac: 'Rs 1200' },
        { id: '2', budget: '$1,200.50', ac: '0' },
        { id: '3', budget: '1000000000000', ac: 'PKR 5,000' },
      ),
    );
    expect(result.valid).toBe(true);
    expect(result.tasks.map((t) => [t.budget, t.actualCost])).toEqual([
      [1200, 1200],
      [1200.5, 0],
      [1e12, 5000],
    ]);
  });

  it('UT-VR-06-F rejects text, negatives and values above 1e12 with row/column messages', () => {
    const result = importTasksCsv(
      csv(
        { budget: 'abc' },
        { id: '2', ac: '-500' },
        { id: '3', budget: '1000000000001' },
        { id: '4', ac: '' },
      ),
    );
    expect(messages(byRule(result, 'VR-06'))).toEqual([
      `Row 2, 'Budget': value "abc" is not a valid number`,
      "Row 3, 'Actual Cost': value -500 must be between 0 and 1,000,000,000,000",
      "Row 4, 'Budget': value 1000000000001 must be between 0 and 1,000,000,000,000",
      "Row 5, 'Actual Cost': a value is required",
    ]);
    expect(result.tasks).toEqual([]);
  });
});

describe('VR-07 % Complete', () => {
  it('UT-VR-07-P accepts 0–100, "45%", and converts fractions when confirmed', () => {
    const result = importTasksCsv(
      csv({ pct: '0' }, { id: '2', pct: '100' }, { id: '3', pct: '45%' }),
    );
    expect(result.valid).toBe(true);
    expect(result.tasks.map((t) => t.percentComplete)).toEqual([0, 100, 45]);
    expect(result.percentFractionSuspected).toBe(false);

    const fractions = csv({ pct: '0.45' }, { id: '2', pct: '1' }, { id: '3', pct: '0.07' });
    const asked = importTasksCsv(fractions);
    expect(asked.percentFractionSuspected).toBe(true);
    expect(byRule(asked, 'VR-07')[0]).toMatchObject({ severity: 'warning', column: '% Complete' });
    expect(asked.tasks.map((t) => t.percentComplete)).toEqual([0.45, 1, 0.07]); // read as-is until confirmed

    const confirmed = importTasksCsv(fractions, { percentAsFraction: true });
    expect(confirmed.tasks.map((t) => t.percentComplete)).toEqual([45, 100, 7]);
    expect(byRule(confirmed, 'VR-07')).toEqual([]);

    const declined = importTasksCsv(fractions, { percentAsFraction: false });
    expect(declined.tasks.map((t) => t.percentComplete)).toEqual([0.45, 1, 0.07]);
    expect(byRule(declined, 'VR-07')).toEqual([]);
  });

  it('UT-VR-07-F rejects values outside 0–100 and non-numbers', () => {
    const result = importTasksCsv(
      csv({ pct: '120' }, { id: '2', pct: '-5%' }, { id: '3', pct: 'half' }),
    );
    expect(messages(byRule(result, 'VR-07'))).toEqual([
      "Row 2, '% Complete': value 120 must be between 0 and 100",
      "Row 3, '% Complete': value -5% must be between 0 and 100",
      `Row 4, '% Complete': value "half" is not a valid number`,
    ]);
  });
});

describe('VR-08 dates', () => {
  it('UT-VR-08-P accepts YYYY-MM-DD, DD/MM/YYYY, Excel serials; finish may equal start', () => {
    const result = importTasksCsv(
      csv(
        { start: '2026-01-05', finish: '20/01/2026' },
        { id: '2', start: '46092', finish: '46092' },
      ),
    );
    expect(result.valid).toBe(true);
    expect(result.tasks.map((t) => [t.plannedStart, t.plannedFinish])).toEqual([
      ['2026-01-05', '2026-01-20'],
      ['2026-03-11', '2026-03-11'],
    ]);
  });

  it('UT-VR-08-F rejects invalid dates and finish before start', () => {
    const result = importTasksCsv(
      csv(
        { start: '2026-02-30' },
        { id: '2', finish: 'soon' },
        { id: '3', start: '2026-03-10', finish: '2026-03-01' },
      ),
    );
    expect(messages(byRule(result, 'VR-08'))).toEqual([
      `Row 2, 'Planned Start': value 2026-02-30 is not a valid date (use YYYY-MM-DD or DD/MM/YYYY)`,
      `Row 3, 'Planned Finish': value "soon" is not a valid date (use YYYY-MM-DD or DD/MM/YYYY)`,
      "Row 4, 'Planned Finish': value 2026-03-01 must be on or after the planned start (2026-03-10)",
    ]);
  });
});

describe('VR-09 project dates', () => {
  const project = {
    name: 'Fit-out',
    currency: 'USD',
    startDate: '2026-01-01',
    endDate: '2026-06-30',
    statusDate: '2026-03-11',
  };

  it('UT-VR-09-P accepts end after start and status date on/after start', () => {
    expect(validateProject(project).valid).toBe(true);
    expect(validateProject({ ...project, statusDate: '2026-01-01' }).valid).toBe(true);
    expect(validateProject(project).project).toEqual(project);
  });

  it('UT-VR-09-F rejects end ≤ start and status date before start', () => {
    const sameDay = validateProject({ ...project, endDate: '2026-01-01' });
    expect(sameDay.errors).toEqual([
      expect.objectContaining({
        ruleId: 'VR-09',
        column: 'End Date',
        message: "'End Date': value 2026-01-01 must be after the start date (2026-01-01)",
      }),
    ]);
    const early = validateProject({ ...project, statusDate: '2025-12-31' });
    expect(early.errors[0]).toMatchObject({ ruleId: 'VR-09', column: 'Status Date' });
    expect(early.project).toBeNull();
  });

  it('UT-VR-09-F2 reports other project field errors', () => {
    const bad = validateProject({
      name: '',
      currency: 'usd',
      startDate: 'x',
      endDate: '2026-01-01',
      statusDate: '2026-01-01',
    });
    expect(bad.errors.map((e) => [e.ruleId, e.column])).toEqual([
      ['FR-01', 'Name'],
      ['FR-01', 'Currency'],
      ['VR-08', 'Start Date'],
    ]);
    expect(validateProject(null).valid).toBe(false);
  });
});

describe('VR-10 task dates outside project dates', () => {
  const projectDates = { startDate: '2026-01-01', endDate: '2026-01-31' };

  it('UT-VR-10-P no warning when task dates are inside the project', () => {
    const result = importTasksCsv(csv({}), { project: projectDates });
    expect(byRule(result, 'VR-10')).toEqual([]);
  });

  it('UT-VR-10-F warns (but allows) when task dates fall outside the project', () => {
    const result = importTasksCsv(csv({ finish: '2026-02-15' }), { project: projectDates });
    expect(result.valid).toBe(true);
    expect(byRule(result, 'VR-10')).toEqual([
      expect.objectContaining({
        severity: 'warning',
        row: 2,
        message:
          'Row 2: planned dates 2026-01-05 → 2026-02-15 fall outside the project dates (2026-01-01 → 2026-01-31)',
      }),
    ]);
  });
});

describe('VR-11 zero budget', () => {
  it('UT-VR-11-P no warning when budget > 0', () => {
    expect(byRule(importTasksCsv(csv({})), 'VR-11')).toEqual([]);
  });

  it('UT-VR-11-F warns when a task budget is 0', () => {
    const result = importTasksCsv(csv({ budget: '0', ac: '0', pct: '0' }, { id: '2' }));
    expect(result.valid).toBe(true);
    expect(messages(byRule(result, 'VR-11'))).toEqual([
      "Row 2, 'Budget': budget is 0, so this task adds no planned or earned value",
    ]);
  });
});

describe('VR-12 actual cost with 0% complete', () => {
  it('UT-VR-12-P no warning when progress is reported or nothing is spent', () => {
    expect(
      byRule(
        importTasksCsv(csv({ pct: '10', ac: '500' }, { id: '2', pct: '0', ac: '0' })),
        'VR-12',
      ),
    ).toEqual([]);
  });

  it('UT-VR-12-F warns when money is spent at 0% complete', () => {
    const result = importTasksCsv(csv({ pct: '0', ac: '5000' }));
    expect(result.valid).toBe(true);
    expect(messages(byRule(result, 'VR-12'))).toEqual([
      "Row 2, 'Actual Cost': actual cost 5,000.00 has been spent but '% Complete' is 0",
    ]);
  });
});

describe('VR-13 total BAC > 0', () => {
  it('UT-VR-13-P passes when at least one budget is above 0', () => {
    expect(
      importTasksCsv(csv({ budget: '0', pct: '0', ac: '0' }, { id: '2', budget: '1' })).valid,
    ).toBe(true);
    expect(validateTasks([validTask]).valid).toBe(true);
  });

  it('UT-VR-13-F blocks when every budget is 0 (or there are no tasks)', () => {
    const result = importTasksCsv(
      csv({ budget: '0', pct: '0', ac: '0' }, { id: '2', budget: '0', pct: '0', ac: '0' }),
    );
    expect(result.valid).toBe(false);
    expect(messages(byRule(result, 'VR-13'))).toEqual([
      'Total budget (BAC) is 0. At least one task needs a budget above 0 to calculate EVM metrics.',
    ]);
    expect(byRule(validateTasks([]), 'VR-13')).toHaveLength(1);
  });
});

describe('VR-14 snapshot order', () => {
  const snap = (date: string, ev: number, ac: number) => ({ date, pv: ev, ev, ac });

  it('UT-VR-14-P no warnings for ascending dates and non-decreasing EV/AC', () => {
    const result = validateSnapshots([
      snap('2026-01-31', 10, 10),
      snap('2026-02-28', 20, 20),
      snap('2026-03-31', 20, 25),
    ]);
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.snapshots).toHaveLength(3);
  });

  it('UT-VR-14-F warns on duplicate/descending dates and decreasing EV or AC', () => {
    const result = validateSnapshots([
      snap('2026-02-28', 20, 20),
      snap('2026-02-28', 20, 20),
      snap('2026-01-31', 15, 25),
      snap('2026-03-31', 30, 22),
    ]);
    expect(result.valid).toBe(true); // warnings only
    expect(messages(result.warnings)).toEqual([
      'Row 2: snapshot date 2026-02-28 appears more than once',
      'Row 3: snapshot date 2026-01-31 is earlier than the previous snapshot (2026-02-28); dates should be in ascending order',
      'Row 3: cumulative EV fell from 20.00 to 15.00; cumulative values should never decrease',
      'Row 4: cumulative AC fell from 25.00 to 22.00; cumulative values should never decrease',
    ]);
  });

  it('UT-VR-14-F2 the Periods CSV gets the same checks with sheet row numbers', () => {
    const result = importPeriodsCsv('Date,PV,EV,AC\n2026-02-28,10,10,10\n2026-01-31,20,20,20');
    expect(result.warnings[0]).toMatchObject({ ruleId: 'VR-14', row: 3 });
  });

  it('UT-VR-14-F3 invalid snapshot values are errors', () => {
    const result = validateSnapshots([{ date: 'bad', pv: -1, ev: 0, ac: 0 }, 'not an object']);
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => [e.ruleId, e.column])).toEqual([
      ['VR-08', 'Date'],
      ['VR-06', 'PV'],
      ['VR-03', undefined],
    ]);
    expect(result.errors[2]!.message).toBe('Row 2: the entry is not a valid record');
  });
});

describe('VR-15 empty rows and empty files', () => {
  it('UT-VR-15-P skips blank rows silently and keeps sheet row numbers', () => {
    const text = [HEADER, line({}), '', ',,,,,,,', line({ id: '2', pct: '120' }), ''].join('\n');
    const result = importTasksCsv(text);
    expect(result.rowCount).toBe(2);
    expect(result.warnings).toEqual([]);
    expect(result.errors).toEqual([expect.objectContaining({ ruleId: 'VR-07', row: 5 })]);
    expect(result.tasks).toHaveLength(1);
  });

  it('UT-VR-15-F rejects an empty file and a header-only file', () => {
    expect(importTasksCsv('').errors).toEqual([
      expect.objectContaining({ ruleId: 'VR-15', message: 'The file is empty.' }),
    ]);
    expect(importTasksCsv('\n\n , \n').errors[0]).toMatchObject({ ruleId: 'VR-15' });
    expect(importTasksCsv(HEADER).errors).toEqual([
      expect.objectContaining({
        ruleId: 'VR-15',
        message: 'The file has a header row but no data rows.',
      }),
    ]);
    expect(validateFileMeta({ name: 'a.csv', size: 0 }).errors[0]).toMatchObject({
      ruleId: 'VR-15',
    });
    expect(importPeriodsCsv('Date,PV,EV,AC').valid).toBe(false);
  });
});

describe('VR-16 text sanitising', () => {
  it('UT-VR-16-P plain text passes unchanged with no warnings', () => {
    const result = importTasksCsv(csv({ name: 'Design & build <phase 1>' }));
    expect(result.warnings).toEqual([]);
    expect(result.tasks[0]!.name).toBe('Design & build <phase 1>');
  });

  it('UT-VR-16-F removes control characters and flags formula-like text, keeping it literal', () => {
    const result = importTasksCsv(
      csv({ name: `Des${BELL}ign` }, { id: '2', name: '=1+1' }, { id: '3', category: '@cmd' }),
    );
    expect(result.valid).toBe(true);
    expect(result.tasks.map((t) => [t.name, t.category])).toEqual([
      ['Design', 'Labour'],
      ['=1+1', 'Labour'],
      ['Design', '@cmd'],
    ]);
    expect(messages(byRule(result, 'VR-16'))).toEqual([
      "Row 2, 'Task Name': hidden control characters were removed",
      "Row 3, 'Task Name': text starts with a formula character (=, +, -, @) and will be stored as plain text, not run as a formula",
      "Row 4, 'Category': text starts with a formula character (=, +, -, @) and will be stored as plain text, not run as a formula",
    ]);
  });

  it('UT-VR-16-F2 categories are normalised and capped at 50 characters', () => {
    const result = importTasksCsv(
      csv({ category: 'labour' }, { id: '2', category: 'C'.repeat(60) }),
    );
    expect(result.tasks.map((t) => t.category)).toEqual(['Labour', 'C'.repeat(50)]);
  });
});

describe('object validators (forms, .evm.json)', () => {
  it('UT-VAL-01 validateTask accepts a valid task and reports field errors by label', () => {
    expect(validateTask(validTask)).toMatchObject({ valid: true, task: validTask });
    const bad = validateTask({
      ...validTask,
      budget: Number.NaN,
      percentComplete: 101,
      plannedStart: '05/01/2026',
    });
    expect(bad.task).toBeNull();
    expect(bad.errors.map((e) => [e.ruleId, e.message])).toEqual([
      ['VR-06', "'Budget': value NaN must be a number"],
      ['VR-08', "'Planned Start': value 05/01/2026 is not a valid date (use YYYY-MM-DD)"],
      ['VR-07', "'% Complete': value 101 must be between 0 and 100"],
    ]);
    expect(validateTask('nope').valid).toBe(false);
  });

  it('UT-VAL-02 validateTask applies VR-10/11/12 warnings', () => {
    const result = validateTask(
      { ...validTask, budget: 0, percentComplete: 0, actualCost: 10, plannedFinish: '2026-12-31' },
      { project: { startDate: '2026-01-01', endDate: '2026-06-30' } },
    );
    expect(result.valid).toBe(true);
    expect(result.warnings.map((w) => w.ruleId)).toEqual(['VR-10', 'VR-11', 'VR-12']);
  });

  it('UT-VAL-03 validateTasks finds duplicate IDs by list position', () => {
    const result = validateTasks([validTask, { ...validTask, name: 'Other' }]);
    expect(result.errors).toEqual([
      expect.objectContaining({
        ruleId: 'VR-04',
        row: 2,
        message: `Row 2, 'Task ID': value "1.1" is already used in row 1; Task IDs must be unique`,
      }),
    ]);
    expect(result.tasks).toHaveLength(1);
  });

  it('UT-VAL-04 validateTaskRows accepts Excel-style typed cells and a custom header row', () => {
    const result = validateTaskRows(
      {
        headers: [
          'Task ID',
          'Task Name',
          'Budget',
          'Planned Start',
          'Planned Finish',
          '% Complete',
          'Actual Cost',
        ],
        rows: [['1.1', 'Design', 1000, new Date(Date.UTC(2026, 0, 5)), 46042, 0.5, 400]],
      },
      { headerRowNumber: 3, percentAsFraction: true },
    );
    expect(result.valid).toBe(true);
    expect(result.tasks[0]).toEqual({ ...validTask, category: 'Other' });
  });

  it('UT-VAL-05 parseProjectRecord reads a Project sheet with tolerant labels and dates', () => {
    const ok = parseProjectRecord({
      'Project Name': 'Fit-out',
      currency: ' pkr ',
      start_date: '01/01/2026',
      'End Date': 46203,
      'Status Date': '2026-03-11',
    });
    expect(ok.valid).toBe(true);
    expect(ok.project).toEqual({
      name: 'Fit-out',
      currency: 'PKR',
      startDate: '2026-01-01',
      endDate: '2026-06-30',
      statusDate: '2026-03-11',
    });

    const missing = parseProjectRecord({ Name: 'X' });
    expect(missing.errors.map((e) => e.ruleId)).toEqual(['VR-03', 'VR-03', 'VR-03', 'VR-03']);

    const badDate = parseProjectRecord({
      Name: 'X',
      Currency: 'USD',
      'Start Date': 'soon',
      'End Date': '2026-01-01',
      'Status Date': '2026-01-01',
    });
    expect(badDate.errors[0]).toMatchObject({ ruleId: 'VR-08', column: 'Start Date' });

    const order = parseProjectRecord({
      Name: 'X',
      Currency: 'USD',
      'Start Date': '2026-02-01',
      'End Date': '2026-01-01',
      'Status Date': '2026-02-01',
    });
    expect(order.errors[0]).toMatchObject({ ruleId: 'VR-09', column: 'End Date' });
  });

  it('UT-VAL-06 validatePeriodRows reports bad cells with row and column', () => {
    const result = importPeriodsCsv('date,pv,ev,ac\n2026-01-31,100,abc,90\n2026-02-28,200,150,140');
    expect(result.errors).toEqual([
      expect.objectContaining({
        ruleId: 'VR-06',
        row: 2,
        message: `Row 2, 'ev': value "abc" is not a valid number`,
      }),
    ]);
    expect(result.snapshots).toEqual([{ date: '2026-02-28', pv: 200, ev: 150, ac: 140 }]);
    expect(importPeriodsCsv('Date,PV\n2026-01-31,1').errors.map((e) => e.ruleId)).toEqual([
      'VR-03',
      'VR-03',
    ]);
  });

  it('UT-VAL-07 validatePeriodRows rejects negative cumulative values', () => {
    const result = importPeriodsCsv('Date,PV,EV,AC\n2026-01-31,100,90,-5');
    expect(result.errors.map((e) => e.message)).toEqual([
      "Row 2, 'AC': value -5 must be between 0 and 1,000,000,000,000",
    ]);
    expect(result.snapshots).toEqual([]);
  });
});
