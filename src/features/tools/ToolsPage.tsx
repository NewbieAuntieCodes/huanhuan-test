import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import {
  ArrowLeftIcon,
  WrenchIcon,
  CloudArrowDownIcon,
  ArrowPathIcon,
  UploadIcon,
  ArrowsRightLeftIcon,
  ArrowDownTrayIcon,
} from '../../components/ui/icons';
import { cn } from '../../utils/cn';

const ToolCard: React.FC<{
  title: string;
  desc: string;
  status?: 'ready' | 'wip';
  actions?: React.ReactNode;
  badge?: string;
}> = ({ title, desc, status = 'wip', actions, badge }) => {
  const statusLabel = status === 'ready' ? '可用' : '筹备中';
  const statusColor =
    status === 'ready'
      ? 'bg-emerald-600/30 text-emerald-200 border border-emerald-500/40'
      : 'bg-slate-700/60 text-slate-200 border border-slate-600';

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex flex-col gap-3 shadow-lg shadow-slate-900/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-sky-900/50 border border-sky-600/50 flex items-center justify-center text-sky-200">
            <WrenchIcon className="w-4 h-4" />
          </div>
          <div className="text-lg font-semibold text-slate-100">{title}</div>
          {badge && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-sky-700/60 text-sky-100 border border-sky-600/60">
              {badge}
            </span>
          )}
        </div>
        <span className={`text-xs px-2 py-1 rounded-full ${statusColor}`}>{statusLabel}</span>
      </div>
      <p className="text-sm text-slate-300 leading-relaxed">{desc}</p>
      {actions || (
        <div className="flex items-center gap-2">
          <button
            disabled
            className="px-3 py-1.5 text-sm rounded-md bg-slate-700 text-slate-400 border border-slate-600 cursor-not-allowed"
            title="功能将在 Electron 端实现"
          >
            敬请期待
          </button>
          <span className="text-xs text-slate-500">具体功能将在 Electron 中完成</span>
        </div>
      )}
    </div>
  );
};

