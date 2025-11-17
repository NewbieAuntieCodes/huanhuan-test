import React, { useEffect, useMemo, useState } from 'react';
import { Chapter, Character, TextMarker } from '../../../types';
import { useStore } from '../../../store/useStore';
import { XMarkIcon } from '../../../components/ui/icons';

interface PostTextAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  chapters: Chapter[];
  projectId: string;
  characters: Character[];
}

type InsertToken =
  | { kind: 'sfx'; name: string; aiCompPos: number }
  | { kind: 'bgm'; name: string; aiCompPos: number }
  | { kind: 'bgm_end'; aiCompPos: number }
  | { kind: 'scene'; name: string; aiCompPos: number };

type LinePos = { chapterId: string; lineId: string; offset: number };

const whitespaceRe = /\s/;

// 更宽松模式：把常见等价字符规范化，用于匹配定位（不影响最终写回的原文）
const normalizeChar = (ch: string): string => {
  // 双引号
  if ('“”„‟«»「」『』﹁﹂＂"'.includes(ch)) return '"';
  // 单引号
  if ('‘’‚‛‹›﹃﹄＇\''.includes(ch)) return '\'';
  // 省略号：统一为点
  if (ch === '…') return '.';
  // 破折号/短横
  if ('—–‐‑‒−﹘﹣-'.includes(ch)) return '-';
  // 其他保持原样
  return ch;
};

const isQuoteDialogue = (t: string) => {
  const s = t.trim();
  if (!s) return false;
  // Chinese or ASCII quotes
  const open = '“"「『';
  const close = '”"」』';
  return (open.includes(s[0]) && close.includes(s[s.length - 1])) || /\".*\"/.test(s);
};

const isSfxCharacter = (name?: string) => {
  if (!name) return false;
  const n = name.toLowerCase();
  return n === 'sfx' || n.includes('音效') || n.includes('[音效]');
};

const isNarratorCharacter = (name?: string) => {
  if (!name) return false;
  const n = name.toLowerCase();
  return n === 'narrator' || n.includes('旁白');
};

const buildBaseFromChapters = (
  chapters: Chapter[],
  characters: Character[]
) => {
  let base = '';
  const charToMap: LinePos[] = [];
  const charMapPush = (chapterId: string, lineId: string, offset: number, ch: string) => {
    base += ch;
    charToMap.push({ chapterId, lineId, offset });
  };
  const includeLine = (chId: string | undefined, text: string) => {
    const c = characters.find((c) => c.id === chId);
    if (!c) return true; // 未知角色，默认纳入
    if (isSfxCharacter(c.name)) return false;
    if (isNarratorCharacter(c.name)) return true;
    return isQuoteDialogue(text);
  };

  chapters.forEach((ch) => {
    ch.scriptLines.forEach((ln, idx) => {
      const text = ln.text || '';
      if (!includeLine(ln.characterId, text)) return;
      for (let i = 0; i < text.length; i++) {
        charMapPush(ch.id, ln.id, i, text[i]);
      }
      // normalize to single newline between lines
      charMapPush(ch.id, ln.id, text.length, '\n');
    });
    // chapter separator: extra newline (mapped to last line of chapter if exists)
    if (ch.scriptLines.length > 0) {
      const last = ch.scriptLines[ch.scriptLines.length - 1];
      charMapPush(ch.id, last.id, (last.text || '').length, '\n');
    }
  });

  // compressed base (remove whitespace) and mapping back to original index
  const compChars: number[] = [];
  let comp = '';
  for (let i = 0; i < base.length; i++) {
    const ch = base[i];
    if (!whitespaceRe.test(ch)) {
      comp += normalizeChar(ch);
      compChars.push(i);
    }
  }

  return { base, charToMap, comp, compIndexToOrigIndex: compChars };
};

