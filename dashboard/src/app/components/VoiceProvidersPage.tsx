'use client';

import React, { useEffect, useState } from 'react';
import { Trash2, Check, Star, Plug } from 'lucide-react';

interface VoiceProviderConfig {
  id?: string;
  capability: 'asr' | 'tts';
  provider: string;
  name: string;
  base_url: string;
  api_key: string;
  model: string;
  voice?: string;
  enabled?: boolean;
  is_default?: boolean;
}

interface VoiceProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  asrModels: string[];
  ttsModels: string[];
  ttsVoices: string[];
}

const PROVIDER_PRESETS: VoiceProviderPreset[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api',
    asrModels: ['openai/whisper-1'],
    ttsModels: ['openai/gpt-4o-mini-tts'],
    ttsVoices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
  },
];

function detectPreset(cfg: VoiceProviderConfig): VoiceProviderPreset | undefined {
  const url = (cfg.base_url || '').toLowerCase();
  return PROVIDER_PRESETS.find(p => url.includes(p.id) || url.includes(p.baseUrl.toLowerCase()));
}

const DEFAULT_FORM: VoiceProviderConfig = {
  capability: 'tts',
  provider: 'openrouter',
  name: 'OpenRouter',
  base_url: 'https://openrouter.ai/api',
  api_key: '',
  model: 'openai/gpt-4o-mini-tts',
  voice: 'alloy',
  enabled: true,
  is_default: false,
};

