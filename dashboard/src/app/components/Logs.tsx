'use client';

interface Log {
  id: number;
  created_at: string;
  model: string;
  endpoint: string;
  status_code: number;
  duration: number;
  total_tokens: number;
}

interface LogsProps {
  logs: Log[];
}

export default function Logs({ logs }: LogsProps) {
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-[var(--foreground)]/5 text-[var(--muted-text)] text-xs uppercase tracking-wider">
            <th className="px-6 py-4 font-semibold">时间</th>
            <th className="px-6 py-4 font-semibold">模型</th>
            <th className="px-6 py-4 font-semibold">接口</th>
            <th className="px-6 py-4 font-semibold">状态</th>
            <th className="px-6 py-4 font-semibold">耗时</th>
            <th className="px-6 py-4 font-semibold text-right">Tokens</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--card-border)]">
          {logs.map(log => (
            <tr key={log.id} className="hover:bg-[var(--foreground)]/[0.02] transition-colors">
              <td className="px-6 py-4 text-xs text-[var(--muted-text)]">{new Date(log.created_at).toLocaleString()}</td>
              <td className="px-6 py-4 text-sm font-medium">{log.model}</td>
              <td className="px-6 py-4 text-sm text-blue-600 dark:text-blue-400 font-mono">{log.endpoint}</td>
              <td className="px-6 py-4">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${log.status_code < 400 ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'}`}>
                  {log.status_code}
                </span>
              </td>
              <td className="px-6 py-4 text-sm text-[var(--foreground)]/70">{log.duration.toFixed(2)}s</td>
              <td className="px-6 py-4 text-sm text-right font-mono text-orange-500">{log.total_tokens || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