const tokenizeAiResult = (aiText: string) => {
  // --- Pre-clean common wrappers & escapes ---
  let cleaned = aiText
    .replace(/\uFEFF/g, '') // BOM
    .replace(/[\u200B\u200C\u200D\u00A0]/g, ' ') // zero-width & nbsp -> space
    // strip code fences but keep inner content
    .replace(/```[a-zA-Z]*\s*/g, '')
    .replace(/```/g, '')
    // drop helper headers if model echoed them
    .replace(/^\s*[【\[]?待处理文本开始[】\]]?\s*$/gm, '')
    .replace(/^\s*[【\[]?待处理文本结束[】\]]?\s*$/gm, '')
    .replace(/^\s*(处理后的文本|输出|结果)[:：]?\s*$/gm, '')
    // HTML escapes that sometimes appear
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ');

  const tokens: InsertToken[] = [];
  // also produce compressed AI (no whitespace) without markers and scene-only lines
  let comp = '';
  let aiCompPos = 0; // number of non-whitespace chars consumed (excluding markers/scene lines)

  const lines = cleaned.split(/\r?\n/);
  for (let li = 0; li < lines.length; li++) {
    const rawLine = lines[li];
    const trimmed = rawLine.trim();
    // scene line pattern: 分割线 + 名称，如 —— 名称 —— / ==== 名称 ====
    const sceneMatch = trimmed.match(/^[-=—]{2,}\s*([^-=—\s].*?)\s*[-=—]{2,}$/);
    const sceneLabelMatch = trimmed.match(/^场景[：:]\s*(.+)$/);
    const isSceneLine = !!(sceneMatch || sceneLabelMatch);

    if (isSceneLine) {
      const name = (sceneMatch?.[1] || sceneLabelMatch?.[1] || '').trim();
      if (name) tokens.push({ kind: 'scene', name, aiCompPos });
      continue;
    }

    // parse non-scene lines: scan for [..], <..>, // and accumulate text chars for comp
    for (let i = 0; i < rawLine.length; ) {
      const ch = rawLine[i];
      // BGM end
      if (ch === '/' && rawLine[i + 1] === '/') {
        tokens.push({ kind: 'bgm_end', aiCompPos });
        i += 2;
        continue;
      }
      // Helper to find next index of any char in a set
      const indexOfAny = (s: string, set: string[], start: number) => {
        for (let k = start; k < s.length; k++) if (set.includes(s[k])) return k;
        return -1;
      };
      // SFX markers: 只接受严格的 [ ]
      if (ch === '[') {
        const end = rawLine.indexOf(']', i + 1);
        if (end > i) {
          const name = rawLine.substring(i + 1, end).trim();
          if (name) tokens.push({ kind: 'sfx', name, aiCompPos });
          i = end + 1;
          continue;
        }
      }
      // BGM markers: 只接受严格的 < >
      if (ch === '<') {
        const end = rawLine.indexOf('>', i + 1);
        if (end > i) {
          const name = rawLine.substring(i + 1, end).trim();
          if (name) tokens.push({ kind: 'bgm', name, aiCompPos });
          i = end + 1;
          continue;
        }
      }
      // normal char contributes to compressed stream (unless whitespace)
      if (!whitespaceRe.test(ch)) {
        comp += ch;
        aiCompPos++;
      }
      i++;
    }
    // newline -> doesn't contribute to comp
  }

  return { tokens, aiComp: comp };
};

