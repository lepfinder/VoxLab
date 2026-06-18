'use client';

import React from 'react';
import { Info, Cpu, Zap, Globe, HardDrive } from 'lucide-react';

interface ModelCardProps {
  name: string;
  description: string;
  features: string[];
  modelId: string;
  framework?: string;
  useCases?: string[];
  githubUrl?: string;
}

export default function ModelCard({
  name,
  description,
  features,
  modelId,
  framework,
  useCases,
  githubUrl
}: ModelCardProps) {
  return (
    <div className="mb-8">
      <div className="mb-4">
        <h2 className="text-2xl font-bold mb-2">{name}</h2>
        <p className="text-[var(--muted-text)] text-sm">{description}</p>
      </div>

      {/* 模型 ID */}
      <div className="mb-4">
        <label className="text-xs font-bold text-[var(--muted-text)] uppercase tracking-wider mb-1 block">
          模型 ID
        </label>
        {modelId.includes('/') ? (
          <a
            href={`https://huggingface.co/${modelId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 font-mono hover:underline"
          >
            {modelId}
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        ) : (
          <code className="text-sm text-blue-600 dark:text-blue-400 font-mono">
            {modelId}
          </code>
        )}
      </div>

      {/* 框架信息 */}
      {framework && (
        <div className="mb-4">
          <label className="text-xs font-bold text-[var(--muted-text)] uppercase tracking-wider mb-1 block">
            推理框架
          </label>
          <span className="inline-flex items-center gap-1.5 text-sm text-purple-600 dark:text-purple-400">
            <Zap size={14} />
            {framework}
          </span>
        </div>
      )}

      {/* 特点 */}
      <div className="mb-4">
        <label className="text-xs font-bold text-[var(--muted-text)] uppercase tracking-wider mb-2 block">
          特点
        </label>
        <div className="flex flex-wrap gap-2">
          {features.map((feature, idx) => (
            <span
              key={idx}
              className="text-xs text-green-600 dark:text-green-400"
            >
              {feature}{idx < features.length - 1 && ' ·'}
            </span>
          ))}
        </div>
      </div>

      {/* 适用场景 */}
      {useCases && useCases.length > 0 && (
        <div className="mb-4">
          <label className="text-xs font-bold text-[var(--muted-text)] uppercase tracking-wider mb-2 block">
            适用场景
          </label>
          <div className="flex flex-wrap gap-2">
            {useCases.map((useCase, idx) => (
              <span
                key={idx}
                className="text-xs text-orange-600 dark:text-orange-400"
              >
                {useCase}{idx < useCases.length - 1 && ' ·'}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* GitHub 链接 */}
      {githubUrl && (
        <div>
          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            <span>查看源码</span>
          </a>
        </div>
      )}
    </div>
  );
}