const ToolsPage: React.FC = () => {
  const { navigateTo } = useStore((s) => ({ navigateTo: s.navigateTo }));
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
  const [targetFiles, setTargetFiles] = useState<File[]>([]);
  const [isTransferring, setIsTransferring] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const targetInputRef = useRef<HTMLInputElement>(null);

  const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.transferMarkers;
  const canConvertM4a = typeof window !== 'undefined' && !!window.electronAPI?.convertM4aToMp3;

  const [m4aFiles, setM4aFiles] = useState<File[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [convertMsg, setConvertMsg] = useState<string | null>(null);
  const m4aInputRef = useRef<HTMLInputElement>(null);

  const sourceList = useMemo(
    () => sourceFiles.map((f) => ({ name: f.name, path: (f as any).path, count: '?' })),
    [sourceFiles]
  );
  const targetList = useMemo(
    () => targetFiles.map((f) => ({ name: f.name, path: (f as any).path })),
    [targetFiles]
  );

  const handleFiles = useCallback((files: FileList | null, kind: 'source' | 'target') => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    if (kind === 'source') setSourceFiles(arr);
    else setTargetFiles(arr);
  }, []);

  const handleM4aFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files).filter((f) => (f.name || '').toLowerCase().endsWith('.m4a'));
    setM4aFiles(arr);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, kind: 'source' | 'target') => {
      e.preventDefault();
      const files = e.dataTransfer.files;
      handleFiles(files, kind);
    },
    [handleFiles]
  );

  const handleBrowse = useCallback(
    (kind: 'source' | 'target') => {
      const ref = kind === 'source' ? sourceInputRef : targetInputRef;
      ref.current?.click();
    },
    []
  );

  const handleBrowseM4a = useCallback(() => {
    m4aInputRef.current?.click();
  }, []);

  const handleTransfer = useCallback(async () => {
    if (!isElectron) {
      alert('当前为浏览器模式，需在 Electron 中使用标记迁移。');
      return;
    }
    if (sourceFiles.length === 0 || targetFiles.length === 0) {
      alert('请先拖入源音频和目标音频。');
      return;
    }
    const sources = sourceFiles.map((f: any) => f.path).filter(Boolean);
    const targets = targetFiles.map((f: any) => f.path).filter(Boolean);
    if (sources.length === 0 || targets.length === 0) {
      alert('未获取到文件路径，请在 Electron 环境中操作。');
      return;
    }

    setIsTransferring(true);
    setResultMsg(null);
    try {
      const res = await window.electronAPI!.transferMarkers!({
        sources,
        targets,
        outputDir: null,
        overwrite: true,
      });
      if (!res.success) {
        setResultMsg(res.error || '迁移失败');
        alert(res.error || '迁移失败');
      } else {
        const okCount = res.results.filter((r) => r.ok).length;
        const fail = res.results.filter((r) => !r.ok);
        const msgLines = [
          `迁移完成：成功 ${okCount} / ${res.results.length}`,
          ...fail.slice(0, 5).map((f) => `失败: ${f.target || f.source} (${f.error || '未知'})`),
        ];
        setResultMsg(msgLines.join('\n'));
        alert(msgLines.join('\n'));
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      setResultMsg(msg);
      alert(`迁移失败: ${msg}`);
    } finally {
      setIsTransferring(false);
    }
  }, [isElectron, sourceFiles, targetFiles]);

  const handleConvert = useCallback(async () => {
    if (!canConvertM4a) {
      alert('当前为浏览器模式，需在 Electron 中使用批量转码。');
      return;
    }
    if (m4aFiles.length === 0) {
      alert('请先拖入或选择 .m4a 文件。');
      return;
    }

    const paths = m4aFiles.map((f: any) => f.path).filter(Boolean);
    if (paths.length === 0) {
      alert('未获取到文件路径，请在 Electron 环境中操作。');
      return;
    }

    setIsConverting(true);
    setConvertMsg(null);
    try {
      const res = await window.electronAPI!.convertM4aToMp3!({
        files: paths,
        bitrateKbps: 320,
        overwrite: true,
      });

      const okCount = res.results.filter((r) => r.ok).length;
      const fail = res.results.filter((r) => !r.ok);
      const msgLines = [
        `转换完成：成功 ${okCount} 个，失败 ${fail.length} 个。`,
        fail.length > 0 ? `失败列表：\n${fail.map((r) => `- ${r.input}: ${r.error || '未知错误'}`).join('\n')}` : '',
      ].filter(Boolean);
      setConvertMsg(msgLines.join('\n'));
      if (!res.success) alert(res.error || '部分文件转换失败');
    } catch (e: any) {
      const msg = e?.message || String(e);
      setConvertMsg(msg);
      alert(msg);
    } finally {
      setIsConverting(false);
    }
  }, [canConvertM4a, m4aFiles]);

  return (
    <div className="h-full w-full flex flex-col bg-slate-900 text-slate-100">
      <div className="border-b border-slate-800 bg-slate-850/80 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigateTo('editor')}
            className="flex items-center px-3 py-1.5 text-sm rounded-md bg-slate-800 text-slate-200 border border-slate-700 hover:border-sky-500 hover:text-sky-100 transition"
            title="返回项目编辑"
          >
            <ArrowLeftIcon className="w-4 h-4 mr-1" />
            返回编辑
          </button>
          <div>
            <h1 className="text-2xl font-bold text-sky-400">辅助工具</h1>
            <p className="text-sm text-slate-400">为工作流提供批量、小工具支持（功能在 Electron 侧落地）。</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 border border-slate-700">
            <CloudArrowDownIcon className="w-4 h-4 text-sky-300" />
            <span>依赖本地 Audition 标记</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 border border-slate-700">
            <ArrowPathIcon className="w-4 h-4 text-emerald-300" />
            <span>跨音频批量迁移</span>
          </div>
        </div>
      </div>

      <div className="flex-grow overflow-y-auto p-6 space-y-5">
        {/* 批量转码：m4a -> mp3 */}
        <div className="bg-slate-850 border border-slate-800 rounded-2xl p-5 shadow-lg shadow-slate-900/30">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-emerald-900/50 border border-emerald-600/50 flex items-center justify-center text-emerald-200">
                <WrenchIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xl font-semibold text-slate-50">批量 m4a → mp3</div>
                <div className="text-sm text-slate-400">
                  320k · 输出原目录 · 覆盖同名 mp3 · 保留元数据（需在 Electron 中使用）。
                </div>
              </div>
            </div>
            <button
              onClick={handleConvert}
              disabled={!canConvertM4a || isConverting || m4aFiles.length === 0}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs border transition',
                !canConvertM4a || isConverting || m4aFiles.length === 0
                  ? 'bg-slate-700 text-slate-500 border-slate-600 cursor-not-allowed'
                  : 'bg-emerald-700 hover:bg-emerald-600 text-white border-emerald-500'
              )}
              title={canConvertM4a ? '开始转换（Electron）' : '需在 Electron 中使用'}
            >
              {isConverting ? '转换中…' : '开始转换'}
            </button>
          </div>

          <div
            className={cn(
              'bg-slate-800/80 border border-slate-700 rounded-xl p-4 flex flex-col gap-3',
              m4aFiles.length > 0 ? 'border-emerald-600/70' : ''
            )}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleM4aFiles(e.dataTransfer.files);
            }}
          >
            <div className="flex items-center justify-between text-sm text-slate-200">
              <span>m4a 文件</span>
              <button onClick={handleBrowseM4a} className="text-xs text-sky-300 hover:text-sky-100">
                选择文件
              </button>
            </div>
            <div className="flex flex-col flex-grow gap-2">
              <div className="border-2 border-dashed border-slate-600 rounded-lg p-4 text-center text-slate-300 bg-slate-900/60">
                <UploadIcon className="w-6 h-6 mx-auto text-sky-300" />
                <p className="mt-2 text-sm">将 m4a 文件拖到这里</p>
                <p className="text-xs text-slate-500">会在原目录生成同名 mp3（覆盖同名）</p>
                {!canConvertM4a && <p className="text-[11px] text-amber-300 mt-2">需在 Electron 中使用</p>}
              </div>
              <div className="text-xs text-slate-400">
                {m4aFiles.length === 0 ? (
                  <span>已选：无</span>
                ) : (
                  <>
                    <span>已选 {m4aFiles.length} 个</span>
                    <div className="mt-1 space-y-1 max-h-36 overflow-y-auto">
                      {m4aFiles.map((f: any) => (
                        <div
                          key={`${f.name}-${f.path || ''}`}
                          className="flex items-center justify-between bg-slate-750/80 rounded px-2 py-1"
                        >
                          <span className="truncate" title={f.path || f.name}>
                            {f.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {convertMsg && (
            <div className="mt-3 text-sm text-slate-200 bg-slate-800/80 border border-slate-700 rounded-lg p-3 whitespace-pre-wrap">
              {convertMsg}
            </div>
          )}
          <input
            ref={m4aInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleM4aFiles(e.target.files)}
            accept=".m4a"
          />
        </div>

        {/* 标记迁移：源/目标双列上传区 */}
        <div className="bg-slate-850 border border-slate-800 rounded-2xl p-5 shadow-lg shadow-slate-900/30">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-sky-900/60 border border-sky-600/50 flex items-center justify-center text-sky-200">
                <WrenchIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xl font-semibold text-slate-50">Audition 标记跨音频迁移</div>
                <div className="text-sm text-slate-400">拖入源音频（已含标记）和目标音频，后续由 Electron 执行标记复制。</div>
              </div>
            </div>
            <span className="text-xs px-2 py-1 rounded-full bg-sky-800/70 text-sky-100 border border-sky-600/60">
              UI 就绪 · 功能待接入
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
            <div
              className={cn(
                'bg-slate-800/80 border border-slate-700 rounded-xl p-4 flex flex-col gap-3',
                'transition',
                sourceFiles.length > 0 ? 'border-sky-600/70' : ''
              )}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, 'source')}
            >
              <div className="flex items-center justify-between text-sm text-slate-200">
                <span>源音频（含标记）</span>
                <button
                  onClick={() => handleBrowse('source')}
                  className="text-xs text-sky-300 hover:text-sky-100"
                >
                  选择文件
                </button>
              </div>
              <div className="flex flex-col flex-grow gap-2">
                <div className="border-2 border-dashed border-slate-600 rounded-lg p-4 text-center text-slate-300 bg-slate-900/60">
                  <UploadIcon className="w-6 h-6 mx-auto text-sky-300" />
                  <p className="mt-2 text-sm">将含 Audition 标记的音频拖到这里</p>
                  <p className="text-xs text-slate-500">示例：第001集 xxx.mp3</p>
                </div>
                <div className="text-xs text-slate-400">
                  {sourceList.length === 0 ? (
                    <span>已选：无</span>
                  ) : (
                    <>
                      <span>已选 {sourceList.length} 个</span>
                      <div className="mt-1 space-y-1 max-h-28 overflow-y-auto">
                        {sourceList.map((f) => (
                          <div key={f.name} className="flex items-center justify-between bg-slate-750/80 rounded px-2 py-1">
                            <span className="truncate" title={f.path || f.name}>{f.name}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="hidden lg:flex items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-slate-300">
                <ArrowsRightLeftIcon className="w-8 h-8 text-sky-300" />
                <div className="text-sm">将标记批量迁移到右侧音频</div>
                <button
                  onClick={handleTransfer}
                  disabled={isTransferring || sourceFiles.length === 0 || targetFiles.length === 0 || !isElectron}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs border transition',
                    isTransferring || sourceFiles.length === 0 || targetFiles.length === 0 || !isElectron
                      ? 'bg-slate-700 text-slate-500 border-slate-600 cursor-not-allowed'
                      : 'bg-sky-700 hover:bg-sky-600 text-white border-sky-500'
                  )}
                  title={isElectron ? '执行标记迁移（Electron）' : '需在 Electron 中使用'}
                >
                  {isTransferring ? '迁移中…' : '开始迁移'}
                </button>
                {!isElectron && <div className="text-[11px] text-amber-300">需在 Electron 中使用</div>}
              </div>
            </div>

            <div
              className={cn(
                'bg-slate-800/80 border border-slate-700 rounded-xl p-4 flex flex-col gap-3',
                targetFiles.length > 0 ? 'border-emerald-600/70' : ''
              )}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, 'target')}
            >
              <div className="flex items-center justify-between text-sm text-slate-200">
                <span>目标音频（待写入标记）</span>
                <button
                  onClick={() => handleBrowse('target')}
                  className="text-xs text-sky-300 hover:text-sky-100"
                >
                  选择文件
                </button>
              </div>
              <div className="flex flex-col flex-grow gap-2">
                <div className="border-2 border-dashed border-slate-600 rounded-lg p-4 text-center text-slate-300 bg-slate-900/60">
                  <ArrowDownTrayIcon className="w-6 h-6 mx-auto text-emerald-300" />
                  <p className="mt-2 text-sm">将需写入标记的音频拖到这里</p>
                  <p className="text-xs text-slate-500">示例：第001集 xxx_Vocals.mp3</p>
                </div>
                <div className="text-xs text-slate-400">
                  {targetList.length === 0 ? (
                    <span>已选：无</span>
                  ) : (
                    <>
                      <span>已选 {targetList.length} 个</span>
                      <div className="mt-1 space-y-1 max-h-28 overflow-y-auto">
                        {targetList.map((f) => (
                          <div key={f.name} className="flex items-center justify-between bg-slate-750/80 rounded px-2 py-1">
                            <span className="truncate" title={f.path || f.name}>{f.name}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
          {resultMsg && (
            <div className="mt-3 text-sm text-slate-200 bg-slate-800/80 border border-slate-700 rounded-lg p-3 whitespace-pre-wrap">
              {resultMsg}
            </div>
          )}
          <input
            ref={sourceInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files, 'source')}
            accept=".mp3,.wav,.flac,.m4a,.aac,.ogg,.wma"
          />
          <input
            ref={targetInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files, 'target')}
            accept=".mp3,.wav,.flac,.m4a,.aac,.ogg,.wma"
          />
        </div>
      </div>
    </div>
  );
};

export default ToolsPage;