const PostTextAssistantModal: React.FC<PostTextAssistantModalProps> = ({ isOpen, onClose, chapters, projectId, characters }) => {
  const { updateLineText, updateProjectTextMarkers, projects } = useStore((s) => ({
    updateLineText: s.updateLineText,
    updateProjectTextMarkers: s.updateProjectTextMarkers,
    projects: s.projects,
  }));

  const [applySfx, setApplySfx] = useState(true);
  const [applyBgm, setApplyBgm] = useState(true);
  const [applyScenes, setApplyScenes] = useState(true);
  const [pasted, setPasted] = useState('');
  const [copyAllFiltered, setCopyAllFiltered] = useState(true);
  const [previewMsg, setPreviewMsg] = useState<string>('');
  const [canApply, setCanApply] = useState(false);
  const [changedCount, setChangedCount] = useState({ sfx: 0, bgm: 0, bgmEnd: 0, scenes: 0 });

  const base = useMemo(() => buildBaseFromChapters(chapters, characters), [chapters, characters]);
  const originalTextForCopy = useMemo(() => base.base, [base.base]);

  const promptText = useMemo(() => {
    const asks: string[] = [];
    if (applySfx) asks.push('音效使用中括号标记：[名称]');
    if (applyBgm) asks.push('音乐使用尖括号标记：<名称>，且在音乐结束处插入 //');
    if (applyScenes) asks.push('场景使用一行“分割线 + 场景名称”（例如—— 场景名 ——或===== 场景名 =====）表示场景开始');

    const requireLine = asks.length > 0 ? `请执行：${asks.join('；')}。` : '';

    return [
      '你是后期文本标注助手。',
      '在不改变原文任何字符（包括字词、标点、引号、空格与换行）的前提下，只在合适的位置插入标记。',
      requireLine,
      '严格要求：',
      '1) 不允许改写或增删原文；行数与顺序必须保持不变；',
      '2) 只在需要的地方插入标记；不要猜测不存在的内容；',
      '3) 最终只输出“处理后的文本”，不要任何解释、前后缀、标题或代码块标记；',
      '4) 输出必须与原文完全等长字符序列+新增标记的关系（对齐到原文）；',
      '',
      '【待处理文本开始】',
      originalTextForCopy,
      '【待处理文本结束】',
      '',
      '注意：最终回答必须只包含处理后的文本本身，不要包含“待处理文本开始/结束”等分隔符。'
    ].filter(Boolean).join('\n');
  }, [originalTextForCopy, applySfx, applyBgm, applyScenes]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(promptText);
      setPreviewMsg('已复制提示词+原文到剪贴板');
    } catch {
      setPreviewMsg('复制失败，请手动全选复制');
    }
  };

  useEffect(() => {
    if (!pasted.trim()) {
      setPreviewMsg('');
      setCanApply(false);
// FIX: The 'changedCount' state update was missing the 'bgmEnd' property, causing a TypeScript error.
// The property has been added with a default value of 0 to match the state's type definition.
      setChangedCount({ sfx: 0, bgm: 0, bgmEnd: 0, scenes: 0 });
      return;
    }
    const { tokens } = tokenizeAiResult(pasted);
    const counts = tokens.reduce(
      (acc, t) => {
        if (t.kind === 'sfx') acc.sfx++;
        if (t.kind === 'bgm') acc.bgm++;
        if (t.kind === 'bgm_end') acc.bgmEnd++;
        if (t.kind === 'scene') acc.scenes++;
        return acc;
      },
      { sfx: 0, bgm: 0, bgmEnd: 0, scenes: 0 }
    );
    setChangedCount(counts);
    if (counts.sfx + counts.bgm + counts.bgmEnd + counts.scenes > 0) {
      setPreviewMsg(`解析到标记：SFX ${counts.sfx} 个，BGM开始 ${counts.bgm} 个，BGM结束(//) ${counts.bgmEnd} 个，场景 ${counts.scenes} 个。可应用。`);
      setCanApply(true);
    } else {
      setPreviewMsg('未解析到任何有效标记（[] / <> / 场景分割线）。');
      setCanApply(false);
    }
  }, [pasted]);

  const applyChanges = async () => {
    const { tokens, aiComp } = tokenizeAiResult(pasted);
    const baseComp = base.comp;

    // 在 baseComp 中查找与 AI 位置相近的插入点（使用左右上下文 + 窗口搜索）
    const findInsertCompIndex = (aiPos: number): { index: number; reason?: string } => {
      const ctx = 14;
      const win = Math.max(200, Math.floor(baseComp.length * 0.02));
      const aiLen = Math.max(aiComp.length, 1);
      const center = Math.floor((aiPos / aiLen) * baseComp.length);
      const start = Math.max(0, center - win);
      const end = Math.min(baseComp.length, center + win);
      const leftCtx = aiComp.slice(Math.max(0, aiPos - ctx), aiPos);
      const rightCtx = aiComp.slice(aiPos, Math.min(aiComp.length, aiPos + ctx));
      const region = baseComp.slice(start, end);
      if (leftCtx) {
        const rel = region.lastIndexOf(leftCtx);
        if (rel !== -1) return { index: start + rel + leftCtx.length };
      }
      if (rightCtx) {
        const rel = region.indexOf(rightCtx);
        if (rel !== -1) return { index: start + rel, reason: 'fallback-right' };
      }
      return { index: Math.min(Math.max(center, 0), baseComp.length), reason: 'fallback-center' };
    };

    const compToLinePos = (baseCompIndex: number): LinePos | null => {
      if (baseCompIndex < 0 || baseCompIndex >= base.compIndexToOrigIndex.length) return null;
      const origIdx = base.compIndexToOrigIndex[baseCompIndex];
      if (origIdx < 0 || origIdx >= base.charToMap.length) return null;
      return base.charToMap[origIdx];
    };

    const perLine: Record<string, { chapterId: string; inserts: { pos: number; text: string }[]; original: string } > = {};
    const lineOriginalCache = new Map<string, string>();
    chapters.forEach((ch) => ch.scriptLines.forEach((ln) => lineOriginalCache.set(ln.id, ln.text || '')));

    let applied = { sfx: 0, bgm: 0, bgmEnd: 0 };
    let skipped = { sfx: 0, bgm: 0, bgmEnd: 0, scene: 0 };

    for (const t of tokens) {
      if ((t.kind === 'sfx' && !applySfx) || ((t.kind === 'bgm' || t.kind === 'bgm_end') && !applyBgm)) continue;
      if (t.kind === 'scene') continue; // 场景后面单独处理
      const found = findInsertCompIndex(t.aiCompPos);
      const pos = compToLinePos(found.index);
      if (!pos) { 
        if (t.kind === 'sfx') skipped.sfx++; 
        else if (t.kind === 'bgm') skipped.bgm++; 
        else if (t.kind === 'bgm_end') skipped.bgmEnd++;
        continue; 
      }
      const key = pos.lineId;
      if (!perLine[key]) perLine[key] = { chapterId: pos.chapterId, inserts: [], original: lineOriginalCache.get(key) || '' };
      if (t.kind === 'sfx') { perLine[key].inserts.push({ pos: pos.offset, text: `[${t.name}]` }); applied.sfx++; }
      if (t.kind === 'bgm') { perLine[key].inserts.push({ pos: pos.offset, text: `<?-${t.name}>` }); applied.bgm++; }
      if (t.kind === 'bgm_end') { perLine[key].inserts.push({ pos: pos.offset, text: `//` }); applied.bgmEnd++; }
    }

    // 应用逐行插入
    for (const [lineId, rec] of Object.entries(perLine)) {
      const { chapterId, inserts } = rec;
      if (inserts.length === 0) continue;
      inserts.sort((a, b) => a.pos - b.pos);
      let txt = rec.original;
      let delta = 0;
      for (const ins of inserts) {
        const p = Math.max(0, Math.min(txt.length, ins.pos + delta));
        txt = txt.slice(0, p) + ins.text + txt.slice(p);
        delta += ins.text.length;
      }
      await updateLineText(projectId, chapterId, lineId, txt);
      lineOriginalCache.set(lineId, txt);
    }

    // 场景范围
    if (applyScenes) {
      const sceneBounds = tokens.filter(t => t.kind === 'scene') as Extract<InsertToken, { kind: 'scene' }>[];
      const toLineOffsetByAiPos = (p: number): LinePos | null => {
        const f = findInsertCompIndex(p);
        return compToLinePos(f.index);
      };
      const currentProject = projects.find((p) => p.id === projectId);
      const existing = currentProject?.textMarkers || [];
      const newMarkers: TextMarker[] = [...existing];
      let running: { startPos: number; name: string } | null = null;
      for (const b of sceneBounds) {
        if (running) {
          const s = toLineOffsetByAiPos(running.startPos);
          const e = toLineOffsetByAiPos(b.aiCompPos);
          if (s && e) {
            const id = `scene_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            newMarkers.push({ id, type: 'scene', name: running.name, startLineId: s.lineId, startOffset: s.offset, endLineId: e.lineId, endOffset: e.offset });
          } else {
            skipped.scene++;
          }
        }
        running = { startPos: b.aiCompPos, name: b.name };
      }
      if (running) {
        const s = toLineOffsetByAiPos(running.startPos);
        const endComp = base.compIndexToOrigIndex.length - 1;
        const e = compToLinePos(endComp);
        if (s && e) {
          const id = `scene_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          newMarkers.push({ id, type: 'scene', name: running.name, startLineId: s.lineId, startOffset: s.offset, endLineId: e.lineId, endOffset: e.offset });
        } else {
          skipped.scene++;
        }
      }
      await updateProjectTextMarkers(projectId, newMarkers);
    }

    setPreviewMsg(`已应用：SFX ${applied.sfx}，BGM开始 ${applied.bgm}，BGM结束(//) ${applied.bgmEnd}。跳过：SFX ${skipped.sfx}，BGM开始 ${skipped.bgm}，BGM结束(//) ${skipped.bgmEnd}，场景 ${skipped.scene}。`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[120] p-4" onClick={onClose}>
      <div className="bg-slate-800 w-full max-w-5xl max-h-[85vh] overflow-hidden rounded-lg border border-slate-700" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h3 className="text-lg font-semibold text-slate-100">后期文本辅助（手动AI模式）</h3>
          <button onClick={onClose} className="p-1.5 text-slate-300 hover:text-white"><XMarkIcon /></button>
        </div>
        <div className="grid grid-cols-2 gap-0 divide-x divide-slate-700">
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-slate-200 font-medium">复制提示词 + 原文</h4>
              <button onClick={handleCopy} className="px-2 py-1 text-sm bg-sky-600 hover:bg-sky-700 rounded-md text-white">一键复制</button>
            </div>
            <textarea readOnly value={promptText} className="w-full h-[55vh] p-2 bg-slate-900 text-slate-100 rounded-md border border-slate-700" />
            <p className="text-xs text-slate-400">提示词已包含格式要求与原文：旁白 + 带引号台词（已过滤静音/音效角色）。</p>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-slate-200 font-medium">粘贴AI结果并预览</h4>
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <label className="flex items-center gap-1"><input type="checkbox" checked={applySfx} onChange={(e)=>setApplySfx(e.target.checked)} />SFX []</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={applyBgm} onChange={(e)=>setApplyBgm(e.target.checked)} />BGM &lt;&gt;</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={applyScenes} onChange={(e)=>setApplyScenes(e.target.checked)} />场景</label>
                <button disabled={!canApply} onClick={applyChanges} className={`px-2 py-1 rounded-md ${canApply ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-600 text-slate-400 cursor-not-allowed'}`}>应用</button>
              </div>
            </div>
            <textarea value={pasted} onChange={(e)=>setPasted(e.target.value)} placeholder="把AI返回的文本粘贴到这里：SFX 使用 [xxx]，BGM 使用 <xxx>，BGM 结束使用 //，场景使用 分割线+名称。" className="w-full h-[45vh] p-2 bg-slate-900 text-slate-100 rounded-md border border-slate-700" />
            <div className="text-xs text-slate-300">{previewMsg || '等待粘贴结果...'}</div>
            <div className="text-xs text-slate-400">将要插入：SFX {changedCount.sfx} 个，BGM {changedCount.bgm} 个，场景 {changedCount.scenes} 个。</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostTextAssistantModal;
