'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Loader2 } from 'lucide-react';

interface Voice {
  id: string;
  name: string;
  language: string;
  preview_text?: string | null;
}

interface Props {
  voice: Voice;
  /** 当 preview_text 未配置时的兜底文案，由父组件按语言生成 */
  defaultText: string;
}

/** 同一时刻只允许一个试听在播放：通过自定义事件协调多个按钮实例 */
const PREVIEW_START_EVENT = 'voxlab-voice-preview-start';

function buildDefaultText(lang: string, name: string): string {
  switch (lang) {
    case 'en':
      return `Hello, I'm ${name}. Welcome to listen to my voice.`;
    case 'ja':
      return `こんにちは、${name}です。私の声を聞いてください。`;
    case 'ko':
      return `안녕하세요, ${name}입니다. 제 목소리를 들어보세요.`;
    default:
      return `你好，我是${name}，欢迎试听我的声音。`;
  }
}

export { buildDefaultText };

export default function VoicePreviewButton({ voice, defaultText }: Props) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'playing'>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  /** 记录当前缓存对应的试听文本，文本变了就重新生成 */
  const cachedTextRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 监听其他按钮的播放事件 → 如果自己正在播放就停止
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { voiceId: string };
      if (detail.voiceId !== voice.id && status === 'playing') {
        stopPlayback();
      }
    };
    window.addEventListener(PREVIEW_START_EVENT, handler);
    return () => window.removeEventListener(PREVIEW_START_EVENT, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, voice.id]);

  // 组件卸载时释放资源
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      // 保留 audio 元素以便下次复用，只暂停不销毁
    }
    setStatus('idle');
  }, []);

  /** 播放当前缓存的 audio（从头开始），没有缓存则返回 false */
  const playCached = useCallback(async (): Promise<boolean> => {
    const audio = audioRef.current;
    if (!audio) return false;
    try {
      audio.currentTime = 0;
      await audio.play();
      setStatus('playing');
      return true;
    } catch {
      // 播放失败（如 autoplay 限制），让调用方重新生成
      return false;
    }
  }, []);

  const handleToggle = async () => {
    if (status === 'playing') {
      stopPlayback();
      return;
    }
    if (status === 'loading') {
      // 取消正在进行的请求
      abortRef.current?.abort();
      setStatus('idle');
      return;
    }

    const previewText = (voice.preview_text || '').trim() || defaultText;

    // 通知其他试听按钮停止
    window.dispatchEvent(
      new CustomEvent(PREVIEW_START_EVENT, { detail: { voiceId: voice.id } })
    );

    // ✅ 缓存命中：文本一致 → 直接重播，不发请求
    if (blobUrlRef.current && cachedTextRef.current === previewText) {
      const ok = await playCached();
      if (ok) return;
      // 播放失败就 fallback 到重新生成
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('loading');

    try {
      const res = await fetch('/api/v1/audio/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'auto',
          voice: voice.id,
          input: previewText,
          response_format: 'mp3',
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`TTS failed: ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      // 释放旧的 blob URL
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
      blobUrlRef.current = url;
      cachedTextRef.current = previewText; // ✅ 记录缓存对应的文本

      const audio = new Audio(url);
      audioRef.current = audio;

      // 播放结束：状态回到 idle，但保留 audio 元素供下次重播
      audio.onended = () => {
        setStatus('idle');
      };
      audio.onerror = () => {
        setStatus('idle');
        // 音频出错，清掉失效的缓存
        audioRef.current = null;
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
          blobUrlRef.current = null;
        }
        cachedTextRef.current = null;
      };

      await audio.play();
      setStatus('playing');
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('试听失败', err);
        setStatus('idle');
      }
    }
  };

  const isPulsing = status === 'playing';

  return (
    <button
      onClick={handleToggle}
      title={
        status === 'idle'
          ? '点击试听'
          : status === 'loading'
          ? '生成中…（点击取消）'
          : '点击停止'
      }
      className={`relative w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg transition-all active:scale-95 shrink-0
        ${
          status === 'playing'
            ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-500'
            : status === 'loading'
            ? 'bg-blue-500/15 border border-blue-500/30 text-blue-500'
            : 'bg-blue-500/10 border border-blue-500/20 text-blue-600 hover:bg-blue-500/20'
        }`}
    >
      {/* 播放时脉冲动画 */}
      {isPulsing && (
        <>
          <span className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
          <span className="absolute inset-0 rounded-full bg-emerald-500/10 animate-pulse" />
        </>
      )}

      {status === 'loading' ? (
        <Loader2 size={20} className="animate-spin relative" />
      ) : status === 'playing' ? (
        <Volume2 size={20} className="relative" />
      ) : (
        <Volume2 size={20} className="relative" />
      )}
    </button>
  );
}
