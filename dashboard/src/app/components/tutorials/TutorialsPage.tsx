'use client';

import React, { useState, useEffect } from 'react';
import { BookOpen, ChevronRight, ChevronDown, FileText, Code, CheckCircle, RefreshCw, BookMarked } from 'lucide-react';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true
});

interface Section {
  id: string;
  title: string;
}

interface Chapter {
  id: string;
  title: string;
  sections: Section[];
}

export default function TutorialsPage() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeChapterId, setActiveChapterId] = useState<string>('');
  const [activeSectionId, setActiveSectionId] = useState<string>('');
  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>({});
  const [content, setContent] = useState<string>('');
  const [loadingContent, setLoadingContent] = useState<boolean>(false);
  const [loadingMenu, setLoadingMenu] = useState<boolean>(true);

  // 获取教程目录
  const fetchMenu = async () => {
    try {
      const response = await fetch('/admin/tutorials');
      const data = await response.json();
      setChapters(data);
      
      // 默认展开所有章节并选中第一章第一节
      if (data.length > 0) {
        const initialExpanded: Record<string, boolean> = {};
        data.forEach((ch: Chapter) => {
          initialExpanded[ch.id] = true;
        });
        setExpandedChapters(initialExpanded);
        
        setActiveChapterId(data[0].id);
        if (data[0].sections && data[0].sections.length > 0) {
          setActiveSectionId(data[0].sections[0].id);
        }
      }
    } catch (err) {
      console.error("加载目录失败", err);
    } finally {
      setLoadingMenu(false);
    }
  };

  // 加载某一节的 Markdown 内容
  const fetchSectionContent = async (chapterId: string, sectionId: string) => {
    if (!chapterId || !sectionId) return;
    setLoadingContent(true);
    try {
      const response = await fetch(`/admin/tutorials/${chapterId}/${sectionId}`);
      if (!response.ok) {
        throw new Error("无法获取小节内容");
      }
      const text = await response.text();
      setContent(text);
    } catch (err) {
      console.error(err);
      setContent("# 加载失败\n无法获取该小节的教程内容，请稍后再试。");
    } finally {
      setLoadingContent(false);
    }
  };

  useEffect(() => {
    fetchMenu();
  }, []);

  useEffect(() => {
    if (activeChapterId && activeSectionId) {
      fetchSectionContent(activeChapterId, activeSectionId);
    }
  }, [activeChapterId, activeSectionId]);

  const toggleChapter = (chapterId: string) => {
    setExpandedChapters(prev => ({
      ...prev,
      [chapterId]: !prev[chapterId]
    }));
  };

  return (
    <div className="space-y-6">
      {/* 头部标题 */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-[var(--foreground)]">语音实验与原理实战教程</h1>
        <p className="text-sm text-[var(--muted-text)]">
          从底层声学特征开始，打通从算法原理到嵌入式 ESP32 硬件的实时语音流交互。
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* 左侧树状目录导航 */}
        <div className="lg:col-span-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4 shadow-sm h-[calc(100vh-220px)] overflow-y-auto custom-scrollbar lg:sticky lg:top-6">
          <div className="flex items-center gap-2 font-bold text-sm text-[var(--muted-text)] border-b border-[var(--card-border)] pb-3 mb-4 px-2">
            <BookMarked size={16} className="text-blue-500" />
            <span>教程目录索引</span>
          </div>

          {loadingMenu ? (
            <div className="flex items-center justify-center py-10 gap-2 text-xs text-[var(--muted-text)]">
              <RefreshCw size={14} className="animate-spin" />
              <span>正在加载章节目录...</span>
            </div>
          ) : (
            <nav className="space-y-2">
              {chapters.map(chapter => {
                const isExpanded = !!expandedChapters[chapter.id];
                return (
                  <div key={chapter.id} className="space-y-1">
                    {/* 章标题 */}
                    <button
                      onClick={() => toggleChapter(chapter.id)}
                      className="w-full flex items-center justify-between p-2 rounded-xl text-left hover:bg-[var(--foreground)]/5 transition-colors group"
                    >
                      <span className="text-xs font-bold text-[var(--foreground)] group-hover:text-blue-500 transition-colors">
                        {chapter.title}
                      </span>
                      {isExpanded ? (
                        <ChevronDown size={14} className="text-[var(--muted-text)]" />
                      ) : (
                        <ChevronRight size={14} className="text-[var(--muted-text)]" />
                      )}
                    </button>

                    {/* 小节列表 */}
                    {isExpanded && (
                      <div className="pl-3 border-l-2 border-gray-100 dark:border-gray-800 ml-3 space-y-1 mt-1">
                        {chapter.sections.map(section => {
                          const isActive = activeChapterId === chapter.id && activeSectionId === section.id;
                          return (
                            <button
                              key={section.id}
                              onClick={() => {
                                setActiveChapterId(chapter.id);
                                setActiveSectionId(section.id);
                              }}
                              className={`w-full flex items-start gap-2 p-2 rounded-lg text-left text-xs transition-all ${
                                isActive
                                  ? 'bg-blue-600/10 text-blue-600 dark:text-blue-400 font-semibold'
                                  : 'text-[var(--muted-text)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5'
                              }`}
                            >
                              <FileText size={14} className="mt-0.5 flex-shrink-0" />
                              <span>{section.title}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          )}
        </div>

        {/* 右侧教程内容阅读器 */}
        <div className="lg:col-span-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm min-h-[500px]">
          {loadingContent ? (
            <div className="flex items-center justify-center min-h-[500px] gap-3 text-sm text-[var(--muted-text)]">
              <RefreshCw size={24} className="animate-spin text-blue-500" />
              <span>正在加载小节内容...</span>
            </div>
          ) : (
            <div className="p-8 pb-20">
              <article 
                className="md-content"
                dangerouslySetInnerHTML={{ __html: md.render(content || '') }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
