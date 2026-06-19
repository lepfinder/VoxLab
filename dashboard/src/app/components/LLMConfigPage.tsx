'use client';

import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Check, Star } from 'lucide-react';

interface LLMConfig {
  id?: string;
  name: string;
  base_url: string;
  api_key: string;
  model: string;
  temperature?: number;
  is_default?: boolean;
}

const DEEPSEEK_MODELS = ['deepseek-v4-flash', 'deepseek-v4-pro'];

// 供应商预设
interface ProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  models: string[]; // 可选模型（空则用自由文本）
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    models: DEEPSEEK_MODELS,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com',
    model: 'gpt-4o-mini',
    models: [],
  },
  {
    id: 'aliyun-coding',
    name: '阿里云 Coding Plan',
    baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
    model: 'qwen3.6-plus',
    models: ['qwen3.6-plus', 'qwen3.6-flash', 'kimi-k2.5', 'qwen3.7-plus'],
  },
  {
    id: 'volc-coding',
    name: '火山 Coding Plan',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/coding/v3',
    model: 'doubao-seed-2.0-code',
    models: [
      'doubao-seed-2.0-code',
      'doubao-seed-2.0-pro',
      'minimax-m2.7',
      'minimax-m3',
      'glm-5.2',
      'deepseek-v4-flash',
      'deepseek-v4-pro',
      'kimi-k2.6',
      'Kimi-K2.7-Code',
    ],
  },
];

