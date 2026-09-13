import { useState } from 'react';

type Column = { key: string; label: string; type?: 'text' | 'number' };
type Row = { id: string; values: Record<string, string> };

function readRows(value: string, columns: Column[]): Row[] {
  if (!value) return [{ id: crypto.randomUUID(), values: {} }];
  try {
    const parsed = JSON.parse(value) as Record<string, string>[];
    if (Array.isArray(parsed)) return parsed.map(values => ({ id: crypto.randomUUID(), values }));
  } catch {
    // Older drafts stored free text, so show it in the first column instead of losing it.
  }
  return [{ id: crypto.randomUUID(), values: { [columns[0].key]: value } }];
}

export function RequirementGrid({ label, columns, value, onChange, required, error }: {
  label: string; columns: Column[]; value: string; onChange: (value: string) => void; required?: boolean; error?: string;
}) {
  const [rows, setRows] = useState(() => readRows(value, columns));
  const publish = (next: Row[]) => {
    setRows(next);
    const values = next.map(row => row.values).filter(row => Object.values(row).some(cell => cell.trim()));
    onChange(values.length ? JSON.stringify(values) : '');
  };
  const update = (rowId: string, key: string, cell: string) => publish(rows.map(row => row.id === rowId ? { ...row, values: { ...row.values, [key]: cell } } : row));
  const add = () => publish([...rows, { id: crypto.randomUUID(), values: {} }]);
  const remove = (rowId: string) => publish(rows.length === 1 ? [{ id: crypto.randomUUID(), values: {} }] : rows.filter(row => row.id !== rowId));

  return <div className="mb-5">
    <div className="mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
      {label}{required && <span aria-hidden="true" className="text-danger-600 dark:text-danger-400"> *</span>}
    </div>
    <div className="overflow-x-auto rounded-lg border border-gray-300 dark:border-gray-600">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="bg-gray-50 text-gray-600 dark:bg-gray-900/50 dark:text-gray-300"><tr>
          {columns.map(column => <th key={column.key} className="px-3 py-2 font-medium">{column.label}</th>)}
          <th className="w-24 px-3 py-2 font-medium">Action</th>
        </tr></thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {rows.map((row, index) => <tr key={row.id}>
            {columns.map(column => <td key={column.key} className="p-2"><input
              aria-label={`${label} ${column.label} row ${index + 1}`}
              type={column.type ?? 'text'} min={column.type === 'number' ? 1 : undefined}
              required={required && index === 0 && column.key === columns[0].key}
              value={row.values[column.key] ?? ''} onChange={event => update(row.id, column.key, event.target.value)}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 dark:border-gray-600 dark:bg-gray-800"
              aria-invalid={!!error}
            /></td>)}
            <td className="p-2"><button type="button" onClick={() => remove(row.id)} className="text-sm text-danger-600 hover:underline">Remove</button></td>
          </tr>)}
        </tbody>
      </table>
    </div>
    {error && <p className="mt-1 text-xs text-danger-600 dark:text-danger-400" role="alert">{error}</p>}
    <button type="button" onClick={add} className="mt-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800">Add row</button>
  </div>;
}
