'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Server, 
  Cpu, 
  HardDrive, 
  Activity, 
  CheckCircle, 
  AlertTriangle, 
  Download, 
  Copy, 
  Check, 
  Loader2, 
  Terminal, 
  ArrowRight,
  Globe
} from 'lucide-react';

interface SystemInfo {
  os: string;
  device: string;
  python_version: string;
  hf_home: string;
  hf_endpoint: string;
  network_status: string;
}

interface ModelItem {
  key: string;
  name: string;
  model_id: string;
  status: 'installed' | 'missing' | 'downloading';
  path: string | null;
  size: string;
  download_command: string;
}

export default function ModelsTab() {
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [models, setModels] = useState<ModelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchCheckData();
    setRefreshing(false);
  };

  // 复制命令的状态
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  
  // 下载状态轮询记录：model_id -> log string
  const [downloadLogs, setDownloadLogs] = useState<Record<string, string>>({});
  const [activeDownloading, setActiveDownloading] = useState<Record<string, boolean>>({});
  
  const pollTimers = useRef<Record<string, NodeJS.Timeout>>({});

  const fetchCheckData = async () => {
    try {
      const res = await fetch('/admin/system/check');
      if (!res.ok) throw new Error('读取自检数据失败');
      const data = await res.json();
      setSystem(data.system);
      setModels(data.models);
      
      // 对于正在下载的模型，自动开启轮询
      data.models.forEach((m: ModelItem) => {
        if (m.status === 'downloading' && !activeDownloading[m.model_id]) {
          startPolling(m.model_id);
        }
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCheckData();
    return () => {
      // 清理所有轮询
      Object.values(pollTimers.current).forEach(clearInterval);
    };
  }, []);

  const handleCopyCommand = async (cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiedCmd(cmd);
      setTimeout(() => setCopiedCmd(null), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const startPolling = (modelId: string) => {
    if (pollTimers.current[modelId]) clearInterval(pollTimers.current[modelId]);
    
    setActiveDownloading(prev => ({ ...prev, [modelId]: true }));
    
    const poll = async () => {
      try {
        const res = await fetch(`/admin/system/download/progress?model_id=${encodeURIComponent(modelId)}`);
        if (!res.ok) return;
        const progress = await res.json();
        
        setDownloadLogs(prev => ({ ...prev, [modelId]: progress.log || '' }));
        
        if (progress.status === 'success' || progress.status === 'failed') {
          // 下载结束
          clearInterval(pollTimers.current[modelId]);
          delete pollTimers.current[modelId];
          setActiveDownloading(prev => ({ ...prev, [modelId]: false }));
          // 重新拉取最新的自检列表
          fetchCheckData();
        }
      } catch (err) {
        console.error(err);
      }
    };
    
    poll(); // 先执行一次
    pollTimers.current[modelId] = setInterval(poll, 2000);
  };

  const handleDownload = async (modelId: string) => {
    try {
      const res = await fetch('/admin/system/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: modelId })
      });
      if (!res.ok) throw new Error('启动后台下载失败');
      
      // 开始轮询
      startPolling(modelId);
      // 将列表中对应模型的状态本地暂时置为 downloading
      setModels(prev =>
        prev.map(m => (m.model_id === modelId ? { ...m, status: 'downloading' } : m))
      );
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-sm text-[var(--muted-text)]">正在扫描本地模型缓存与自检系统环境...</p>
      </div>
    );
  }

  const readyModelsCount = models.filter(m => m.status === 'installed').length;

  return (
    <div className="space-y-6">
      {/* 硬件与网络状态面板 */}
      {system && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-[var(--muted-text)] uppercase tracking-wider">系统环境</span>
              <Server size={18} className="text-blue-500" />
            </div>
            <div className="text-xl font-bold mb-1 truncate">{system.os}</div>
            <div className="text-xs text-[var(--muted-text)] mt-1">Python {system.python_version}</div>
          </div>

          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-[var(--muted-text)] uppercase tracking-wider">计算设备</span>
              <Cpu size={18} className="text-violet-500" />
            </div>
            <div className="text-xl font-bold mb-1">{system.device}</div>
            <div className="text-xs text-[var(--muted-text)] mt-1">自适应推理权重硬件调度</div>
          </div>

          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-[var(--muted-text)] uppercase tracking-wider">网络与存储</span>
              <Globe size={18} className={system.network_status === 'connected' ? 'text-green-500' : 'text-rose-500'} />
            </div>
            <div className="text-xl font-bold mb-1 flex items-center gap-1.5">
              <span>{system.network_status === 'connected' ? '网络已连通' : '离线模式'}</span>
              <span className={`w-2.5 h-2.5 rounded-full ${system.network_status === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-rose-500'}`} />
            </div>
            <div className="text-xs text-[var(--muted-text)] truncate mt-1" title={system.hf_endpoint}>
              端点: {system.hf_endpoint}
            </div>
          </div>
        </div>
      )}

      {/* 模型汇总信息 Banner */}
      <div className="bg-gradient-to-r from-blue-600/10 to-indigo-600/10 border border-blue-500/20 rounded-2xl p-6 shadow-sm flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-blue-900 dark:text-blue-200">本地模型就绪率 ({readyModelsCount}/{models.length})</h3>
          <p className="text-xs text-blue-700/80 dark:text-blue-300/80 mt-1">
            {readyModelsCount === models.length 
              ? '✨ 所有的主流程语音识别（ASR）与语音合成（TTS）模型已经在本地缓存完毕，运行性能最佳！'
              : `目前尚有 ${models.length - readyModelsCount} 个模型需要下载。您可以在下方一键触发后台线程高速拉取。`}
          </p>
        </div>
        <div className="text-3xl font-extrabold text-blue-600 dark:text-blue-400 font-mono">
          {Math.round((readyModelsCount / models.length) * 100)}%
        </div>
      </div>

      {/* 模型列表 */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-base font-bold">本地模型状态列表</h3>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
          >
            {refreshing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>诊断中...</span>
              </>
            ) : (
              <>
                <Activity className="w-3.5 h-3.5" />
                <span>重新诊断</span>
              </>
            )}
          </button>
        </div>
        
        <div className="grid grid-cols-1 gap-4">
          {models.map((model) => (
            <div 
              key={model.model_id}
              className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 shadow-sm transition-all hover:shadow-md"
            >
              {/* 卡片头部 */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[var(--card-border)]">
                <div>
                  <h4 className="text-sm font-bold text-[var(--foreground)]">{model.name}</h4>
                  <code className="text-xs text-[var(--muted-text)] font-mono select-all block mt-0.5">{model.model_id}</code>
                </div>

                {/* 状态徽章 */}
                <div className="flex items-center gap-2">
                  {model.status === 'installed' && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-green-500/10 text-green-600 dark:text-green-400">
                      <CheckCircle size={12} />
                      已下载就绪 ({model.size})
                    </span>
                  )}
                  {model.status === 'missing' && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400">
                      <AlertTriangle size={12} />
                      未就绪
                    </span>
                  )}
                  {model.status === 'downloading' && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      <Loader2 size={12} className="animate-spin" />
                      后台下载中...
                    </span>
                  )}
                </div>
              </div>

              {/* 卡片底部操作与路径 */}
              <div className="pt-4 space-y-4">
                {model.path && (
                  <div className="text-xs text-[var(--muted-text)] bg-[var(--background)] p-3 rounded-xl border border-[var(--card-border)] overflow-x-auto font-mono">
                    <span className="font-bold block mb-1 text-[10px] text-[var(--muted-text)] uppercase">本地快照存储路径:</span>
                    {model.path}
                  </div>
                )}

                {/* 操作按钮栏 */}
                <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                  <div className="flex items-center gap-2 w-full md:w-auto">
                    {/* 一键下载按钮 */}
                    {model.status === 'missing' && (
                      <button
                        onClick={() => handleDownload(model.model_id)}
                        className="w-full md:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95"
                      >
                        <Download size={14} />
                        一键在后台下载
                      </button>
                    )}
                    {model.status === 'downloading' && (
                      <button
                        disabled
                        className="w-full md:w-auto px-4 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                      >
                        <Loader2 size={14} className="animate-spin" />
                        正在下载...
                      </button>
                    )}
                  </div>

                  {/* 命令行复制 */}
                  {model.key !== 'vosk' && (
                    <button
                      onClick={() => handleCopyCommand(model.download_command)}
                      className="w-full md:w-auto px-3.5 py-2 bg-[var(--background)] hover:bg-[var(--foreground)]/5 text-[var(--muted-text)] hover:text-[var(--foreground)] border border-[var(--card-border)] rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-all"
                    >
                      {copiedCmd === model.download_command ? (
                        <>
                          <Check size={14} className="text-green-500" />
                          <span>已复制 CLI 命令</span>
                        </>
                      ) : (
                        <>
                          <Copy size={14} />
                          <span>复制下载命令</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* 展开的实时日志框 */}
                {model.status === 'downloading' && downloadLogs[model.model_id] && (
                  <div className="mt-3 bg-black/95 text-green-400 dark:text-green-400 font-mono text-xs rounded-xl p-4 border border-zinc-800 shadow-inner">
                    <div className="flex items-center gap-1.5 pb-2 border-b border-zinc-900 mb-2 text-[10px] text-zinc-500 uppercase tracking-wider font-bold">
                      <Terminal size={12} />
                      <span>异步拉取控制台输出</span>
                    </div>
                    <pre className="whitespace-pre-wrap max-h-40 overflow-y-auto leading-relaxed custom-scrollbar">
                      {downloadLogs[model.model_id]}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