function detectPreset(cfg: LLMConfig): ProviderPreset | undefined {
  const url = (cfg.base_url || '').toLowerCase();
  const name = (cfg.name || '').toLowerCase();
  return PROVIDER_PRESETS.find(p => {
    const pUrl = p.baseUrl.toLowerCase();
    return (
      url === pUrl ||
      url === pUrl.replace(/^https?:\/\//, '') ||
      (pUrl && url.includes(pUrl)) ||
      name.includes(p.id) ||
      name.includes(p.name.toLowerCase())
    );
  });
}

const DEFAULT_FORM: LLMConfig = {
  name: '',
  base_url: '',
  api_key: '',
  model: '',
  temperature: 0.7,
  is_default: true,
};

interface LLMConfigPageProps {
  embedded?: boolean;
}

export default function LLMConfigPage({ embedded = false }: LLMConfigPageProps) {
  const [configs, setConfigs] = useState<LLMConfig[]>([]);
  const [editing, setEditing] = useState<LLMConfig>(DEFAULT_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchConfigs = async () => {
    try {
      const res = await fetch('/v1/llm/configs');
      const data = await res.json();
      setConfigs(data);
    } catch (e) {
      setError('加载配置失败');
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  const resetForm = () => {
    setEditing(DEFAULT_FORM);
    setEditingId(null);
  };

  const handleEdit = (c: LLMConfig) => {
    setEditing({ ...c, api_key: c.api_key });
    setEditingId(c.id || null);
  };

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/v1/llm/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId || undefined,
          name: editing.name,
          base_url: editing.base_url,
          api_key: editing.api_key,
          model: editing.model,
          temperature: editing.temperature ?? 0.7,
          is_default: editing.is_default ?? false,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt);
      }
      await fetchConfigs();
      setSuccess('保存成功');
      resetForm();
      setTimeout(() => setSuccess(null), 2000);
    } catch (e: any) {
      setError(e.message || '保存失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确认删除该 LLM 配置？')) return;
    await fetch(`/v1/llm/configs/${id}`, { method: 'DELETE' });
    fetchConfigs();
  };

  // 一键设为默认：以现有配置原样回写，仅 is_default=true。
  // 后端遇到 api_key 含 "•" 会自动保留原值，不会破坏密钥。
  const setAsDefault = async (id: string) => {
    const cfg = configs.find(c => c.id === id);
    if (!cfg) return;
    setError(null);
    try {
      const res = await fetch('/v1/llm/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: cfg.id,
          name: cfg.name,
          base_url: cfg.base_url,
          api_key: cfg.api_key,
          model: cfg.model,
          temperature: cfg.temperature ?? 0.7,
          is_default: true,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchConfigs();
      setSuccess('已设为默认');
      setTimeout(() => setSuccess(null), 1500);
    } catch (e: any) {
      setError(e.message || '设置失败');
    }
  };

  return (
    <div className="space-y-6">
      {!embedded && (
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-1">LLM 配置</h2>
          <p className="text-sm text-[var(--muted-text)]">
            配置外接的 OpenAI 兼容大语言模型供应商（DeepSeek / OpenAI / 通义千问 / Kimi 等）。
            实时对话演示页会调用默认配置进行推理。
          </p>
        </div>
      </div>
      )}

      {/* 已有配置列表 */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">已配置的供应商</h3>
        {configs.length === 0 ? (
          <p className="text-sm text-[var(--muted-text)] py-6 text-center">尚未配置，请在下方添加。</p>
        ) : (
          <div className="space-y-3">
            {configs.map(c => (
              <div
                key={c.id}
                className="flex items-center justify-between p-4 rounded-xl bg-[var(--background)] border border-[var(--card-border)]"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{c.name}</span>
                    {c.is_default ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-600/10 text-blue-600 dark:text-blue-400 inline-flex items-center gap-0.5">
                        <Star size={10} /> 默认
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-[var(--muted-text)] font-mono break-all">
                    {c.base_url} · {c.model} · {c.api_key}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  {c.is_default ? null : (
                    <button
                      onClick={() => setAsDefault(c.id!)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400 hover:opacity-80 inline-flex items-center gap-1"
                      title="将此供应商设为默认"
                    >
                      <Star size={11} /> 设为默认
                    </button>
                  )}
                  <button
                    onClick={() => handleEdit(c)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400 hover:opacity-80"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDelete(c.id!)}
                    className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 编辑/新增表单 */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            {editingId ? '编辑配置' : '新增配置'}
          </h3>
          {editingId && (
            <button onClick={resetForm} className="text-xs text-blue-600 hover:underline">
              + 新增其他
            </button>
          )}
        </div>

        {/* 第 1 步：选择供应商 */}
        <div className="mb-6">
          <label className="text-[10px] font-bold text-[var(--muted-text)] uppercase tracking-wider mb-2 block">
            第 1 步 · 选择供应商
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {PROVIDER_PRESETS.map(p => {
              const active = detectPreset(editing)?.id === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setEditing({
                      ...editing,
                      name: p.name,
                      base_url: p.baseUrl,
                      model: p.model,
                    });
                    setEditingId(null);
                  }}
                  className={`text-left p-3 rounded-xl border-2 transition-all ${
                    active
                      ? 'border-blue-600 bg-blue-600/10'
                      : 'border-[var(--card-border)] hover:border-blue-500/40'
                  }`}
                >
                  <div className={`text-sm font-semibold mb-0.5 ${active ? 'text-blue-600 dark:text-blue-400' : ''}`}>
                    {p.name}
                  </div>
                  <div className="text-[10px] text-[var(--muted-text)] font-mono truncate">
                    {p.model}
                  </div>
                </button>
              );
            })}
          </div>
          {!detectPreset(editing) && (
            <p className="text-[11px] text-amber-600 mt-2">
              请先选择供应商，下方「模型」会自动出现下拉
            </p>
          )}
        </div>

        {/* 第 2 步：填写凭证 */}
        <label className="text-[10px] font-bold text-[var(--muted-text)] uppercase tracking-wider mb-2 block">
          第 2 步 · 填写凭证
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="名称">
            <input
              value={editing.name}
              onChange={e => setEditing({ ...editing, name: e.target.value })}
              placeholder="DeepSeek"
              className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-sm"
            />
          </Field>
          <Field label="模型">
            {(() => {
              const preset = detectPreset(editing);
              if (preset && preset.models.length > 0) {
                return (
                  <select
                    value={editing.model}
                    onChange={e => setEditing({ ...editing, model: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-sm font-mono"
                  >
                    {!preset.models.includes(editing.model) && (
                      <option value={editing.model}>{editing.model}</option>
                    )}
                    {preset.models.map(m => (
                      <option key={m} value={m}>
                        {m}
                        {m === preset.model ? '（推荐）' : ''}
                      </option>
                    ))}
                  </select>
                );
              }
              return (
                <input
                  value={editing.model}
                  onChange={e => setEditing({ ...editing, model: e.target.value })}
                  placeholder="model-id"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-sm font-mono"
                />
              );
            })()}
          </Field>
          <Field label="Base URL" hint="OpenAI 兼容协议的根地址，例如 https://api.deepseek.com">
            <input
              value={editing.base_url}
              onChange={e => setEditing({ ...editing, base_url: e.target.value })}
              placeholder="https://api.deepseek.com"
              className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-sm font-mono"
            />
          </Field>
          <Field label="API Key" hint={editingId ? '保留脱敏占位即不修改原值' : '将加密存储在本地 SQLite'}>
            <input
              type="password"
              value={editing.api_key}
              onChange={e => setEditing({ ...editing, api_key: e.target.value })}
              placeholder="sk-..."
              className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-sm font-mono"
            />
          </Field>
          <Field label="Temperature">
            <input
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={editing.temperature ?? 0.7}
              onChange={e => setEditing({ ...editing, temperature: parseFloat(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-sm"
            />
          </Field>
          <label className="flex items-center gap-2 mt-7 text-sm">
            <input
              type="checkbox"
              checked={!!editing.is_default}
              onChange={e => setEditing({ ...editing, is_default: e.target.checked })}
            />
            设为默认
          </label>
        </div>

        {error && <p className="text-red-500 text-xs mt-4">{error}</p>}
        {success && <p className="text-green-500 text-xs mt-4">{success}</p>}

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSave}
            disabled={loading || !editing.base_url || !editing.model}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
          >
            <Check size={14} />
            {loading ? '保存中…' : '保存配置'}
          </button>
          <button
            onClick={resetForm}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--card-border)] text-sm"
          >
            <Plus size={14} />
            重置
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-bold text-[var(--muted-text)] uppercase tracking-wider mb-1 block">
        {label}
      </label>
      {children}
      {hint && <p className="text-[10px] text-[var(--muted-text)] mt-1">{hint}</p>}
    </div>
  );
}
