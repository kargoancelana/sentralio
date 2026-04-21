import type { ReactNode } from 'react';
import './DataTable.css';

export interface Column<T> {
  key: string;
  label: string;
  render?: (item: T) => ReactNode;
  headerRender?: () => ReactNode;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  toolbar?: ReactNode;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
  rowClassName?: (item: T) => string;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  toolbar,
  emptyMessage = 'No data available',
  onRowClick,
  rowClassName,
}: DataTableProps<T>) {
  return (
    <div className="data-table-wrapper">
      {toolbar && <div className="data-table-toolbar">{toolbar}</div>}
      <div className="data-table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.key} style={col.width ? { width: col.width } : undefined}>
                  {col.headerRender ? col.headerRender() : col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="data-table-empty">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((item, idx) => (
                <tr
                  key={item.id ?? idx}
                  className={rowClassName?.(item) || ''}
                  onClick={() => onRowClick?.(item)}
                  style={onRowClick ? { cursor: 'pointer' } : undefined}
                >
                  {columns.map(col => (
                    <td key={col.key}>
                      {col.render ? col.render(item) : String(item[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
