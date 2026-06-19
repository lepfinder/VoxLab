'use client';

import React from 'react';
import { Activity, Zap } from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip
} from 'recharts';

interface OverviewProps {
  stats: { count: number; tokens: number };
  logs: any[];
  isDarkMode: boolean;
}

export default function Overview({ stats, logs, isDarkMode }: OverviewProps) {
  return (
    <div className="space-y-8">
      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          title="总请求数"
          value={stats.count || 0}
          icon={<Activity className="text-blue-500" />}
          trend="+12%"
        />
        <StatCard
          title="总 Token 消耗"
          value={stats.tokens || 0}
          icon={<Zap className="text-yellow-500" />}
          trend="+5.4%"
        />
        <StatCard
          title="平均响应"
          value="1.2s"
          icon={<Activity className="text-purple-500" />}
          trend="-0.2s"
        />
      </div>

      {/* 调用趋势图 */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-6">调用趋势</h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={logs.slice(0, 20).reverse()}>
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#222' : '#eee'} vertical={false} />
              <XAxis dataKey="created_at" hide />
              <YAxis stroke="#999" fontSize={12} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: isDarkMode ? '#111' : '#fff',
                  border: `1px solid ${isDarkMode ? '#333' : '#eee'}`,
                  borderRadius: '12px',
                  color: isDarkMode ? '#fff' : '#000'
                }}
              />
              <Area type="monotone" dataKey="duration" stroke="#3b82f6" fillOpacity={1} fill="url(#colorValue)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, trend }: { title: string; value: number | string; icon: React.ReactNode; trend: string }) {
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 hover:border-blue-500/30 transition-all shadow-sm">
      <div className="flex justify-between items-start mb-4">
        <div className="p-2 bg-blue-500/5 rounded-lg">{icon}</div>
        <span className={`text-xs font-bold ${trend.startsWith('+') ? 'text-green-500' : 'text-red-500'}`}>
          {trend}
        </span>
      </div>
      <div className="text-sm text-[var(--muted-text)] mb-1">{title}</div>
      <div className="text-3xl font-bold tracking-tight">{value}</div>
    </div>
  );
}