export default function VoiceProvidersPage() {
  const [configs, setConfigs] = useState<VoiceProviderConfig[]>([]);
  const [editing, setEditing] = useState<VoiceProviderConfig>(DEFAULT_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchConfigs = async () => {
    try {
      const res = await fetch('/admin/voice-providers');
      setConfigs(await res.json());
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

  const applyPreset = (p: VoiceProviderPreset, capability: 'asr' | 'tts') => {
    setEditing({
      ...editing,
      provider: p.id,
      name: p.name,
      base_url: p.baseUrl,
      capability,
      model: (capability === 'asr' ? p.asrModels : p.ttsModels)[0] || '',
      is_default: false,
    });
  };

  const handleEdit = (c: VoiceProviderConfig) => {
    setEditing({ ...c });
    setEditingId(c.id || null);
  };

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/admin/voice-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId || undefined,
          capability: editing.capability,
          provider: editing.provider,
          name: editing.name,
          base_url: editing.base_url,
          api_key: editing.api_key,
          model: editing.model,
          voice: editing.capability === 'tts' ? editing.voice : null,
          enabled: editing.enabled ?? true,
          is_default: editing.is_default ?? false,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
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
    if (!confirm('确认删除该语音供应商配置？')) return;
    await fetch(`/admin/voice-providers/${id}`, { method: 'DELETE' });
    fetchConfigs();
  };

  // 脱敏占位回写时后端保留原 key，可安全直接回传
  const setAsDefault = async (c: VoiceProviderConfig) => {
    setError(null);
    try {
      const res = await fetch('/admin/voice-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...c, is_default: true }),
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchConfigs();
      setSuccess('已设为默认');
      setTimeout(() => setSuccess(null), 1500);
    } catch (e: any) {
      setError(e.message || '设置失败');
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/admin/voice-providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base_url: editing.base_url, api_key: editing.api_key }),
      });
      const data = await res.json();
      if (data.ok) {
        setSuccess(`连接成功，上游共 ${data.model_count} 个模型`);
      } else {
        setError(`连接失败：${data.error}`);
      }
    } catch (e: any) {
      setError(e.message || '测试失败');
    } finally {
      setTesting(false);
    }
  };

  const preset = detectPreset(editing);
  const modelOptions = editing.capability === 'asr' ? preset?.asrModels ?? [] : preset?.ttsModels ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">语音供应商</h3>
        <p className="text-xs text-[var(--muted-text)] mb-4">
          配置外接的三方 ASR / TTS 语音供应商（OpenRouter 等）。ASR 与 TTS 各自独立选择默认配置，未配置时对应能力仅使用本地模型。
        </p>
      </div>

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
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--foreground)]/5 text-[var(--muted-text)] uppercase">
                      {c.capability}
                    </span>
                    {c.is_default ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-600/10 text-blue-600 dark:text-blue-400 inline-flex items-center gap-0.5">
                        <Star size={10} /> 默认
                      </span>
                    ) : null}
                    {c.enabled === false ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--foreground)]/5 text-[var(--muted-text)]">已停用</span>
                    ) : null}
                  </div>
                  <div className="text-xs text-[var(--muted-text)] font-mono break-all">
                    {c.base_url} · {c.model}
                    {c.capability === 'tts' && c.voice ? ` · ${c.voice}` : ''} · {c.api_key}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  {!c.is_default && c.enabled !== false ? (
                    <button
                      onClick={() => setAsDefault(c)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400 hover:opacity-80 inline-flex items-center gap-1"
                      title="将此供应商设为该能力的默认配置"
                    >
                      <Star size={11} /> 设为默认
                    </button>
                  ) : null}
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
          <h3 className="text-lg font-semibold">{editingId ? '编辑配置' : '新增配置'}</h3>
          {editingId && (
            <button onClick={resetForm} className="text-xs text-blue-600 hover:underline">
              + 新增其他
            </button>
          )}
        </div>

        {/* 第 1 步：选择能力与供应商 */}
        <label className="text-[10px] font-bold text-[var(--muted-text)] uppercase tracking-wider mb-2 block">
          第 1 步 · 选择能力
        </label>
        <div className="flex gap-3 mb-6">
          {(['tts', 'asr'] as const).map(cap => (
            <button
              key={cap}
              onClick={() => {
                const p = detectPreset(editing) || PROVIDER_PRESETS[0];
                applyPreset(p, cap);
              }}
              className={`px-4 py-2 rounded-xl border-2 text-sm transition-all ${
                editing.capability === cap
                  ? 'border-blue-600 bg-blue-600/10 text-blue-600 dark:text-blue-400 font-medium'
                  : 'border-[var(--card-border)] text-[var(--muted-text)] hover:border-blue-500/40'
              }`}
            >
              {cap === 'tts' ? 'TTS 语音合成' : 'ASR 语音识别'}
            </button>
          ))}
        </div>

        <label className="text-[10px] font-bold text-[var(--muted-text)] uppercase tracking-wider mb-2 block">
          第 2 步 · 选择供应商
        </label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {PROVIDER_PRESETS.map(p => {
            const active = preset?.id === p.id;
            return (
              <button
                key={p.id}
                onClick={() => applyPreset(p, editing.capability)}
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
                  {(editing.capability === 'asr' ? p.asrModels : p.ttsModels)[0] || ''}
                </div>
              </button>
            );
          })}
        </div>

        {/* 第 3 步：填写凭证 */}
        <label className="text-[10px] font-bold text-[var(--muted-text)] uppercase tracking-wider mb-2 block">
          第 3 步 · 填写凭证
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="名称">
            <input
              value={editing.name}
              onChange={e => setEditing({ ...editing, name: e.target.value })}
              placeholder="OpenRouter"
              className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-sm"
            />
          </Field>
          <Field label="模型">
            {modelOptions.length > 0 ? (
              <select
                value={editing.model}
                onChange={e => setEditing({ ...editing, model: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-sm font-mono"
              >
                {!modelOptions.includes(editing.model) && (
                  <option value={editing.model}>{editing.model}</option>
                )}
                {modelOptions.map(m => (
                  <option key={m} value={m}>
                    {m}
                    {m === modelOptions[0] ? '（推荐）' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={editing.model}
                onChange={e => setEditing({ ...editing, model: e.target.value })}
                placeholder="model-id"
                className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-sm font-mono"
              />
            )}
          </Field>
          {editing.capability === 'tts' && (
            <Field label="音色 Voice" hint="TTS 输出音色，由供应商定义（如 alloy / nova）">
              <input
                value={editing.voice || ''}
                onChange={e => setEditing({ ...editing, voice: e.target.value })}
                list="voice-options"
                placeholder="alloy"
                className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-sm font-mono"
              />
              <datalist id="voice-options">
                {(preset?.ttsVoices ?? []).map(v => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </Field>
          )}
          <Field label="Base URL" hint="OpenAI 兼容协议根地址，如 https://openrouter.ai/api">
            <input
              value={editing.base_url}
              onChange={e => setEditing({ ...editing, base_url: e.target.value })}
              placeholder="https://openrouter.ai/api"
              className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-sm font-mono"
            />
          </Field>
          <Field label="API Key" hint={editingId ? '保留脱敏占位即不修改原值' : '存储在本地 SQLite，列表展示时脱敏'}>
            <input
              type="password"
              value={editing.api_key}
              onChange={e => setEditing({ ...editing, api_key: e.target.value })}
              placeholder="sk-or-..."
              className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-sm font-mono"
            />
          </Field>
          <label className="flex items-center gap-2 mt-7 text-sm">
            <input
              type="checkbox"
              checked={!!editing.is_default}
              onChange={e => setEditing({ ...editing, is_default: e.target.checked })}
            />
            设为该能力（{editing.capability.toUpperCase()}）默认
          </label>
        </div>

        {error && <p className="text-red-500 text-xs mt-4">{error}</p>}
        {success && <p className="text-green-500 text-xs mt-4">{success}</p>}

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSave}
            disabled={loading || !editing.base_url || !editing.model || !editing.api_key}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
          >
            <Check size={14} />
            {loading ? '保存中…' : '保存配置'}
          </button>
          <button
            onClick={handleTest}
            disabled={testing || !editing.base_url || !editing.api_key}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--card-border)] text-sm hover:border-blue-500/40 disabled:opacity-40"
          >
            <Plug size={14} />
            {testing ? '测试中…' : '测试连通'}
          </button>
          <button
            onClick={resetForm}
            className="px-4 py-2 rounded-lg border border-[var(--card-border)] text-sm"
          >
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
