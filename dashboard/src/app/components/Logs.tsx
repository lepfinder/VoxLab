'use client';

import React, { useEffect, useState } from 'react';
import { Mic, Volume2, Bot, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';

type LogType = 'asr' | 'tts' | 'llm';

// ── 类型定义 ───────────────────────────────────────────────────────
interface ASRLog {
  id: number;
  created_at: string;
  token: string;
  model: string;
  endpoint: string;
  status_code: number;
  duration: number;
  result: string;
  audio_format: string;
  audio_duration_s: number;
  language: string;
}

interface TTSLog {
  id: number;
  created_at: string;
  token: string;
  model: string;
  endpoint: string;
  status_code: number;
  duration: number;
  text: string;
  voice_id: string;
  voice_name: string;
  tts_voice: string;
  is_clone: number;
  response_format: string;
}

interface LLMLog {
  id: number;
  created_at: string;
  token: string;
  model: string;
  endpoint: string;
  status_code: number;
  duration: number;
  messages: string;
  response: string;
  thinking: string;
  finish_reason: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  is_stream: number;
}

const TABS: { id: LogType; label: string; icon: any; color: string }[] = [
  { id: 'asr', label: 'ASR', icon: Mic, color: 'text-green-600 bg-green-500/10' },
  { id: 'tts', label: 'TTS', icon: Volume2, color: 'text-purple-600 bg-purple-500/10' },
  { id: 'llm', label: 'LLM', icon: Bot, color: 'text-blue-600 bg-blue-500/10' },
];

export default function Logs() {
  const [activeTab, setActiveTab] = useState<LogType>('asr');
  const [asrLogs, setAsrLogs] = useState<ASRLog[]>([]);
  const [ttsLogs, setTtsLogs] = useState<TTSLog[]>([]);
  const [llmLogs, setLlmLogs] = useState<LLMLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchLogs = async (type: LogType) => {
    setLoading(true);
    try {
      const res = await fetch(`/admin/logs/${type}`);
      const data = await res.json();
      if (type === 'asr') setAsrLogs(data);
      else if (type === 'tts') setTtsLogs(data);
      else setLlmLogs(data);
    } catch (e) {
      console.error(`获取 ${type} 日志失败`, e);
    } finally {
      setLoading(false);
      setExpandedId(null);
    }
  };

  useEffect(() => {
    fetchLogs(activeTab);
  }, [activeTab]);

  const currentLogs = activeTab === 'asr' ? asrLogs : activeTab === 'tts' ? ttsLogs : llmLogs;

  return (
    <div className="space-y-5">
      {/* Tab 切换 */}
      <div className="flex gap-2 border-b border-[var(--card-border)] pb-3">
        {TABS.map(tab => {
          const count =
            tab.id === 'asr' ? asrLogs.length :
            tab.id === 'tts' ? ttsLogs.length :
            llmLogs.length;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? `${tab.color} shadow-sm`
                  : 'text-[var(--muted-text)] hover:bg-[var(--foreground)]/5'
              }`}
            >
              <tab.icon size={15} />
              {tab.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                isActive ? 'bg-current/10' : 'bg-[var(--foreground)]/5'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 表格 */}
      {loading ? (
        <div className="text-center py-12 text-[var(--muted-text)]">加载中...</div>
      ) : currentLogs.length === 0 ? (
        <div className="text-center py-16 text-[var(--muted-text)]">
          <div className="text-4xl mb-3">📭</div>
          <div className="text-sm">暂无{activeTab.toUpperCase()}调用记录</div>
          <div className="text-xs mt-1">发起一次 {activeTab === 'asr' ? '语音识别' : activeTab === 'tts' ? '语音合成' : 'LLM 对话'} 请求后，日志会出现在这里</div>
        </div>
      ) : (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-sm">
          {activeTab === 'asr' && <ASRTable logs={asrLogs} expandedId={expandedId} setExpandedId={setExpandedId} />}
          {activeTab === 'tts' && <TTSTable logs={ttsLogs} expandedId={expandedId} setExpandedId={setExpandedId} />}
          {activeTab === 'llm' && <LLMTable logs={llmLogs} expandedId={expandedId} setExpandedId={setExpandedId} />}
        </div>
      )}
    </div>
  );
}

// ── 通用小组件 ─────────────────────────────────────────────────────
function StatusBadge({ code }: { code: number }) {
  const ok = code < 400;
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
      ok ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'
    }`}>
      {code}
    </span>
  );
}

function Duration({ seconds }: { seconds: number }) {
  return <span className="text-sm text-[var(--foreground)]/70">{seconds.toFixed(2)}s</span>;
}

function Preview({ text, max = 60 }: { text: string; max?: number }) {
  if (!text) return <span className="text-[var(--muted-text)] italic">—</span>;
  const truncated = text.length > max ? text.slice(0, max) + '…' : text;
  return <span title={text}>{truncated}</span>;
}

function ExpandToggle({ expanded, onClick }: { expanded: boolean; onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="p-1 hover:bg-[var(--foreground)]/5 rounded transition-colors"
    >
      {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handleCopy}
      className="p-1.5 hover:bg-[var(--foreground)]/5 rounded text-[var(--muted-text)] hover:text-[var(--foreground)] transition-colors"
      title="复制"
    >
      {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
    </button>
  );
}

function DetailRow({ children, colSpan }: { children: React.ReactNode; colSpan: number }) {
  return (
    <tr className="bg-[var(--foreground)]/[0.02]">
      <td colSpan={colSpan} className="px-6 py-4">
        {children}
      </td>
    </tr>
  );
}

function DetailSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-bold text-[var(--muted-text)] uppercase tracking-wider">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function MetaGrid({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
      {items.map((it, i) => (
        <div key={i} className="bg-[var(--background)] px-3 py-2 rounded-lg border border-[var(--card-border)]">
          <div className="text-[10px] text-[var(--muted-text)] uppercase tracking-wider mb-0.5">{it.label}</div>
          <div className="font-medium">{it.value}</div>
        </div>
      ))}
    </div>
  );
}

// ── ASR 表格 ────────────────────────────────────────────────────────
function ASRTable({ logs, expandedId, setExpandedId }: { logs: ASRLog[]; expandedId: number | null; setExpandedId: (id: number | null) => void }) {
  return (
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="bg-[var(--foreground)]/5 text-[var(--muted-text)] text-xs uppercase tracking-wider">
          <th className="w-8 px-3 py-3"></th>
          <th className="px-4 py-3 font-semibold">时间</th>
          <th className="px-4 py-3 font-semibold">模型</th>
          <th className="px-4 py-3 font-semibold">识别结果</th>
          <th className="px-4 py-3 font-semibold">音频</th>
          <th className="px-4 py-3 font-semibold">状态</th>
          <th className="px-4 py-3 font-semibold text-right">耗时</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--card-border)]">
        {logs.map(log => {
          const expanded = expandedId === log.id;
          return (
            <React.Fragment key={log.id}>
              <tr
                onClick={() => setExpandedId(expanded ? null : log.id)}
                className="hover:bg-[var(--foreground)]/[0.02] transition-colors cursor-pointer"
              >
                <td className="px-3 py-3"><ExpandToggle expanded={expanded} onClick={() => setExpandedId(expanded ? null : log.id)} /></td>
                <td className="px-4 py-3 text-xs text-[var(--muted-text)]">{new Date(log.created_at).toLocaleString()}</td>
                <td className="px-4 py-3 text-sm font-medium">{log.model}</td>
                <td className="px-4 py-3 text-sm"><Preview text={log.result} /></td>
                <td className="px-4 py-3 text-xs text-[var(--muted-text)]">
                  {log.audio_format} · {log.audio_duration_s ? `${log.audio_duration_s.toFixed(1)}s` : '—'}
                </td>
                <td className="px-4 py-3"><StatusBadge code={log.status_code} /></td>
                <td className="px-4 py-3 text-right"><Duration seconds={log.duration} /></td>
              </tr>
              {expanded && (
                <DetailRow colSpan={7}>
                  <div className="space-y-4">
                    <MetaGrid items={[
                      { label: 'Token', value: <span className="font-mono text-[11px]">{log.token || '—'}</span> },
                      { label: 'Endpoint', value: <span className="font-mono text-[11px]">{log.endpoint}</span> },
                      { label: '语言', value: log.language || '未标注' },
                      { label: '音频时长', value: log.audio_duration_s ? `${log.audio_duration_s.toFixed(2)}s` : '—' },
                    ]} />
                    <DetailSection label="识别结果">
                      <div className="relative bg-[var(--background)] border border-[var(--card-border)] rounded-lg p-3 font-mono text-xs whitespace-pre-wrap break-words">
                        {log.result || '(空)'}
                        {log.result && <div className="absolute top-2 right-2"><CopyButton text={log.result} /></div>}
                      </div>
                    </DetailSection>
                  </div>
                </DetailRow>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

// ── TTS 表格 ────────────────────────────────────────────────────────
function TTSTable({ logs, expandedId, setExpandedId }: { logs: TTSLog[]; expandedId: number | null; setExpandedId: (id: number | null) => void }) {
  return (
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="bg-[var(--foreground)]/5 text-[var(--muted-text)] text-xs uppercase tracking-wider">
          <th className="w-8 px-3 py-3"></th>
          <th className="px-4 py-3 font-semibold">时间</th>
          <th className="px-4 py-3 font-semibold">供应商</th>
          <th className="px-4 py-3 font-semibold">音色</th>
          <th className="px-4 py-3 font-semibold">合成文本</th>
          <th className="px-4 py-3 font-semibold">格式</th>
          <th className="px-4 py-3 font-semibold">状态</th>
          <th className="px-4 py-3 font-semibold text-right">耗时</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--card-border)]">
        {logs.map(log => {
          const expanded = expandedId === log.id;
          return (
            <React.Fragment key={log.id}>
              <tr
                onClick={() => setExpandedId(expanded ? null : log.id)}
                className="hover:bg-[var(--foreground)]/[0.02] transition-colors cursor-pointer"
              >
                <td className="px-3 py-3"><ExpandToggle expanded={expanded} onClick={() => setExpandedId(expanded ? null : log.id)} /></td>
                <td className="px-4 py-3 text-xs text-[var(--muted-text)]">{new Date(log.created_at).toLocaleString()}</td>
                <td className="px-4 py-3 text-sm font-medium">{log.model}</td>
                <td className="px-4 py-3 text-sm">
                  <span className="text-blue-600 dark:text-blue-400">{log.voice_name || log.voice_id}</span>
                  {log.is_clone === 1 && (
                    <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600">CLONE</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm"><Preview text={log.text} /></td>
                <td className="px-4 py-3 text-xs text-[var(--muted-text)] font-mono">{log.response_format}</td>
                <td className="px-4 py-3"><StatusBadge code={log.status_code} /></td>
                <td className="px-4 py-3 text-right"><Duration seconds={log.duration} /></td>
              </tr>
              {expanded && (
                <DetailRow colSpan={8}>
                  <div className="space-y-4">
                    <MetaGrid items={[
                      { label: 'Token', value: <span className="font-mono text-[11px]">{log.token || '—'}</span> },
                      { label: 'Endpoint', value: <span className="font-mono text-[11px]">{log.endpoint}</span> },
                      { label: 'Voice ID', value: <span className="font-mono text-[11px]">{log.voice_id}</span> },
                      { label: '底层参数', value: <span className="font-mono text-[11px]">{log.tts_voice}</span> },
                    ]} />
                    <DetailSection label="合成文本">
                      <div className="relative bg-[var(--background)] border border-[var(--card-border)] rounded-lg p-3 font-mono text-xs whitespace-pre-wrap break-words">
                        {log.text || '(空)'}
                        {log.text && <div className="absolute top-2 right-2"><CopyButton text={log.text} /></div>}
                      </div>
                    </DetailSection>
                  </div>
                </DetailRow>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

// ── LLM 表格 ────────────────────────────────────────────────────────
function LLMTable({ logs, expandedId, setExpandedId }: { logs: LLMLog[]; expandedId: number | null; setExpandedId: (id: number | null) => void }) {
  return (
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="bg-[var(--foreground)]/5 text-[var(--muted-text)] text-xs uppercase tracking-wider">
          <th className="w-8 px-3 py-3"></th>
          <th className="px-4 py-3 font-semibold">时间</th>
          <th className="px-4 py-3 font-semibold">模型</th>
          <th className="px-4 py-3 font-semibold">用户输入</th>
          <th className="px-4 py-3 font-semibold">Tokens</th>
          <th className="px-4 py-3 font-semibold">状态</th>
          <th className="px-4 py-3 font-semibold text-right">耗时</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--card-border)]">
        {logs.map(log => {
          const expanded = expandedId === log.id;
          // 提取最后一条 user 消息作为预览
          let userPreview = '';
          try {
            const msgs = JSON.parse(log.messages || '[]');
            const lastUser = [...msgs].reverse().find((m: any) => m.role === 'user');
            userPreview = lastUser?.content || '';
          } catch {}

          return (
            <React.Fragment key={log.id}>
              <tr
                onClick={() => setExpandedId(expanded ? null : log.id)}
                className="hover:bg-[var(--foreground)]/[0.02] transition-colors cursor-pointer"
              >
                <td className="px-3 py-3"><ExpandToggle expanded={expanded} onClick={() => setExpandedId(expanded ? null : log.id)} /></td>
                <td className="px-4 py-3 text-xs text-[var(--muted-text)]">{new Date(log.created_at).toLocaleString()}</td>
                <td className="px-4 py-3 text-sm font-medium">{log.model}</td>
                <td className="px-4 py-3 text-sm"><Preview text={userPreview} /></td>
                <td className="px-4 py-3 text-sm font-mono text-orange-500">
                  {log.total_tokens || '—'}
                  {log.thinking && (
                    <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600">THINK</span>
                  )}
                </td>
                <td className="px-4 py-3"><StatusBadge code={log.status_code} /></td>
                <td className="px-4 py-3 text-right"><Duration seconds={log.duration} /></td>
              </tr>
              {expanded && <LLMDetail log={log} />}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function LLMDetail({ log }: { log: LLMLog }) {
  let messages: { role: string; content: string }[] = [];
  try { messages = JSON.parse(log.messages || '[]'); } catch {}

  return (
    <DetailRow colSpan={7}>
      <div className="space-y-4">
        <MetaGrid items={[
          { label: 'Token', value: <span className="font-mono text-[11px]">{log.token || '—'}</span> },
          { label: 'Endpoint', value: <span className="font-mono text-[11px]">{log.endpoint}</span> },
          { label: 'Finish Reason', value: log.finish_reason || '—' },
          { label: '流式', value: log.is_stream ? '是' : '否' },
        ]} />

        {/* Token 统计 */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg px-3 py-2">
            <div className="text-[10px] text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-0.5">Prompt Tokens</div>
            <div className="text-lg font-bold font-mono">{log.prompt_tokens}</div>
          </div>
          <div className="bg-green-500/5 border border-green-500/10 rounded-lg px-3 py-2">
            <div className="text-[10px] text-green-600 uppercase tracking-wider mb-0.5">Completion Tokens</div>
            <div className="text-lg font-bold font-mono">{log.completion_tokens}</div>
          </div>
          <div className="bg-orange-500/5 border border-orange-500/10 rounded-lg px-3 py-2">
            <div className="text-[10px] text-orange-600 uppercase tracking-wider mb-0.5">Total Tokens</div>
            <div className="text-lg font-bold font-mono">{log.total_tokens}</div>
          </div>
        </div>

        {/* 思考过程 */}
        {log.thinking && (
          <DetailSection label={`思考过程 (${log.thinking.length} 字)`}>
            <div className="relative bg-amber-500/5 border border-amber-500/10 rounded-lg p-3 text-xs whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
              {log.thinking}
              <div className="absolute top-2 right-2"><CopyButton text={log.thinking} /></div>
            </div>
          </DetailSection>
        )}

        {/* 完整输入 messages */}
        <DetailSection label={`完整输入 (${messages.length} 条 messages)`}>
          <div className="space-y-2">
            {messages.map((m, i) => (
              <div key={i} className={`rounded-lg border p-3 text-xs ${
                m.role === 'system' ? 'bg-purple-500/5 border-purple-500/10' :
                m.role === 'user' ? 'bg-blue-500/5 border-blue-500/10' :
                'bg-green-500/5 border-green-500/10'
              }`}>
                <div className="flex justify-between items-center mb-1.5">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${
                    m.role === 'system' ? 'text-purple-600' :
                    m.role === 'user' ? 'text-blue-600' : 'text-green-600'
                  }`}>{m.role}</span>
                  <CopyButton text={m.content} />
                </div>
                <div className="whitespace-pre-wrap break-words font-mono">{m.content}</div>
              </div>
            ))}
          </div>
        </DetailSection>

        {/* 模型输出 */}
        <DetailSection label={`模型输出 (${log.response.length} 字)`}>
          <div className="relative bg-green-500/5 border border-green-500/10 rounded-lg p-3 text-xs whitespace-pre-wrap break-words">
            {log.response || '(空)'}
            <div className="absolute top-2 right-2"><CopyButton text={log.response} /></div>
          </div>
        </DetailSection>
      </div>
    </DetailRow>
  );
}
