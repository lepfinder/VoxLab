'use client';

import React from 'react';
import { 
  Activity, 
  Zap, 
  Clock, 
  Mic, 
  Volume2, 
  MessageSquare, 
  Key, 
  BookOpen, 
  Cpu, 
  ArrowRight,
  Sparkles
} from 'lucide-react';
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
  onTabChange?: (tab: string) => void;
}

export default function Overview({ stats, logs, isDarkMode, onTabChange }: OverviewProps) {
  const features = [
    {
      title: '智能通话间',
      desc: '支持全双工实时交谈与打断，低延迟 ASR ➔ LLM ➔ TTS 闭环。',
      icon: <MessageSquare className="text-emerald-500 w-5 h-5" />,
      tab: 'conversation',
      badge: '实时流式'
    },
    {
      title: '发音人与音色',
      desc: '管理预置与自定义克隆人声，绑定专属 LLM 角色及系统提示词。',
      icon: <Volume2 className="text-violet-500 w-5 h-5" />,
      tab: 'speakers',
      badge: '声音克隆'
    },
    {
      title: 'ASR 与 VAD',
      desc: '集成 SenseVoice、Vosk 等多套识别引擎，配以精准静音检测。',
      icon: <Mic className="text-blue-500 w-5 h-5" />,
      tab: 'vad',
      badge: '本地推理'
    },
    {
      title: 'API & 密钥',
      desc: '标准化 OpenAI 兼容接口与 Token 管理，轻松对接 Dify 等客户端。',
      icon: <Key className="text-amber-500 w-5 h-5" />,
      tab: 'system-config',
      badge: '生态兼容'
    }
  ];

  return (
    <div className="space-y-8">
      {/* 科技感 Welcome 横幅 */}
      <div className="relative overflow-hidden bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-700 text-white rounded-3xl p-8 shadow-lg border border-blue-500/10">
        <div className="absolute top-0 right-0 -mt-6 -mr-6 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 -mb-10 w-96 h-96 rounded-full bg-indigo-500/10 blur-3xl" />
        
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-semibold mb-4 text-blue-100 border border-white/5">
            <Sparkles className="w-3.5 h-3.5" />
            本地 AI 语音研究实验室
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight mb-2">
            欢迎来到 VoxLab
          </h2>
          <p className="text-blue-100/90 text-sm leading-relaxed mb-6">
            VoxLab 是一个专注于本地语音技术研究、测试与生产级应用的实验平台。基于 FastAPI 和 Next.js 构建，旨在为您提供低延迟、高表现力的离线语音识别（ASR）、极致细腻的文本转语音（TTS）以及全双工交互能力。
          </p>
          <div className="flex flex-wrap gap-3">
            <button 
              onClick={() => onTabChange?.('conversation')}
              className="px-5 py-2.5 bg-white text-blue-600 hover:bg-blue-50 font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
            >
              进入智能通话间
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={() => onTabChange?.('tutorials')}
              className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/10 font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-95"
            >
              阅读实战教程
              <BookOpen className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 核心指标监控 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          title="总计调用次数"
          value={stats.count || 0}
          icon={<Activity className="text-blue-500 w-5 h-5" />}
          description="系统累积受理请求频次"
        />
        <StatCard
          title="累积 Token 消耗"
          value={stats.tokens || 0}
          icon={<Zap className="text-amber-500 w-5 h-5" />}
          description="语言模型对话所耗 Token 总和"
        />
        <StatCard
          title="模型响应均值"
          value="1.2s"
          icon={<Clock className="text-violet-500 w-5 h-5" />}
          description="从接收输入到开始产生首帧响应"
        />
      </div>

      {/* 趋势图与项目定位左右分栏 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 调用趋势图 */}
        <div className="lg:col-span-8 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-base font-bold">API 调用趋势</h3>
              <p className="text-[var(--muted-text)] text-xs mt-0.5">展示系统近期请求耗时分布（单位：秒）</p>
            </div>
          </div>
          <div className="h-[250px] mt-auto">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={logs.slice(0, 20).reverse()}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#222' : '#eee'} vertical={false} />
                <XAxis dataKey="created_at" hide />
                <YAxis stroke="#999" fontSize={11} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDarkMode ? '#111' : '#fff',
                    border: `1px solid ${isDarkMode ? '#333' : '#eee'}`,
                    borderRadius: '12px',
                    color: isDarkMode ? '#fff' : '#000',
                    fontSize: '12px'
                  }}
                />
                <Area type="monotone" dataKey="duration" stroke="#3b82f6" fillOpacity={1} fill="url(#colorValue)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 核心技术特性 */}
        <div className="lg:col-span-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold mb-1">系统特性矩阵</h3>
            <p className="text-[var(--muted-text)] text-xs mb-4">VoxLab 底层拥有的核心技术实现</p>
            
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-1.5 rounded-lg bg-blue-500/5 text-blue-500 mt-0.5">
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold">自适应延迟加载</h4>
                  <p className="text-[var(--muted-text)] text-[11px] leading-relaxed mt-0.5">
                    仅在接收到首个推理请求时才动态载入 GPU/NPU，最大程度保护显存。
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-1.5 rounded-lg bg-emerald-500/5 text-emerald-500 mt-0.5">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold">超时自动释放</h4>
                  <p className="text-[var(--muted-text)] text-[11px] leading-relaxed mt-0.5">
                    检测到特定模型在 10 分钟内无活动，自动卸载底层权重，归还系统内存。
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-1.5 rounded-lg bg-violet-500/5 text-violet-500 mt-0.5">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold">全平台加速适配</h4>
                  <p className="text-[var(--muted-text)] text-[11px] leading-relaxed mt-0.5">
                    支持 macOS MLX (12Hz/1.7B 8-bit) 高速芯片部署与 Linux PyTorch 原生卡片加速。
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[var(--card-border)] mt-4">
            <div className="text-[11px] text-[var(--muted-text)] flex justify-between">
              <span>运行模式: DEV_MODE=true</span>
              <span>后端端口: :8000</span>
            </div>
          </div>
        </div>
      </div>

      {/* 模块快速导览 */}
      <div>
        <h3 className="text-base font-bold mb-4">功能模块导航</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((item, index) => (
            <div 
              key={index}
              onClick={() => onTabChange?.(item.tab)}
              className="group bg-[var(--card-bg)] border border-[var(--card-border)] hover:border-blue-500/50 hover:shadow-md rounded-2xl p-5 cursor-pointer transition-all duration-300 flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-center mb-3.5">
                  <div className="p-2.5 bg-[var(--background)] rounded-xl group-hover:scale-110 transition-transform">
                    {item.icon}
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--background)] font-medium text-[var(--muted-text)]">
                    {item.badge}
                  </span>
                </div>
                <h4 className="text-sm font-bold mb-1 text-[var(--foreground)] group-hover:text-blue-500 transition-colors">
                  {item.title}
                </h4>
                <p className="text-[var(--muted-text)] text-xs leading-relaxed">
                  {item.desc}
                </p>
              </div>
              
              <div className="mt-4 pt-3 border-t border-dashed border-[var(--card-border)] flex items-center justify-between text-[11px] text-blue-500 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                <span>立即进入</span>
                <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, description }: { title: string; value: number | string; icon: React.ReactNode; description: string }) {
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 hover:border-blue-500/20 hover:shadow-md transition-all duration-300">
      <div className="flex justify-between items-start mb-4">
        <div className="p-2 bg-blue-500/5 rounded-lg">{icon}</div>
      </div>
      <div className="text-xs text-[var(--muted-text)] mb-1 font-medium">{title}</div>
      <div className="text-3xl font-extrabold tracking-tight mb-2">{value}</div>
      <p className="text-[var(--muted-text)] text-[10px] leading-normal">{description}</p>
    </div>
  );
}
