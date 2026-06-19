'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Mic,
  Square,
  Send,
  Settings as SettingsIcon,
  AlertCircle,
  Loader2,
} from 'lucide-react';

interface Message {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at?: string;
}

type Phase = 'idle' | 'recording' | 'recognizing' | 'thinking' | 'speaking';

interface Props {
  selectedKey: string;
  onJumpToConfig: () => void;
}

const DEFAULT_SYSTEM_PROMPT = '你是一个简洁的语音助手，请用 1-3 句话回答用户。';

export default function ConversationPage({ selectedKey, onJumpToConfig }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [llmReady, setLlmReady] = useState<boolean | null>(null);

  // TTS 设置
  const [ttsModel, setTtsModel] = useState('edge');
  const [ttsVoice, setTtsVoice] = useState('zh-CN-XiaoxiaoNeural');
  const [vadSensitivity, setVadSensitivity] = useState(0.02); // RMS 阈值
  const [silenceMs, setSilenceMs] = useState(800);

  // 音频相关
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const vadTimerRef = useRef<number | null>(null);
  const speakingRef = useRef(false);
  const hasSpokenRef = useRef(false);
  const silenceSinceRef = useRef<number>(0);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // --- 检查 LLM 配置 ---
  const checkLlmReady = useCallback(async () => {
    try {
      const res = await fetch('/v1/llm/configs/default');
      const data = await res.json();
      setLlmReady(!!data?.id);
    } catch {
      setLlmReady(false);
    }
  }, []);

  useEffect(() => {
    checkLlmReady();
  }, [checkLlmReady]);

  // --- 自动初始化：复用最近一次会话，没有就建一个 ---
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/v1/conversations');
        const data = await res.json();
        if (data.length > 0) {
          setActiveId(data[0].id);
          return;
        }
        const create = await fetch('/v1/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: '实时对话' }),
        });
        const created = await create.json();
        if (created?.conversation?.id) setActiveId(created.conversation.id);
      } catch {
        setError('初始化会话失败');
      }
    })();
  }, []);

  // --- 加载消息 ---
  useEffect(() => {
    if (!activeId) return;
    (async () => {
      try {
        const res = await fetch(`/v1/conversations/${activeId}`);
        const data = await res.json();
        setMessages(data.messages || []);
      } catch {
        setError('加载消息失败');
      }
    })();
  }, [activeId]);

  // 初始加载时瞬切到底部（无动画），后续流式更新用平滑滚动
  const isFirstLoadRef = useRef(true);
  useEffect(() => {
    const behavior: ScrollBehavior = isFirstLoadRef.current ? 'auto' : 'smooth';
    messagesEndRef.current?.scrollIntoView({ behavior });
    isFirstLoadRef.current = false;
  }, [messages]);

  // --- LLM 流式调用 ---
  const streamLLM = async (history: Message[]) => {
    if (!activeId) {
      setError('请先创建或选择会话');
      return '';
    }
    const assistantMsg: Message = { role: 'assistant', content: '' };
    setMessages(prev => [...prev, assistantMsg]);
    setPhase('thinking');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${selectedKey}`,
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
            ...history.map(m => ({ role: m.role, content: m.content })),
          ],
          temperature: 0.7,
          stream: true,
          conversation_id: activeId,
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const chunk = JSON.parse(payload);
            if (chunk?.error) throw new Error(chunk.error.message || 'upstream error');
            const delta = chunk?.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              setMessages(prev => {
                const next = [...prev];
                next[next.length - 1] = { ...next[next.length - 1], content: fullText };
                return next;
              });
            }
          } catch (e) {
            // ignore parse error
          }
        }
      }
      return fullText;
    } catch (e: any) {
      setError(`LLM 调用失败: ${e.message}`);
      return '';
    } finally {
      abortRef.current = null;
    }
  };

  // --- TTS 合成并播放 ---
  const speak = async (text: string): Promise<void> => {
    if (!text.trim()) return;
    setPhase('speaking');
    try {
      const res = await fetch('/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${selectedKey}`,
        },
        body: JSON.stringify({
          model: ttsModel,
          input: text,
          voice: ttsVoice,
          response_format: 'mp3',
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setPhase('idle');
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setPhase('idle');
      };
      await audio.play();
    } catch (e: any) {
      setError(`TTS 失败: ${e.message}`);
      setPhase('idle');
    }
  };

  // --- 处理一段用户文本的完整流程 ---
  const handleUserText = async (userText: string) => {
    if (!userText.trim()) return;
    if (!llmReady) {
      setError('请先在「LLM 配置」中添加供应商');
      return;
    }
    setError(null);
    // 拼接历史
    const history = [...messages, { role: 'user' as const, content: userText }];
    setMessages(prev => [...prev, { role: 'user', content: userText }]);
    setText('');
    const reply = await streamLLM(history);
    if (reply) await speak(reply);
    // 刷新最新消息列表（持久化的）
    if (activeId) {
      const res = await fetch(`/v1/conversations/${activeId}`);
      const data = await res.json();
      setMessages(data.messages || []);
    }
  };

  // ---------------- VAD + 录音 ----------------

  const stopVadTimer = () => {
    if (vadTimerRef.current) {
      cancelAnimationFrame(vadTimerRef.current);
      vadTimerRef.current = null;
    }
  };

  const stopRecording = useCallback(() => {
    stopVadTimer();
    const recorder = mediaRecorderRef.current;
    // 不能 await / 不能覆盖 onstop：onstop 是在 startRecording 里设置的回调，
    // 这里覆盖会让 finalizeRecording 永远不被调用
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch (e) { /* already stopped */ }
    }
    mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    mediaStreamRef.current = null;
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  const finalizeRecording = async (blob: Blob) => {
    setPhase('recognizing');
    try {
      const form = new FormData();
      form.append('file', blob, 'utterance.webm');
      form.append('model', 'sensevoice');
      const res = await fetch('/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${selectedKey}` },
        body: form,
      });
      const data = await res.json();
      const txt = (data.text || '').trim();
      if (!txt) {
        setPhase('idle');
        return;
      }
      await handleUserText(txt);
    } catch (e: any) {
      setError(`ASR 失败: ${e.message}`);
      setPhase('idle');
    } finally {
      // 保持原 phase 状态
    }
  };

  const startRecording = async () => {
    setError(null);
    recordedChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
        },
      });
      mediaStreamRef.current = stream;

      const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
      const ctx = new AudioCtx();
      // 关键：浏览器自动播放策略下 AudioContext 默认 suspended，必须 resume
      if (ctx.state === 'suspended') {
        try { await ctx.resume(); } catch (e) { /* ignore */ }
      }
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mimeType = pickMime();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      recorder.ondataavailable = e => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size > 0) finalizeRecording(blob);
        else setPhase('idle');
      };
      recorder.start();
      mediaRecorderRef.current = recorder;

      setPhase('recording');
      speakingRef.current = false;
      // 关键：初始化为"开始录音时刻"，这样静音判定从一开始就能工作
      silenceSinceRef.current = performance.now();
      hasSpokenRef.current = false;

      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        // 用于 UI 显示音量条
        setAudioLevel(rms);
        const now = performance.now();
        if (rms > vadSensitivity) {
          if (!speakingRef.current) {
            speakingRef.current = true;
            hasSpokenRef.current = true;
          }
          silenceSinceRef.current = now;
        } else if (speakingRef.current) {
          // 已经开始说话 → 检查静音时长
          if (now - silenceSinceRef.current > silenceMs) {
            speakingRef.current = false;
            stopRecording();
            return;
          }
        }
        vadTimerRef.current = requestAnimationFrame(tick);
      };
      vadTimerRef.current = requestAnimationFrame(tick);
    } catch (e: any) {
      setError(`无法访问麦克风: ${e.message}`);
      setPhase('idle');
    }
  };

  const toggleMic = () => {
    if (phase === 'recording') {
      stopRecording();
    } else if (phase === 'idle') {
      startRecording();
    }
  };

  const stopAll = () => {
    abortRef.current?.abort();
    stopRecording();
    setPhase('idle');
  };

  useEffect(() => {
    return () => {
      stopVadTimer();
      mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // --- 渲染 ---
  const phaseLabel: Record<Phase, string> = {
    idle: '就绪',
    recording: '● 录音中（VAD 自动停）',
    recognizing: '识别中…',
    thinking: '思考中…',
    speaking: '播报中…',
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
      {/* 消息流 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
        {messages.length === 0 && (
          <p className="text-center text-sm text-[var(--muted-text)] mt-12">
            按下方麦克风开始说话，或直接输入文本
          </p>
        )}
        {messages.map((m, i) => (
          <MessageBubble key={m.id || i} role={m.role as 'user' | 'assistant'} content={m.content} />
        ))}
        <div ref={messagesEndRef} />
      </div>

        {/* 状态栏 */}
        <div className="px-6 py-2 border-t border-[var(--card-border)] flex items-center justify-between text-xs">
          <span className={phase !== 'idle' ? 'text-blue-600 dark:text-blue-400' : 'text-[var(--muted-text)]'}>
            {phaseLabel[phase]}
          </span>
          {error && (
            <span className="text-red-500 inline-flex items-center gap-1">
              <AlertCircle size={12} /> {error}
            </span>
          )}
          <span className="text-[var(--muted-text)]">
            TTS: <code className="text-[10px]">{ttsModel}/{ttsVoice}</code>
          </span>
        </div>

        {/* 输入区 */}
        <div className="px-6 pb-6 pt-2 flex items-center gap-3 border-t border-[var(--card-border)]">
          <button
            onClick={toggleMic}
            disabled={!activeId || phase === 'recognizing' || phase === 'thinking' || phase === 'speaking'}
            title={phase === 'recording' ? '点击手动停止（VAD 自动停也可用）' : '开始说话'}
            className={`shrink-0 w-12 h-12 rounded-full flex items-center justify-center transition-all disabled:opacity-30 ${
              phase === 'recording'
                ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {phase === 'recording' ? <Square size={18} /> : <Mic size={18} />}
          </button>

          {/* 实时音量条 */}
          {phase === 'recording' && (
            <div className="shrink-0 flex items-center gap-2 w-32">
              <div className="flex-1 h-2 rounded-full bg-[var(--background)] border border-[var(--card-border)] overflow-hidden">
                <div
                  className="h-full transition-[width] duration-75"
                  style={{
                    width: `${Math.min(100, (audioLevel / Math.max(vadSensitivity * 3, 0.05)) * 100)}%`,
                    backgroundColor:
                      audioLevel > vadSensitivity ? '#22c55e' : '#94a3b8',
                  }}
                />
              </div>
            </div>
          )}
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && text.trim() && phase === 'idle') {
                e.preventDefault();
                handleUserText(text);
              }
            }}
            placeholder={phase === 'idle' ? '输入文字，或点麦克风说话' : phaseLabel[phase]}
            disabled={!activeId || phase !== 'idle'}
            className="flex-1 px-4 py-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)] text-sm disabled:opacity-50"
          />
          <button
            onClick={() => text.trim() && handleUserText(text)}
            disabled={!activeId || phase !== 'idle' || !text.trim()}
            className="shrink-0 w-12 h-12 rounded-full flex items-center justify-center bg-blue-600/10 text-blue-600 dark:text-blue-400 hover:bg-blue-600/20 disabled:opacity-30"
          >
            <Send size={18} />
          </button>
        </div>

        {/* 配置区 */}
        <div className="px-6 pb-4 grid grid-cols-2 md:grid-cols-4 gap-3 border-t border-[var(--card-border)] pt-3">
          <SmallField label="TTS 模型">
            <select
              value={ttsModel}
              onChange={e => setTtsModel(e.target.value)}
              className="w-full px-2 py-1.5 text-xs rounded-md bg-[var(--background)] border border-[var(--card-border)]"
            >
              <option value="edge">edge</option>
              <option value="kokoro">kokoro</option>
              <option value="qwen">qwen</option>
              <option value="voxcpm">voxcpm</option>
            </select>
          </SmallField>
          <SmallField label="音色">
            <input
              value={ttsVoice}
              onChange={e => setTtsVoice(e.target.value)}
              className="w-full px-2 py-1.5 text-xs rounded-md bg-[var(--background)] border border-[var(--card-border)] font-mono"
            />
          </SmallField>
          <SmallField label={`VAD 阈值 ${vadSensitivity.toFixed(3)}`}>
            <input
              type="range"
              min={0.005}
              max={0.1}
              step={0.005}
              value={vadSensitivity}
              onChange={e => setVadSensitivity(parseFloat(e.target.value))}
              className="w-full"
            />
          </SmallField>
          <SmallField label={`静音 ${silenceMs}ms`}>
            <input
              type="range"
              min={400}
              max={2000}
              step={100}
              value={silenceMs}
              onChange={e => setSilenceMs(parseInt(e.target.value))}
              className="w-full"
            />
          </SmallField>
        </div>

        {/* LLM 未配置提示 */}
        {llmReady === false && (
          <div className="px-6 pb-4 -mt-1">
            <button
              onClick={onJumpToConfig}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-600 text-sm hover:bg-amber-500/20"
            >
              <SettingsIcon size={14} /> 未配置 LLM，点击前往「LLM 配置」
            </button>
          </div>
        )}
    </div>
  );
}

function MessageBubble({ role, content }: { role: 'user' | 'assistant'; content: string }) {
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap break-words ${
          isUser
            ? 'bg-blue-600 text-white rounded-br-md'
            : 'bg-[var(--background)] border border-[var(--card-border)] rounded-bl-md'
        }`}
      >
        {content || <Loader2 size={14} className="animate-spin inline" />}
      </div>
    </div>
  );
}

function SmallField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-[var(--muted-text)] uppercase tracking-wider mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

function pickMime(): string {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}
