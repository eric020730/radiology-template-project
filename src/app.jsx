import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import './app.css';

// 定義 Storage Key (若有改結構建議換名以防衝突)
const STORAGE_KEY = 'radiologyTemplatesConfig_v3';

// 判斷是否為舊版 v2 結構（left/right 為 Template[]）
function isLegacyV2Tabs(tabs) {
    if (!tabs?.length) return false;
    const firstLeft = tabs[0].left;
    if (!Array.isArray(firstLeft) || !firstLeft.length) return false;
    const first = firstLeft[0];
    return first && 'content' in first && !('items' in first);
}

// 將 v2 的 left/right (Template[]) 轉成 v3 的 Group[]
function migrateV2ToV3(tabs) {
    return tabs.map(tab => ({
        ...tab,
        left: [{ id: `g-left-${tab.id}-${Date.now()}`, name: '預設', items: tab.left || [] }],
        right: [{ id: `g-right-${tab.id}-${Date.now()}`, name: '預設', items: tab.right || [] }]
    }));
}

// --- 純函式：不依賴 App 狀態，可安全放在模組層級 ---
function hasLeftRight(content) {
    if (!content) return { hasLeft: false, hasRight: false, hasRightSlashBilateral: false };
    const hasLeft = /\bleft\b|左/i.test(content);
    const hasRight = /\bright\b|右/i.test(content);
    const hasRightSlashBilateral = /\bright\s*\/\s*bilateral\b/i.test(content);
    return { hasLeft, hasRight, hasRightSlashBilateral };
}

function hasEnlargedPattern(content) {
    if (!content) return false;
    return /No\s+enlarged\s*\/\s*Borderline\s+enlarged\s*\/\s*Enlarged/i.test(content);
}

function hasSeverityPattern(content) {
    if (!content) return false;
    return /Mild\s*\/\s*Moderate\s*\/\s*Severe/i.test(content);
}

function hasLobePattern(content) {
    if (!content) return false;
    return /\b(RUL|RML|RLL|LUL|LLL)\b/i.test(content);
}

// --- TemplateButton：定義在模組層級以確保 Preact 有穩定的元件引用 ---
function TemplateButton({ template, side, groupId, index, showEditButtons, ctx }) {
    const {
        copiedId, hoveredTemplateInEdit, setHoveredTemplateInEdit,
        dragState, dropTarget, dragGroupState,
        didDragRef, dragOffsetRef, dragPayloadRef,
        setDragState, setDragGhost, setDropTarget,
        moveTemplateRef,
        copyToClipboard, copyLeftRight, copyEnlarged, copySeverity, copyLobe,
        showDeleteConfirm, startEdit,
    } = ctx;

    const templateKey = `${side}-${groupId}-${template.id}`;
    const isHoveredInEdit = showEditButtons && hoveredTemplateInEdit === templateKey;
    const isDragging = dragState?.template?.id === template.id;
    const isDropTarget = dropTarget?.side === side && dropTarget?.groupId === groupId && dropTarget?.index === index;
    const buttonClass = copiedId === template.id
        ? 'bg-emerald-500 text-white shadow-inner scale-[0.98] copied-animation'
        : 'bg-white border border-slate-200 text-slate-700 hover:border-blue-400 hover:text-blue-600 shadow-sm hover:shadow-md';

    const { hasLeft, hasRight, hasRightSlashBilateral } = hasLeftRight(template.content);
    const hasEnlarged = hasEnlargedPattern(template.content);
    const hasSeverity = hasSeverityPattern(template.content);
    const hasLobe = hasLobePattern(template.content);

    const startCustomDrag = (e) => {
        e.preventDefault();
        if (!showEditButtons) return;
        didDragRef.current = true;
        const payload = { sourceSide: side, sourceGroupId: groupId, sourceIndex: index };
        dragPayloadRef.current = payload;
        setDragState({ template, ...payload });
        const card = e.currentTarget.closest('[data-drop-zone]');
        if (card) {
            const rect = card.getBoundingClientRect();
            dragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            setDragGhost({ x: rect.left, y: rect.top, width: rect.width, height: rect.height, name: template.name });
        }
        const onMove = (ev) => {
            setDragGhost(prev => prev ? {
                ...prev,
                x: ev.clientX - dragOffsetRef.current.x,
                y: ev.clientY - dragOffsetRef.current.y
            } : null);
            const el = document.elementFromPoint(ev.clientX, ev.clientY);
            const zone = el?.closest?.('[data-drop-zone]');
            if (zone) {
                const s = zone.getAttribute('data-side');
                const g = zone.getAttribute('data-group-id');
                const i = zone.getAttribute('data-index');
                if (s && g && i !== null) setDropTarget({ side: s, groupId: g, index: parseInt(i, 10) });
            } else setDropTarget(null);
        };
        const onUp = (ev) => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            setDragGhost(null);
            const el = document.elementFromPoint(ev.clientX, ev.clientY);
            const zone = el?.closest?.('[data-drop-zone]');
            const src = dragPayloadRef.current;
            if (zone && src) {
                const tSide = zone.getAttribute('data-side');
                const tGroupId = zone.getAttribute('data-group-id');
                const tIndex = parseInt(zone.getAttribute('data-index'), 10);
                if (tSide && tGroupId && !isNaN(tIndex) && moveTemplateRef.current) {
                    moveTemplateRef.current(src.sourceSide, src.sourceGroupId, src.sourceIndex, tSide, tGroupId, tIndex);
                }
            }
            dragPayloadRef.current = null;
            setDragState(null);
            setDropTarget(null);
            setTimeout(() => { didDragRef.current = false; }, 100);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };

    return (
        <div
            data-drop-zone
            data-side={side}
            data-group-id={groupId}
            data-index={index}
            onMouseEnter={() => { if (showEditButtons) setHoveredTemplateInEdit(templateKey); }}
            onMouseLeave={() => { if (showEditButtons) setHoveredTemplateInEdit(null); }}
            className={`relative group rounded-lg h-12 transition-colors ${isDropTarget ? 'ring-2 ring-blue-400 ring-inset bg-blue-50/80' : ''} ${isDragging ? 'opacity-50' : ''}`}
        >
            <div className={`flex w-full h-full rounded-lg overflow-hidden ${buttonClass}`}>
                <span
                    role="button"
                    tabIndex={0}
                    onMouseDown={showEditButtons ? startCustomDrag : undefined}
                    onClick={showEditButtons ? (ev) => ev.preventDefault() : () => { copyToClipboard(template); }}
                    onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); if (!showEditButtons) copyToClipboard(template); } }}
                    className={`template-drag-handle w-4 shrink-0 touch-none rounded-l-lg block select-none flex items-center justify-center ${
                        showEditButtons ? 'cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600' : 'cursor-pointer'
                    }`}
                    title={showEditButtons ? '拖曳可移動' : '點擊複製'}
                >
                </span>
                <button
                    type="button"
                    onClick={() => {
                        if (showEditButtons) return;
                        copyToClipboard(template);
                    }}
                    onMouseDown={showEditButtons ? startCustomDrag : undefined}
                    className={`flex-1 px-3 py-3 rounded-r-lg font-medium transition-all duration-200 text-left flex justify-between items-center min-w-0 border-0 bg-transparent text-inherit relative h-full ${showEditButtons ? 'cursor-grab active:cursor-grabbing' : ''}`}
                >
                    <span className="truncate mr-2">{template.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                        {(hasLeft || hasRight) && !showEditButtons && (
                            <div className="flex items-center gap-[4px] ml-1">
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); copyLeftRight(template, 'right'); }}
                                    className={`text-[10px] font-bold rounded transition-all z-10 relative flex items-center justify-center shrink-0 ${
                                        copiedId === `${template.id}-right`
                                            ? 'bg-emerald-500 text-white scale-110'
                                            : 'bg-pink-50 text-pink-400 hover:bg-pink-100 active:scale-95'
                                    }`}
                                    title={hasRightSlashBilateral ? "刪除 bilateral" : "複製原始內容"}
                                    style={{ width: '20px', height: '20px' }}
                                >R</button>
                                {hasRightSlashBilateral && (
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); copyLeftRight(template, 'bilateral'); }}
                                        className={`text-[10px] font-bold rounded transition-all z-10 relative flex items-center justify-center shrink-0 ${
                                            copiedId === `${template.id}-bilateral`
                                                ? 'bg-emerald-500 text-white scale-110'
                                                : 'bg-yellow-100 text-yellow-600 hover:bg-yellow-200 active:scale-95'
                                        }`}
                                        title="刪除 right/，只留下 bilateral"
                                        style={{ width: '20px', height: '20px' }}
                                    >B</button>
                                )}
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); copyLeftRight(template, 'left'); }}
                                    className={`text-[10px] font-bold rounded transition-all z-10 relative flex items-center justify-center shrink-0 ${
                                        copiedId === `${template.id}-left`
                                            ? 'bg-emerald-500 text-white scale-110'
                                            : 'bg-sky-100 text-sky-500 hover:bg-sky-200 active:scale-95'
                                    }`}
                                    title={hasRightSlashBilateral ? "刪除 bilateral 且 right 改成 left" : "複製內容並將 left/right 互換"}
                                    style={{ width: '20px', height: '20px' }}
                                >L</button>
                            </div>
                        )}
                        {hasEnlarged && !showEditButtons && (
                            <div className="flex items-center gap-[4px] ml-1">
                                <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); copyEnlarged(template, 'small'); }}
                                    className={`text-[10px] font-bold rounded transition-all z-10 relative flex items-center justify-center shrink-0 ${copiedId === `${template.id}-enlarged-small` ? 'bg-emerald-500 text-white scale-110' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95'}`}
                                    title="替換為 No enlarged" style={{ width: '20px', height: '20px' }}>小</button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); copyEnlarged(template, 'medium'); }}
                                    className={`text-[10px] font-bold rounded transition-all z-10 relative flex items-center justify-center shrink-0 ${copiedId === `${template.id}-enlarged-medium` ? 'bg-emerald-500 text-white scale-110' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95'}`}
                                    title="替換為 Borderline enlarged" style={{ width: '20px', height: '20px' }}>中</button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); copyEnlarged(template, 'large'); }}
                                    className={`text-[10px] font-bold rounded transition-all z-10 relative flex items-center justify-center shrink-0 ${copiedId === `${template.id}-enlarged-large` ? 'bg-emerald-500 text-white scale-110' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95'}`}
                                    title="替換為 Enlarged" style={{ width: '20px', height: '20px' }}>大</button>
                            </div>
                        )}
                        {hasSeverity && !showEditButtons && (
                            <div className="flex items-center gap-[4px] ml-1">
                                <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); copySeverity(template, 'mild'); }}
                                    className={`text-[10px] font-bold rounded transition-all z-10 relative flex items-center justify-center shrink-0 ${copiedId === `${template.id}-severity-mild` ? 'bg-emerald-500 text-white scale-110' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95'}`}
                                    title="替換為 Mild" style={{ width: '20px', height: '20px' }}>輕</button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); copySeverity(template, 'moderate'); }}
                                    className={`text-[10px] font-bold rounded transition-all z-10 relative flex items-center justify-center shrink-0 ${copiedId === `${template.id}-severity-moderate` ? 'bg-emerald-500 text-white scale-110' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95'}`}
                                    title="替換為 Moderate" style={{ width: '20px', height: '20px' }}>中</button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); copySeverity(template, 'severe'); }}
                                    className={`text-[10px] font-bold rounded transition-all z-10 relative flex items-center justify-center shrink-0 ${copiedId === `${template.id}-severity-severe` ? 'bg-emerald-500 text-white scale-110' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95'}`}
                                    title="替換為 Severe" style={{ width: '20px', height: '20px' }}>重</button>
                            </div>
                        )}
                        {hasLobe && !showEditButtons && (
                            <div className="flex items-center gap-1 ml-1">
                                <div className="flex flex-col gap-0.5">
                                    <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); copyLobe(template, 'rul'); }}
                                        className={`text-[8px] font-bold px-1 py-0.5 rounded transition-all z-10 relative ${copiedId === `${template.id}-lobe-rul` ? 'bg-emerald-500 text-white scale-110' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95'}`}
                                        title="替換為 RUL" style={{ minWidth: '16px', minHeight: '16px', lineHeight: '1' }}>上</button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); copyLobe(template, 'rml'); }}
                                        className={`text-[8px] font-bold px-1 py-0.5 rounded transition-all z-10 relative ${copiedId === `${template.id}-lobe-rml` ? 'bg-emerald-500 text-white scale-110' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95'}`}
                                        title="替換為 RML" style={{ minWidth: '16px', minHeight: '16px', lineHeight: '1' }}>中</button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); copyLobe(template, 'rll'); }}
                                        className={`text-[8px] font-bold px-1 py-0.5 rounded transition-all z-10 relative ${copiedId === `${template.id}-lobe-rll` ? 'bg-emerald-500 text-white scale-110' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95'}`}
                                        title="替換為 RLL" style={{ minWidth: '16px', minHeight: '16px', lineHeight: '1' }}>下</button>
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); copyLobe(template, 'lul'); }}
                                        className={`text-[8px] font-bold px-1 py-0.5 rounded transition-all z-10 relative ${copiedId === `${template.id}-lobe-lul` ? 'bg-emerald-500 text-white scale-110' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95'}`}
                                        title="替換為 LUL" style={{ minWidth: '16px', minHeight: '16px', lineHeight: '1' }}>上</button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); copyLobe(template, 'lll'); }}
                                        className={`text-[8px] font-bold px-1 py-0.5 rounded transition-all z-10 relative ${copiedId === `${template.id}-lobe-lll` ? 'bg-emerald-500 text-white scale-110' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95'}`}
                                        title="替換為 LLL" style={{ minWidth: '16px', minHeight: '16px', lineHeight: '1' }}>下</button>
                                </div>
                            </div>
                        )}
                        {isHoveredInEdit && (
                            <div className="flex items-center gap-[4px] ml-1" onMouseDown={(e) => e.stopPropagation()}>
                                <button type="button" onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => { e.stopPropagation(); showDeleteConfirm(template, side); }}
                                    className="text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded transition-all flex items-center justify-center shrink-0"
                                    title="刪除" style={{ width: 20, height: 20, minWidth: 20, minHeight: 20, fontSize: 12, lineHeight: 1 }}>🗑️</button>
                                <button type="button" onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => { e.stopPropagation(); startEdit(template, side); }}
                                    className="text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded transition-all flex items-center justify-center shrink-0"
                                    title="編輯" style={{ width: 20, height: 20, minWidth: 20, minHeight: 20, fontSize: 12, lineHeight: 1 }}>✏️</button>
                            </div>
                        )}
                    </div>
                </button>
            </div>
            {dragGroupState && (
                <div
                    className="absolute inset-0 min-w-full min-h-full z-[9999] rounded-lg cursor-grabbing pointer-events-auto"
                    style={{ background: 'rgba(0,0,0,0.001)' }}
                    onDragEnter={(e) => {
                        e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move';
                        const container = e.currentTarget.closest('[data-group-container]');
                        if (container) { const s = container.getAttribute('data-side'); const i = container.getAttribute('data-index'); if (s && i != null) ctx.setDropGroupTarget({ side: s, index: parseInt(i, 10) }); }
                    }}
                    onDragOver={(e) => {
                        e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move';
                        const container = e.currentTarget.closest('[data-group-container]');
                        if (container) { const s = container.getAttribute('data-side'); const i = container.getAttribute('data-index'); if (s && i != null) ctx.setDropGroupTarget({ side: s, index: parseInt(i, 10) }); }
                    }}
                    onDrop={(e) => {
                        e.preventDefault(); e.stopPropagation();
                        if (dragGroupState && ctx.dropGroupTarget) {
                            if (dragGroupState.side === 'left' && ctx.dropGroupTarget.side === 'left') ctx.reorderGroups('left', dragGroupState.index, ctx.dropGroupTarget.index);
                            else if (dragGroupState.side === 'right' && ctx.dropGroupTarget.side === 'left') ctx.moveGroupBetweenSides('right', dragGroupState.index, 'left', ctx.dropGroupTarget.index);
                            else if (dragGroupState.side === 'right' && ctx.dropGroupTarget.side === 'right') ctx.reorderGroups('right', dragGroupState.index, ctx.dropGroupTarget.index);
                            else if (dragGroupState.side === 'left' && ctx.dropGroupTarget.side === 'right') ctx.moveGroupBetweenSides('left', dragGroupState.index, 'right', ctx.dropGroupTarget.index);
                        }
                        ctx.setDragGroupState(null); ctx.setDropGroupTarget(null);
                    }}
                    aria-hidden
                />
            )}
        </div>
    );
}

export function App() {
    // 預設資料結構：完全空白，單一頁籤、無分組無組套
    const defaultTabs = [
        {
            id: 'tab-default',
            name: '新頁籤',
            left: [],
            right: []
        }
    ];

    const [tabs, setTabs] = useState(defaultTabs);
    const [activeTabIdx, setActiveTabIdx] = useState(0); // 目前顯示第幾個頁籤
    
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [deleteConfirmTemplate, setDeleteConfirmTemplate] = useState(null); // 待確認刪除的組套
    const [deleteConfirmGroup, setDeleteConfirmGroup] = useState(null); // 待確認刪除的分組 { groupId, side }
    const [editingGroupName, setEditingGroupName] = useState(null); // { groupId, side } 正在編輯分組名稱
    const [editingGroupsLeft, setEditingGroupsLeft] = useState(false);  // 左側是否顯示「新增/刪除分組」
    const [editingGroupsRight, setEditingGroupsRight] = useState(false); // 右側是否顯示「新增/刪除分組」
    const [editingTemplatesGroup, setEditingTemplatesGroup] = useState(null); // { groupId, side } 正在編輯組套的分組，此模式下才顯示刪除/編輯按鈕
    const [editingTabName, setEditingTabName] = useState(false); // 是否正在修改頁籤名稱
    const [showSettings, setShowSettings] = useState(false);
    const [breastNoduleGroupParams, setBreastNoduleGroupParams] = useState({ sizeWStr: '0', sizeHStr: '0', clock: null, distStr: '0', activeField: null });
    const [breastNoduleSentenceTemplate, setBreastNoduleSentenceTemplate] = useState("A {W}x{H}cm small hypoechoic nodule at {C}'{D} from nipple.");
    const [breastNodulePendingTexts, setBreastNodulePendingTexts] = useState([]); // 暫存多顆結節的句子，搭配 M 鍵使用
    const [editingSentenceTemplate, setEditingSentenceTemplate] = useState(false);
    const [lastDistKeyPressed, setLastDistKeyPressed] = useState(null);
    const [copiedId, setCopiedId] = useState(null);
    const [syncStatus, setSyncStatus] = useState('本地儲存');
    const [dragState, setDragState] = useState(null);   // { template, sourceGroupId, sourceSide, sourceIndex }
    const [dropTarget, setDropTarget] = useState(null); // { side, groupId, index }
    const [dragGhost, setDragGhost] = useState(null);   // 拖曳時跟隨游標的按鈕 { x, y, width, height, name }
    const [dragGroupState, setDragGroupState] = useState(null); // { side, groupId, index } 正在拖曳的分組
    const [dropGroupTarget, setDropGroupTarget] = useState(null); // { side, index } 分組拖放目標（插入到該 index）
    const [dragTabState, setDragTabState] = useState(null); // { index } 正在拖曳的頁籤索引
    const [dropTabTarget, setDropTabTarget] = useState(null); // { index } 頁籤拖放目標（插入到該 index）
    const [dragTabGhost, setDragTabGhost] = useState(null);  // 拖曳頁籤時跟隨游標的幽靈 { x, y, width, height, name }
    const [tabBarHovered, setTabBarHovered] = useState(false); // 游標是否在頁籤列上（控制左右箭頭顯示）
    const [hoveredTemplateInEdit, setHoveredTemplateInEdit] = useState(null); // 編輯組套模式下，游標懸停的組套 key："side-groupId-templateId"
    const didDragRef = useRef(false);
    const dragPayloadRef = useRef(null); // 自訂拖曳時暫存來源 { sourceSide, sourceGroupId, sourceIndex }
    const dragOffsetRef = useRef({ x: 0, y: 0 });      // 拖曳起點在按鈕內的偏移
    const moveTemplateRef = useRef(null);
    const swapTemplatesRef = useRef(null);
    const leftGroupsContainerRef = useRef(null);  // 左側分組容器 ref
    const rightGroupsContainerRef = useRef(null); // 右側分組容器 ref
    const tabEditAreaRef = useRef(null);          // 當前頁籤標題與操作區域 ref
    const tabScrollRef = useRef(null);            // 頁籤欄左右滑動容器 ref
    
    const [config, setConfig] = useState({
        spreadsheetId: '',
        apiKey: '',
        scriptUrl: '',
        isConnected: false
    });
    const [toast, setToast] = useState(null); // { message, type: 'success'|'error' }，3 秒後自動消失
    const toastTimerRef = useRef(null);
    const showToast = (message, type = 'success') => {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setToast({ message, type });
        toastTimerRef.current = setTimeout(() => { setToast(null); toastTimerRef.current = null; }, 3000);
    };

    // 取得當前頁籤的資料方便操作
    const activeTab = tabs[activeTabIdx] || tabs[0];

    // 將名稱為「乳房結節描述」的分組補上 type，避免因匯入或外部腳本改動而失去特殊 UI
    const ensureBreastNoduleTypes = (tabsData) => {
        if (!Array.isArray(tabsData)) return tabsData;
        return tabsData.map(tab => ({
            ...tab,
            left: (tab.left || []).map(g =>
                g.name === '乳房結節描述'
                    ? { ...g, type: g.type || 'breastNodule' }
                    : g
            ),
            right: (tab.right || []).map(g =>
                g.name === '乳房結節描述'
                    ? { ...g, type: g.type || 'breastNodule' }
                    : g
            )
        }));
    };

    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY)
                || localStorage.getItem('radiologyTemplatesConfig_v2'); // 相容 v2
            if (saved) {
                try {
                    const data = JSON.parse(saved);
                    if (data.tabs && Array.isArray(data.tabs)) {
                        const baseTabs = isLegacyV2Tabs(data.tabs) ? migrateV2ToV3(data.tabs) : data.tabs;
                        const tabsData = ensureBreastNoduleTypes(baseTabs);
                        setTabs(tabsData);
                        if (typeof data.activeTabIdx === 'number' && data.activeTabIdx >= 0 && data.activeTabIdx < tabsData.length) {
                            setActiveTabIdx(data.activeTabIdx);
                        }
                    }
                    if (data.config) setConfig(data.config);
                } catch (e) {
                    console.error("讀取舊存檔失敗", e);
                }
            }
        } catch (e) {
            console.error("localStorage 存取失敗", e);
        }
    }, []);

    // 點擊外部區域關閉編輯分組模式
    useEffect(() => {
        const handleClickOutside = (event) => {
            // 如果點擊在設定按鈕或設定面板上，不處理
            if (event.target.closest('[data-settings-button]') || event.target.closest('[data-settings-panel]')) {
                return;
            }
            // 檢查是否點擊在左側分組容器外
            if (editingGroupsLeft && leftGroupsContainerRef.current && !leftGroupsContainerRef.current.contains(event.target)) {
                setEditingGroupsLeft(false);
            }
            // 檢查是否點擊在右側分組容器外
            if (editingGroupsRight && rightGroupsContainerRef.current && !rightGroupsContainerRef.current.contains(event.target)) {
                setEditingGroupsRight(false);
            }
        };

        if (editingGroupsLeft || editingGroupsRight) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => {
                document.removeEventListener('mousedown', handleClickOutside);
            };
        }
    }, [editingGroupsLeft, editingGroupsRight]);

    // 點擊外部區域關閉編輯組套模式
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (!editingTemplatesGroup) return;
            
            // 如果點擊在設定按鈕或設定面板上，不處理
            if (event.target.closest('[data-settings-button]') || event.target.closest('[data-settings-panel]')) {
                return;
            }
            
            // 如果正在拖曳，忽略點擊外部區域的邏輯
            if (didDragRef.current || dragState) return;
            
            // 如果正在編輯組套（編輯視窗開啟），則不關閉編輯組套模式
            // 因為編輯視窗的點擊不應該觸發關閉邏輯
            if (editingTemplate) return;
            
            // 如果點擊在刪除確認視窗內，不關閉編輯組套模式
            const deleteConfirmModal = event.target.closest('[data-delete-confirm-modal]');
            if (deleteConfirmModal) return;
            
            // 查找點擊的目標是否在當前編輯的分組內
            const clickedGroup = event.target.closest('[data-group-container]');
            const currentGroupId = editingTemplatesGroup.groupId;
            const currentSide = editingTemplatesGroup.side;
            
            // 如果點擊不在任何分組內，或點擊的分組不是當前編輯的分組，則關閉編輯模式
            if (!clickedGroup || clickedGroup.getAttribute('data-group-id') !== currentGroupId || clickedGroup.getAttribute('data-group-side') !== currentSide) {
                setEditingTemplatesGroup(null);
            }
        };

        if (editingTemplatesGroup) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => {
                document.removeEventListener('mousedown', handleClickOutside);
            };
        }
    }, [editingTemplatesGroup, dragState, editingTemplate]);

    // 點擊頁籤欄與分組區以外區域時，離開「編輯頁籤名稱」模式（視同點擊完成）
    // 含 tabEditAreaRef、左/右分組容器，這樣點「新增分組」＋ 不會被當成點擊外部而關閉
    useEffect(() => {
        if (!editingTabName) return;

        const handleClickOutsideTabEdit = (event) => {
            // 如果點擊在設定按鈕或設定面板上，不處理
            if (event.target.closest('[data-settings-button]') || event.target.closest('[data-settings-panel]')) {
                return;
            }
            // 若正在拖曳頁籤，不要因 mousedown 關閉編輯模式（避免一點就視為完成）
            if (dragTabState) return;
            const inTabEdit = tabEditAreaRef.current?.contains(event.target);
            const inTabBar = event.target.closest('[data-tab-bar]');
            const inLeftGroups = leftGroupsContainerRef.current?.contains(event.target);
            const inRightGroups = rightGroupsContainerRef.current?.contains(event.target);
            if (!inTabEdit && !inTabBar && !inLeftGroups && !inRightGroups) {
                setEditingTabName(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutsideTabEdit);
        return () => {
            document.removeEventListener('mousedown', handleClickOutsideTabEdit);
        };
    }, [editingTabName, dragTabState]);

    // 點擊「乳房結節描述」組套外時，尺寸與方位、距離數字歸零
    // 使用 functional updater 並檢查值是否真的改變，避免不必要的 re-render
    useEffect(() => {
        const handleClickOutsideBreastNodule = (event) => {
            if (event.target.closest('[data-settings-button]') || event.target.closest('[data-settings-panel]') || event.target.closest('[data-delete-confirm-modal]')) return;
            if (event.target.closest('[data-breast-nodule-group]')) return;
            setBreastNoduleGroupParams(prev => {
                if (prev.sizeWStr === '0' && prev.sizeHStr === '0' && prev.clock === null && prev.distStr === '0' && prev.activeField === null) return prev;
                return { sizeWStr: '0', sizeHStr: '0', clock: null, distStr: '0', activeField: null };
            });
            setLastDistKeyPressed(prev => prev === null ? prev : null);
            setBreastNodulePendingTexts(prev => prev.length === 0 ? prev : []);
        };
        document.addEventListener('mousedown', handleClickOutsideBreastNodule);
        return () => document.removeEventListener('mousedown', handleClickOutsideBreastNodule);
    }, []);

    // 正在編輯分組名稱時，點擊該分組以外的區域 → 視為結束編輯；若未輸入內容（空白或仍為「新分組」）則刪除該分組
    useEffect(() => {
        if (!editingGroupName) return;

        const handleClickOutsideGroup = (event) => {
            // 如果點擊在設定按鈕或設定面板上，不處理
            if (event.target.closest('[data-settings-button]') || event.target.closest('[data-settings-panel]')) {
                return;
            }
            const inDeleteModal = event.target.closest('[data-delete-confirm-modal]');
            if (inDeleteModal) return;

            const clickedGroup = event.target.closest('[data-group-container]');
            const isCurrentGroup =
                clickedGroup &&
                clickedGroup.getAttribute('data-group-id') === editingGroupName.groupId &&
                clickedGroup.getAttribute('data-group-side') === editingGroupName.side;
            if (isCurrentGroup) return;

            const input = document.querySelector(`[data-group-container][data-group-id="${editingGroupName.groupId}"][data-group-side="${editingGroupName.side}"] input`);
            const valueFromInput = input?.value;
            finishEditingGroupName(editingGroupName.side, editingGroupName.groupId, valueFromInput);
        };

        document.addEventListener('mousedown', handleClickOutsideGroup);
        return () => document.removeEventListener('mousedown', handleClickOutsideGroup);
    }, [editingGroupName, tabs]);

    // 離開編輯組套模式時清除懸停狀態
    useEffect(() => {
        if (!editingTemplatesGroup) setHoveredTemplateInEdit(null);
    }, [editingTemplatesGroup]);

    const saveToLocal = (newTabs, currentConfig = config, currentActiveTabIdx = activeTabIdx) => {
        const data = {
            tabs: newTabs,
            config: currentConfig,
            lastUpdated: new Date().toISOString(),
            activeTabIdx: currentActiveTabIdx
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    };

    // --- Google Sheets 同步邏輯 (多頁籤版) ---

    const loadFromGoogleSheets = async () => {
        if (!config.spreadsheetId || !config.apiKey) {
            alert('請先設定 ID 和 API Key');
            return;
        }

        try {
            setSyncStatus('讀取結構中...');
            
            // 1. 先讀取試算表的 Metadata，取得所有工作表名稱
            const metaResponse = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}?key=${config.apiKey}`
            );
            const metaData = await metaResponse.json();
            
            if (!metaData.sheets) throw new Error('無法讀取試算表結構');

            setSyncStatus('下載內容中...');
            const newTabs = [];
            let breastNoduleTemplateFromSheets = null;

            // 2. 遍歷每一個 Sheet，讀取 A:F 欄位（分組版：左 A,B,C / 右 D,E,F）
            for (const sheet of metaData.sheets) {
                const title = sheet.properties.title;
                const range = `${title}!A2:F`; // A=左分組名 B=左名稱 C=左內容 / D=右分組名 E=右名稱 F=右內容
                
                const res = await fetch(
                    `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${range}?key=${config.apiKey}`
                );
                const json = await res.json();
                const rows = json.values || [];

                const ts = Date.now();
                const leftByGroup = {}; // groupName -> items[]
                const rightByGroup = {};

                rows.forEach((row, idx) => {
                    // 左側：A=分組名, B=名稱, C=內容
                    if (row[0] != null && String(row[0]).trim() !== '' && row[1] != null) {
                        const gName = String(row[0]).trim();
                        const templateName = String(row[1]).trim();
                        const content = row[2] != null ? String(row[2]) : '';
                        if (gName === '乳房結節描述' && content) {
                            const isSentenceTemplateRow = templateName === '句子模板';
                            if (isSentenceTemplateRow || breastNoduleTemplateFromSheets == null) {
                                breastNoduleTemplateFromSheets = content;
                            }
                        }
                        if (!leftByGroup[gName]) leftByGroup[gName] = [];
                        leftByGroup[gName].push({
                            id: `L-${title}-${idx}-${ts}`,
                            name: templateName,
                            // 保留內容的原始格式（包括前導和尾隨空格），只處理 null/undefined
                            content
                        });
                    }
                    // 右側：D=分組名, E=名稱, F=內容
                    if (row[3] != null && String(row[3]).trim() !== '' && row[4] != null) {
                        const gName = String(row[3]).trim();
                        const templateName = String(row[4]).trim();
                        const content = row[5] != null ? String(row[5]) : '';
                        if (gName === '乳房結節描述' && content) {
                            const isSentenceTemplateRow = templateName === '句子模板';
                            if (isSentenceTemplateRow || breastNoduleTemplateFromSheets == null) {
                                breastNoduleTemplateFromSheets = content;
                            }
                        }
                        if (!rightByGroup[gName]) rightByGroup[gName] = [];
                        rightByGroup[gName].push({
                            id: `R-${title}-${idx}-${ts}`,
                            name: templateName,
                            // 保留內容的原始格式（包括前導和尾隨空格），只處理 null/undefined
                            content
                        });
                    }
                });

                const toGroups = (byGroup, prefix) =>
                    Object.entries(byGroup).map(([name, items], i) => ({
                        id: `${prefix}-${title}-${i}-${ts}`,
                        name,
                        items,
                        // 任何頁籤中，只要分組名稱是「乳房結節描述」，就視為乳房結節組套
                        ...(name === '乳房結節描述' ? { type: 'breastNodule' } : {})
                    }));

                newTabs.push({
                    id: `tab-${title}`,
                    name: title,
                    left: toGroups(leftByGroup, 'g-left'),
                    right: toGroups(rightByGroup, 'g-right')
                });
            }

            setTabs(newTabs);
            if (breastNoduleTemplateFromSheets != null) {
                setBreastNoduleSentenceTemplate(breastNoduleTemplateFromSheets);
            }
            setActiveTabIdx(0);
            saveToLocal(newTabs, config, 0); // 更新本地，記錄目前頁籤為 0
            setSyncStatus('匯入成功！');
            showToast(`已匯入 ${newTabs.length} 個頁籤`);
            setTimeout(() => setSyncStatus('已連接'), 2000);

        } catch (error) {
            console.error(error);
            setSyncStatus('匯入失敗');
            showToast('匯入失敗，請檢查 API Key 或 Sheet ID', 'error');
        }
    };

    const exportToGoogleSheets = async () => {
        if (!config.scriptUrl) {
            alert('請填寫 Apps Script 網址');
            return;
        }
        setShowSettings(false); // 一點匯出就馬上收起系統設定視窗
        try {
            setSyncStatus('匯出中...');
            // 傳送整個 tabs 結構給 Apps Script
            // 若為乳房結節分組，將目前句子模板寫入一個名為「句子模板」的 item，
            // 對應到 Google Sheet 的「左側組套內容 / 右側組套內容」欄位，讓你在表單中也能編輯
            const tabsForExport = tabs.map(tab => ({
                ...tab,
                left: (tab.left || []).map(group => {
                    if (group.type !== 'breastNodule') return group;
                    const baseItems = group.items || [];
                    // 移除舊的「句子模板」item，避免重複
                    const withoutTemplate = baseItems.filter(it => it.name !== '句子模板');
                    const items = [
                        ...withoutTemplate,
                        {
                            id: `${group.id}-template`,
                            name: '句子模板',
                            content: breastNoduleSentenceTemplate
                        }
                    ];
                    return { ...group, items };
                }),
                right: (tab.right || []).map(group => {
                    if (group.type !== 'breastNodule') return group;
                    const baseItems = group.items || [];
                    const withoutTemplate = baseItems.filter(it => it.name !== '句子模板');
                    const items = [
                        ...withoutTemplate,
                        {
                            id: `${group.id}-template`,
                            name: '句子模板',
                            content: breastNoduleSentenceTemplate
                        }
                    ];
                    return { ...group, items };
                })
            }));

            await fetch(config.scriptUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tabs: tabsForExport }) 
            });

            setSyncStatus('匯出成功！');
            showToast('已發送至雲端');
            setTimeout(() => setSyncStatus('已連接'), 2000);
        } catch (error) {
            showToast('匯出失敗', 'error');
        }
    };

    // --- 編輯與操作邏輯 ---

    // 檢查內容是否包含 left 和 right（支援各種格式）
    // 解析內容，提取 left 或 right 部分
    const extractLeftRight = (content, side) => {
        if (!content) return '';
        
        // 使用正則表達式查找完整的單詞（使用單詞邊界 \b）
        const leftMatch = content.match(/\bleft\b/i);
        const rightMatch = content.match(/\bright\b/i);
        const leftIndexCN = content.indexOf('左');
        const rightIndexCN = content.indexOf('右');
        
        // 使用英文或中文關鍵字
        const actualLeftIndex = leftMatch ? leftMatch.index : (leftIndexCN !== -1 ? leftIndexCN : -1);
        const actualRightIndex = rightMatch ? rightMatch.index : (rightIndexCN !== -1 ? rightIndexCN : -1);
        
        if (side === 'left') {
            if (actualLeftIndex === -1) return '';
            
            // 找到 left/左 之後的內容
            let startPos = actualLeftIndex;
            if (leftMatch) {
                startPos += leftMatch[0].length; // "left" 的實際長度
            } else if (leftIndexCN !== -1) {
                startPos += 1; // "左" 長度
            }
            
            // 如果有 right/右，提取到 right/右 之前
            if (actualRightIndex !== -1 && actualRightIndex > actualLeftIndex) {
                return content.substring(startPos, actualRightIndex).trim();
            } else {
                // 只有 left/左，提取到結尾
                return content.substring(startPos).trim();
            }
        } else if (side === 'right') {
            if (actualRightIndex === -1) return '';
            
            // 找到 right/右 之後的內容
            let startPos = actualRightIndex;
            if (rightMatch) {
                startPos += rightMatch[0].length; // "right" 的實際長度
            } else if (rightIndexCN !== -1) {
                startPos += 1; // "右" 長度
            }
            
            // 提取到結尾
            return content.substring(startPos).trim();
        }
        
        return '';
    };

    // 複製 enlarged 模式的不同選項（小/中/大）
    const copyEnlarged = async (template, size) => {
        let textToCopy = template.content;
        
        // 匹配 "No enlarged/Borderline enlarged/Enlarged" 模式
        const pattern = /No\s+enlarged\s*\/\s*Borderline\s+enlarged\s*\/\s*Enlarged/gi;
        
        if (size === 'small') {
            // 小：替換為 "No enlarged"
            textToCopy = textToCopy.replace(pattern, 'No enlarged');
        } else if (size === 'medium') {
            // 中：替換為 "Borderline enlarged"
            textToCopy = textToCopy.replace(pattern, 'Borderline enlarged');
        } else if (size === 'large') {
            // 大：替換為 "Enlarged"
            textToCopy = textToCopy.replace(pattern, 'Enlarged');
        }
        
        if (!textToCopy) {
            alert('無法複製內容');
            return;
        }
        
        try {
            await navigator.clipboard.writeText(textToCopy);
            setCopiedId(`${template.id}-enlarged-${size}`);
            setTimeout(() => setCopiedId(null), 1000);
        } catch (err) {
            // Fallback for older browsers
            const ta = document.createElement('textarea');
            ta.value = textToCopy;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            setCopiedId(`${template.id}-enlarged-${size}`);
            setTimeout(() => setCopiedId(null), 1000);
        }
    };

    // 複製 lobe 模式的不同選項（上/中/下）
    const copyLobe = async (template, lobe) => {
        let textToCopy = template.content;
        
        // 定義替換映射
        const replacements = {
            'rul': 'RUL',    // 上（右側上葉）
            'rml': 'RML',    // 中（右側中葉）
            'rll': 'RLL',    // 下（右側下葉）
            'lul': 'LUL',    // 上（左側上葉）
            'lll': 'LLL'     // 下（左側下葉）
        };
        
        const targetLobe = replacements[lobe];
        if (!targetLobe) return;
        
        // 匹配所有可能的 lobe 組合並替換為目標 lobe
        // 使用正則表達式匹配 RUL, RML, RLL, LUL, LLL（不區分大小寫）
        const pattern = /\b(RUL|RML|RLL|LUL|LLL)\b/gi;
        textToCopy = textToCopy.replace(pattern, (match) => {
            // 保持原始大小寫格式
            if (match === match.toUpperCase()) {
                return targetLobe;
            } else if (match === match.charAt(0).toUpperCase() + match.slice(1).toLowerCase()) {
                return targetLobe;
            } else {
                return targetLobe.toLowerCase();
            }
        });
        
        if (!textToCopy) {
            alert('無法複製內容');
            return;
        }
        
        try {
            await navigator.clipboard.writeText(textToCopy);
            setCopiedId(`${template.id}-lobe-${lobe}`);
            setTimeout(() => setCopiedId(null), 1000);
        } catch (err) {
            // Fallback for older browsers
            const ta = document.createElement('textarea');
            ta.value = textToCopy;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            setCopiedId(`${template.id}-lobe-${lobe}`);
            setTimeout(() => setCopiedId(null), 1000);
        }
    };

    // 複製 severity 模式的不同選項（輕/中/重）
    const copySeverity = async (template, severity) => {
        let textToCopy = template.content;
        
        // 匹配 "Mild/Moderate/Severe" 模式（不區分大小寫，允許空格變化）
        const pattern = /Mild\s*\/\s*Moderate\s*\/\s*Severe/gi;
        
        if (severity === 'mild') {
            // 輕：替換為 "Mild"
            textToCopy = textToCopy.replace(pattern, 'Mild');
        } else if (severity === 'moderate') {
            // 中：替換為 "Moderate"
            textToCopy = textToCopy.replace(pattern, 'Moderate');
        } else if (severity === 'severe') {
            // 重：替換為 "Severe"
            textToCopy = textToCopy.replace(pattern, 'Severe');
        }
        
        if (!textToCopy) {
            alert('無法複製內容');
            return;
        }
        
        try {
            await navigator.clipboard.writeText(textToCopy);
            setCopiedId(`${template.id}-severity-${severity}`);
            setTimeout(() => setCopiedId(null), 1000);
        } catch (err) {
            // Fallback for older browsers
            const ta = document.createElement('textarea');
            ta.value = textToCopy;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            setCopiedId(`${template.id}-severity-${severity}`);
            setTimeout(() => setCopiedId(null), 1000);
        }
    };

    // 輔助函數：根據原始大小寫格式轉換 left/right
    const convertWithCase = (original, target) => {
        // 如果原始是全大寫
        if (original === original.toUpperCase()) {
            return target.toUpperCase();
        }
        // 如果原始是首字母大寫
        if (original === original.charAt(0).toUpperCase() + original.slice(1).toLowerCase()) {
            return target.charAt(0).toUpperCase() + target.slice(1).toLowerCase();
        }
        // 其他情況保持小寫
        return target.toLowerCase();
    };

    // 複製 left、right 或 bilateral 部分
    const copyLeftRight = async (template, side) => {
        let textToCopy = template.content;
        const { hasRightSlashBilateral } = hasLeftRight(template.content);
        
        if (side === 'right') {
            // R 按鈕
            if (hasRightSlashBilateral) {
                // 當內容中有 right/bilateral 時，將 bilateral 刪除
                // 匹配 right/bilateral 模式並替換為 right（保持原始大小寫）
                textToCopy = textToCopy.replace(/\b(right)\s*\/\s*bilateral\b/gi, (match, rightPart) => {
                    return convertWithCase(rightPart, 'right');
                });
            } else {
                // 如果沒有 right/bilateral，複製原始內容
                textToCopy = template.content;
            }
        } else if (side === 'left') {
            // L 按鈕
            if (hasRightSlashBilateral) {
                // 當內容中有 right/bilateral 時，將 bilateral 刪除且 right 改成 left（保持原始大小寫）
                textToCopy = textToCopy.replace(/\b(right)\s*\/\s*bilateral\b/gi, (match, rightPart) => {
                    return convertWithCase(rightPart, 'left');
                });
            } else {
                // 如果沒有 right/bilateral，執行原本的 left/right 互換邏輯（保持原始大小寫）
                // 使用臨時標記避免替換衝突，同時保留大小寫信息
                // 步驟 1：將所有 left 替換為臨時標記（保留大小寫信息）
                textToCopy = textToCopy.replace(/\b(left)\b/gi, (match, leftPart) => {
                    const converted = convertWithCase(leftPart, 'right');
                    // 使用特殊標記，包含大小寫信息
                    if (leftPart === leftPart.toUpperCase()) {
                        return 'TEMP_LEFT_UPPER';
                    } else if (leftPart === leftPart.charAt(0).toUpperCase() + leftPart.slice(1).toLowerCase()) {
                        return 'TEMP_LEFT_CAPITAL';
                    } else {
                        return 'TEMP_LEFT_LOWER';
                    }
                });
                // 步驟 2：將所有 right 改為 left（保持大小寫）
                textToCopy = textToCopy.replace(/\b(right)\b/gi, (match, rightPart) => {
                    return convertWithCase(rightPart, 'left');
                });
                // 步驟 3：將臨時標記改為 right（恢復大小寫）
                textToCopy = textToCopy.replace(/TEMP_LEFT_UPPER/g, 'RIGHT');
                textToCopy = textToCopy.replace(/TEMP_LEFT_CAPITAL/g, 'Right');
                textToCopy = textToCopy.replace(/TEMP_LEFT_LOWER/g, 'right');
                
                // 處理中文：左和右
                textToCopy = textToCopy.replace(/左/g, 'TEMP_LEFT_CN');
                textToCopy = textToCopy.replace(/右/g, '左');
                textToCopy = textToCopy.replace(/TEMP_LEFT_CN/g, '右');
            }
        } else if (side === 'bilateral') {
            // B 按鈕：當內容中有 right/bilateral 時，將 right/ 刪除只留下 bilateral，並在 bilateral 後面第一個單字字尾加小寫 s
            if (hasRightSlashBilateral) {
                textToCopy = textToCopy.replace(/\bright\s*\/\s*bilateral\b/gi, 'bilateral');
                // bilateral 後面的每個單字字尾加小寫 s（例：bilateral wrist. → bilateral wrists.）
                textToCopy = textToCopy.replace(/\bbilateral\b\s+(\w+)/gi, (_match, word) => 'bilateral ' + word + 's');
            } else {
                // 如果沒有 right/bilateral，複製原始內容
                textToCopy = template.content;
            }
        }
        
        if (!textToCopy) {
            alert('無法複製內容');
            return;
        }
        
        try {
            await navigator.clipboard.writeText(textToCopy);
            setCopiedId(`${template.id}-${side}`);
            setTimeout(() => setCopiedId(null), 1000);
        } catch (err) {
            // Fallback for older browsers
            const ta = document.createElement('textarea');
            ta.value = textToCopy;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            setCopiedId(`${template.id}-${side}`);
            setTimeout(() => setCopiedId(null), 1000);
        }
    };

    const copyToClipboard = async (template) => {
        const text = template.content;
        try {
            await navigator.clipboard.writeText(text);
            setCopiedId(template.id);
            setTimeout(() => setCopiedId(null), 1000);
        } catch (err) {
            // Fallback for older browsers
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            setCopiedId(template.id);
            setTimeout(() => setCopiedId(null), 1000);
        }
    };

    const startEdit = (template, side) => {
        setEditingTemplate({ ...template, side });
    };

    const saveTemplateEdit = () => {
        if (!editingTemplate) return;
        if (editingTemplate._isNew) {
            const newTemplate = {
                id: `${editingTemplate.side === 'left' ? 'L' : 'R'}-new-${Date.now()}`,
                name: editingTemplate.name || '',
                content: editingTemplate.content || ''
            };
            const updatedTabs = tabs.map((tab, ti) => {
                if (ti !== activeTabIdx) return tab;
                const groups = editingTemplate._targetSide === 'left' ? [...tab.left] : [...tab.right];
                const next = groups.map(g =>
                    g.id === editingTemplate._targetGroupId ? { ...g, items: [...g.items, newTemplate] } : g
                );
                return editingTemplate._targetSide === 'left' ? { ...tab, left: next } : { ...tab, right: next };
            });
            setTabs(updatedTabs);
            saveToLocal(updatedTabs);
            setEditingTemplate(null);
            setEditingTemplatesGroup(null); // 新增組套儲存後視為編輯完成，關閉編輯組套模式
        } else {
            const { id, side } = editingTemplate;
            const updatedTabs = tabs.map((tab, ti) => {
                if (ti !== activeTabIdx) return tab;
                const groups = side === 'left' ? [...tab.left] : [...tab.right];
                const next = groups.map(g => ({
                    ...g,
                    items: g.items.map(t => t.id === id ? editingTemplate : t)
                }));
                return side === 'left' ? { ...tab, left: next } : { ...tab, right: next };
            });
            setTabs(updatedTabs);
            saveToLocal(updatedTabs);
            setEditingTemplate(null);
        }
    };

    const cancelTemplateEdit = () => {
        if (editingTemplate?._isNew) setEditingTemplatesGroup(null);
        setEditingTemplate(null);
    };

    const showDeleteConfirm = (template, side) => {
        setDeleteConfirmTemplate({ ...template, side });
    };

    const confirmDeleteTemplate = () => {
        if (!deleteConfirmTemplate) return;
        const { id, side } = deleteConfirmTemplate;
        const updatedTabs = tabs.map((tab, ti) => {
            if (ti !== activeTabIdx) return tab;
            const groups = side === 'left' ? [...tab.left] : [...tab.right];
            const next = groups.map(g => ({ ...g, items: g.items.filter(t => t.id !== id) }));
            return side === 'left' ? { ...tab, left: next } : { ...tab, right: next };
        });
        setTabs(updatedTabs);
        saveToLocal(updatedTabs);
        setDeleteConfirmTemplate(null);
        if (editingTemplate?.id === id) setEditingTemplate(null);
    };

    const moveTemplate = (sourceSide, sourceGroupId, sourceIndex, targetSide, targetGroupId, targetIndex) => {
        if (sourceSide === targetSide && sourceGroupId === targetGroupId && sourceIndex === targetIndex) return;
        const updatedTabs = tabs.map((tab, ti) => {
            if (ti !== activeTabIdx) return tab;
            const leftGroups = tab.left.map(g => ({ ...g, items: [...g.items] }));
            const rightGroups = tab.right.map(g => ({ ...g, items: [...g.items] }));
            const getGroups = (side) => side === 'left' ? leftGroups : rightGroups;
            const srcGroups = getGroups(sourceSide);
            const srcGroup = srcGroups.find(g => g.id === sourceGroupId);
            if (!srcGroup || sourceIndex < 0 || sourceIndex >= srcGroup.items.length) return tab;
            const [moved] = srcGroup.items.splice(sourceIndex, 1);
            const tgtGroups = getGroups(targetSide);
            const tgtGroup = tgtGroups.find(g => g.id === targetGroupId);
            if (!tgtGroup) return tab;
            let insertIndex = Math.max(0, Math.min(targetIndex, tgtGroup.items.length));
            if (sourceSide === targetSide && sourceGroupId === targetGroupId && sourceIndex < insertIndex) insertIndex -= 1;
            tgtGroup.items.splice(insertIndex, 0, moved);
            return { ...tab, left: leftGroups, right: rightGroups };
        });
        setTabs(updatedTabs);
        saveToLocal(updatedTabs);
        setDragState(null);
        setDropTarget(null);
    };

    /** 與目標位置的按鈕對調（拖到某按鈕上放開 = 兩者互換位置） */
    const swapTemplates = (sourceSide, sourceGroupId, sourceIndex, targetSide, targetGroupId, targetIndex) => {
        if (sourceSide === targetSide && sourceGroupId === targetGroupId && sourceIndex === targetIndex) return;
        const updatedTabs = tabs.map((tab, ti) => {
            if (ti !== activeTabIdx) return tab;
            const leftGroups = tab.left.map(g => ({ ...g, items: [...g.items] }));
            const rightGroups = tab.right.map(g => ({ ...g, items: [...g.items] }));
            const getGroups = (side) => side === 'left' ? leftGroups : rightGroups;
            const srcGroups = getGroups(sourceSide);
            const srcGroup = srcGroups.find(g => g.id === sourceGroupId);
            const tgtGroups = getGroups(targetSide);
            const tgtGroup = tgtGroups.find(g => g.id === targetGroupId);
            if (!srcGroup || sourceIndex < 0 || sourceIndex >= srcGroup.items.length) return tab;
            if (!tgtGroup || targetIndex < 0 || targetIndex >= tgtGroup.items.length) return tab;
            const sourceItem = srcGroup.items[sourceIndex];
            const targetItem = tgtGroup.items[targetIndex];
            srcGroup.items[sourceIndex] = targetItem;
            tgtGroup.items[targetIndex] = sourceItem;
            return { ...tab, left: leftGroups, right: rightGroups };
        });
        setTabs(updatedTabs);
        saveToLocal(updatedTabs);
        setDragState(null);
        setDropTarget(null);
    };
    moveTemplateRef.current = moveTemplate;
    swapTemplatesRef.current = swapTemplates;

    // 點「新增組套」只開編輯視窗，按下「儲存」才加入分組
    const addTemplateToGroup = (side, groupId) => {
        const draft = {
            id: `new-draft-${Date.now()}`,
            name: '',
            content: '',
            _isNew: true,
            _targetSide: side,
            _targetGroupId: groupId
        };
        setEditingTemplate({ ...draft, side });
    };

    // 新增分組
    const addGroup = (side) => {
        const newGroup = {
            id: `g-${side}-${Date.now()}`,
            name: '新分組',
            items: []
        };
        const updatedTabs = [...tabs];
        const tab = { ...updatedTabs[activeTabIdx] };
        if (side === 'left') tab.left = [...(tab.left || []), newGroup];
        else tab.right = [...(tab.right || []), newGroup];
        updatedTabs[activeTabIdx] = tab;
        setTabs(updatedTabs);
        saveToLocal(updatedTabs);
        setEditingGroupName({ groupId: newGroup.id, side });
    };

    const addBreastNoduleGroup = (side) => {
        const newGroup = {
            id: `g-${side}-breast-${Date.now()}`,
            name: '乳房結節描述',
            type: 'breastNodule',
            items: []
        };
        const updatedTabs = [...tabs];
        const tab = { ...updatedTabs[activeTabIdx] };
        if (side === 'left') tab.left = [...(tab.left || []), newGroup];
        else tab.right = [...(tab.right || []), newGroup];
        updatedTabs[activeTabIdx] = tab;
        setTabs(updatedTabs);
        saveToLocal(updatedTabs);
        setEditingGroupName({ groupId: newGroup.id, side });
    };

    const formatSizeDisplay = (str, placeholder) => {
        if (!str) return placeholder;
        if (str === '0') return '0';
        if (str.includes('.')) return str;
        return `0.${str}`;
    };

    const parseSizeValue = (str) => {
        if (!str) return 0;
        if (str.includes('.')) return parseFloat(str) || 0;
        return parseFloat(`0.${str}`) || 0;
    };

    const applyBreastNoduleKeypad = (key) => {
        if (key === 'C') setBreastNodulePendingTexts([]);
        setBreastNoduleGroupParams((p) => {
            const { activeField, sizeWStr, sizeHStr, distStr } = p;
            if (key === 'C') {
                if (activeField === 'sizeW' || activeField === 'sizeH' || activeField === null) return { ...p, sizeWStr: '0', sizeHStr: '0', activeField: null, reEnterPending: false };
                return { ...p, distStr: '' };
            }
            if (activeField === null) {
                if (key === '.') return p;
                return { ...p, sizeWStr: key, activeField: 'sizeW', reEnterPending: false };
            }
            if (activeField === 'sizeW') {
                if (p.reEnterPending && key !== '.') {
                    return { ...p, sizeWStr: key, reEnterPending: false };
                }
                if (key === '.') {
                    if (sizeWStr && !sizeWStr.includes('.') && sizeWStr !== '0') return { ...p, sizeWStr: sizeWStr + '.', reEnterPending: false };
                    return p;
                }
                if (!sizeWStr || sizeWStr === '0') return { ...p, sizeWStr: key, reEnterPending: false };
                if (sizeWStr.includes('.')) {
                    if ((sizeWStr.split('.')[1] || '').length >= 1) return p;
                    return { ...p, sizeWStr: sizeWStr + key, activeField: 'sizeH', reEnterPending: false };
                }
                return { ...p, sizeHStr: key, activeField: 'sizeH', reEnterPending: false };
            }
            if (activeField === 'sizeH') {
                // 與「長」相同概念：只要目前停留在「寬」，按數字就視為重新輸入，
                // 但仍保留一位小數的邏輯
                if (key === '.') {
                    // 只有在目前已經有整數、沒有小數點、且不是 0 時才允許加小數點
                    if (sizeHStr && !sizeHStr.includes('.') && sizeHStr !== '0') {
                        return { ...p, sizeHStr: sizeHStr + '.', reEnterPending: false };
                    }
                    return p;
                }
                // 數字鍵：若目前是空字串/0，或剛從方框點選進來（reEnterPending），一律視為重新輸入
                if (p.reEnterPending || !sizeHStr || sizeHStr === '0') {
                    return { ...p, sizeHStr: key, reEnterPending: false };
                }
                // 若已有小數點，且小數位數 < 1，則補上一位小數
                if (sizeHStr.includes('.')) {
                    if ((sizeHStr.split('.')[1] || '').length >= 1) return p;
                    return { ...p, sizeHStr: sizeHStr + key, reEnterPending: false };
                }
                // 其他情況（例如非 0 的整數，沒有小數點），一律視為重新輸入
                return { ...p, sizeHStr: key, reEnterPending: false };
            }
            const next = distStr + key;
            return { ...p, distStr: next };
        });
    };

    // 刪除分組（含確認）
    const showDeleteGroupConfirm = (groupId, side) => {
        setDeleteConfirmGroup({ groupId, side });
    };

    const confirmDeleteGroup = () => {
        if (!deleteConfirmGroup) return;
        const { groupId, side } = deleteConfirmGroup;
        const updatedTabs = tabs.map((tab, ti) => {
            if (ti !== activeTabIdx) return tab;
            const arr = side === 'left' ? tab.left.filter(g => g.id !== groupId) : tab.right.filter(g => g.id !== groupId);
            return side === 'left' ? { ...tab, left: arr } : { ...tab, right: arr };
        });
        setTabs(updatedTabs);
        saveToLocal(updatedTabs);
        setDeleteConfirmGroup(null);
        setEditingGroupName(prev => prev?.groupId === groupId ? null : prev);
    };

    // 結束編輯分組名稱時：若未輸入任何內容（空白或仍為「新分組」），則刪除該分組
    // valueFromInput：可傳入輸入框即時值（blur/Enter 時傳入），避免 state 尚未更新而誤刪已改名的分組
    const finishEditingGroupName = (side, groupId, valueFromInput) => {
        const tab = tabs[activeTabIdx];
        if (!tab) {
            setEditingGroupName(null);
            return;
        }
        const groups = side === 'left' ? tab.left : tab.right;
        const group = groups?.find(g => g.id === groupId);
        const name = (valueFromInput !== undefined ? String(valueFromInput).trim() : (group?.name?.trim() ?? ''));
        const shouldRemove = name === '' || name === '新分組';
        if (shouldRemove && group) {
            const updatedTabs = tabs.map((t, ti) => {
                if (ti !== activeTabIdx) return t;
                const arr = side === 'left' ? (t.left || []).filter(g => g.id !== groupId) : (t.right || []).filter(g => g.id !== groupId);
                return side === 'left' ? { ...t, left: arr } : { ...t, right: arr };
            });
            setTabs(updatedTabs);
            saveToLocal(updatedTabs);
        }
        setEditingGroupName(null);
    };

    // 重新命名分組
    const renameGroup = (side, groupId, newName) => {
        const updatedTabs = tabs.map((tab, ti) => {
            if (ti !== activeTabIdx) return tab;
            const groups = side === 'left' ? [...tab.left] : [...tab.right];
            const next = groups.map(g => g.id === groupId ? { ...g, name: newName } : g);
            return side === 'left' ? { ...tab, left: next } : { ...tab, right: next };
        });
        setTabs(updatedTabs);
        saveToLocal(updatedTabs);
        // 只有在非「編輯組套」模式下，才關閉分組名稱編輯狀態
        if (!(editingTemplatesGroup?.groupId === groupId && editingTemplatesGroup?.side === side)) {
            setEditingGroupName(null);
        }
    };

    // 分組拖曳排序：將 side 側的 fromIndex 分組移到 toIndex（同側）
    const reorderGroups = (side, fromIndex, toIndex) => {
        if (fromIndex === toIndex) return;
        const updatedTabs = tabs.map((tab, ti) => {
            if (ti !== activeTabIdx) return tab;
            const groups = side === 'left' ? [...(tab.left || [])] : [...(tab.right || [])];
            const [removed] = groups.splice(fromIndex, 1);
            groups.splice(toIndex, 0, removed);
            return side === 'left' ? { ...tab, left: groups } : { ...tab, right: groups };
        });
        setTabs(updatedTabs);
        saveToLocal(updatedTabs);
    };

    // 分組跨側拖曳：將 fromSide 的 fromIndex 分組移到 toSide 的 toIndex
    const moveGroupBetweenSides = (fromSide, fromIndex, toSide, toIndex) => {
        const updatedTabs = tabs.map((tab, ti) => {
            if (ti !== activeTabIdx) return tab;
            const leftGroups = [...(tab.left || [])];
            const rightGroups = [...(tab.right || [])];
            const [movedGroup] = fromSide === 'left' ? leftGroups.splice(fromIndex, 1) : rightGroups.splice(fromIndex, 1);
            if (toSide === 'left') {
                leftGroups.splice(toIndex, 0, movedGroup);
            } else {
                rightGroups.splice(toIndex, 0, movedGroup);
            }
            return { ...tab, left: leftGroups, right: rightGroups };
        });
        setTabs(updatedTabs);
        saveToLocal(updatedTabs);
    };

    // --- 頁籤管理 ---

    const addNewTab = () => {
        const name = prompt("請輸入新頁籤名稱 (例如: MRI, Sono):", "New Tab");
        if (!name) return;
        const newTab = {
            id: `tab-${Date.now()}`,
            name: name,
            left: [],  // Group[]
            right: []
        };
        const newTabs = [...tabs, newTab];
        const nextIdx = newTabs.length - 1;
        setTabs(newTabs);
        setActiveTabIdx(nextIdx);
        saveToLocal(newTabs, config, nextIdx);
    };

    const deleteCurrentTab = () => {
        if (tabs.length <= 1) {
            alert("至少要保留一個頁籤！");
            return;
        }
        if (!confirm(`確定要刪除「${activeTab.name}」頁籤嗎？這會刪除裡面的所有內容。`)) return;
        
        const newTabs = tabs.filter((_, idx) => idx !== activeTabIdx);
        const nextIdx = 0;
        setTabs(newTabs);
        setActiveTabIdx(nextIdx);
        saveToLocal(newTabs, config, nextIdx);
    };

    const renameCurrentTab = (newName) => {
        const newTabs = [...tabs];
        newTabs[activeTabIdx].name = newName;
        setTabs(newTabs);
        saveToLocal(newTabs);
    };

    // 頁籤拖曳排序：將 fromIndex 頁籤移到 toIndex
    const reorderTabs = (fromIndex, toIndex) => {
        if (fromIndex === toIndex) return;
        const newTabs = [...tabs];
        const [removed] = newTabs.splice(fromIndex, 1);
        newTabs.splice(toIndex, 0, removed);
        
        // 更新當前活動頁籤索引
        let newActiveIdx = activeTabIdx;
        if (fromIndex === activeTabIdx) {
            newActiveIdx = toIndex;
        } else if (fromIndex < activeTabIdx && toIndex >= activeTabIdx) {
            newActiveIdx = activeTabIdx - 1;
        } else if (fromIndex > activeTabIdx && toIndex <= activeTabIdx) {
            newActiveIdx = activeTabIdx + 1;
        }
        
        setTabs(newTabs);
        setActiveTabIdx(newActiveIdx);
        saveToLocal(newTabs, config, newActiveIdx);
    };

    const connectGoogleSheets = async () => {
        const newConfig = { ...config, isConnected: true };
        setConfig(newConfig);
        saveToLocal(tabs, newConfig);
        setShowSettings(false); // 一點「匯入」就先收起系統設定視窗
        await loadFromGoogleSheets();
    };

    // --- 建立 TemplateButton 所需的 context ---
    const templateButtonCtx = {
        copiedId, hoveredTemplateInEdit, setHoveredTemplateInEdit,
        dragState, dropTarget, dragGroupState,
        didDragRef, dragOffsetRef, dragPayloadRef,
        setDragState, setDragGhost, setDropTarget,
        moveTemplateRef,
        copyToClipboard, copyLeftRight, copyEnlarged, copySeverity, copyLobe,
        showDeleteConfirm, startEdit,
        dropGroupTarget, setDropGroupTarget, setDragGroupState,
        reorderGroups, moveGroupBetweenSides,
    };


    return (
        <div className="bg-slate-50 min-h-screen flex flex-col font-sans">
            {/* 頂部導航列 */}
            <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-[50]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16 items-center">
                        <div className="flex items-center gap-2">
                            <img src="/favicon.png" alt="Logo" className="w-10 h-10 object-contain" />
                            <span className="font-bold text-slate-700 hidden sm:block">放射科組套</span>
                        </div>

                        {/* 頁籤滾動區：左右滑動 + 箭頭按鈕（游標移入頁籤列時才顯示箭頭） */}
                        <div
                            data-tab-bar
                            className="flex-1 flex items-center gap-1 min-w-0 mx-2"
                            onMouseEnter={() => setTabBarHovered(true)}
                            onMouseLeave={() => setTabBarHovered(false)}
                        >
                            <button
                                type="button"
                                onClick={() => { tabScrollRef.current?.scrollBy({ left: -180, behavior: 'smooth' }); }}
                                className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition ${tabBarHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                                title="向左滑動"
                                aria-label="向左滑動"
                            >
                                ‹
                            </button>
                            <div
                                ref={tabScrollRef}
                                className="flex-1 overflow-x-auto no-scrollbar flex items-center gap-1 min-w-0"
                                style={{ scrollBehavior: 'smooth', WebkitOverflowScrolling: 'touch' }}
                            >
                            {tabs.map((tab, idx) => {
                                const isDraggingTab = dragTabState?.index === idx;
                                const isDropHere = dropTabTarget?.index === idx;
                                return (
                                    <div
                                        key={tab.id}
                                        draggable={editingTabName}
                                        onDragStart={(e) => {
                                            if (!editingTabName) {
                                                e.preventDefault();
                                                return;
                                            }
                                            e.dataTransfer.setData('text/plain', tab.id);
                                            e.dataTransfer.effectAllowed = 'move';
                                            // 設置透明的拖曳圖像，移除藍色方框
                                            const emptyImg = document.createElement('img');
                                            emptyImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
                                            document.body.appendChild(emptyImg);
                                            e.dataTransfer.setDragImage(emptyImg, 0, 0);
                                            setTimeout(() => document.body.removeChild(emptyImg), 0);
                                            setDragTabState({ index: idx });
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            setDragTabGhost({
                                                x: e.clientX - rect.width / 2,
                                                y: e.clientY - rect.height / 2,
                                                width: rect.width,
                                                height: rect.height,
                                                name: tab.name
                                            });
                                        }}
                                        onDrag={(e) => {
                                            if (e.clientX === 0 && e.clientY === 0) return;
                                            setDragTabGhost(prev => prev ? { ...prev, x: e.clientX - prev.width / 2, y: e.clientY - prev.height / 2 } : null);
                                        }}
                                        onDragOver={(e) => {
                                            if (!editingTabName || !dragTabState) return;
                                            e.preventDefault();
                                            e.dataTransfer.dropEffect = 'move';
                                            setDropTabTarget({ index: idx });
                                        }}
                                        onDragLeave={(e) => {
                                            if (!e.currentTarget.contains(e.relatedTarget)) {
                                                setDropTabTarget(null);
                                            }
                                        }}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            if (dragTabState && dropTabTarget) {
                                                reorderTabs(dragTabState.index, dropTabTarget.index);
                                            }
                                            setDragTabState(null);
                                            setDropTabTarget(null);
                                        }}
                                        onDragEnd={() => {
                                            setDragTabState(null);
                                            setDropTabTarget(null);
                                            setDragTabGhost(null);
                                        }}
                                        className={`${isDraggingTab ? 'opacity-50' : ''} ${isDropHere ? 'p-[2px] rounded-full bg-blue-400' : ''}`}
                                    >
                                        <button
                                            onClick={() => {
                                                if (!editingTabName) {
                                                    setActiveTabIdx(idx);
                                                    saveToLocal(tabs, config, idx);
                                                }
                                            }}
                                            className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-bold transition-all w-full h-full ${
                                                activeTabIdx === idx 
                                                    ? 'bg-slate-800 text-white shadow-md' 
                                                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                            } ${editingTabName ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                        >
                                            {tab.name}
                                        </button>
                                    </div>
                                );
                            })}
                            <button onClick={addNewTab} className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-green-600 transition shrink-0" title="新增頁籤">
                                ＋
                            </button>
                            </div>
                            <button
                                type="button"
                                onClick={() => { tabScrollRef.current?.scrollBy({ left: 180, behavior: 'smooth' }); }}
                                className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition ${tabBarHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                                title="向右滑動"
                                aria-label="向右滑動"
                            >
                                ›
                            </button>
                        </div>

                        <div className="flex items-center gap-2 relative z-[60]">
                            <span className="text-xs text-slate-400 font-mono hidden sm:inline">{syncStatus}</span>
                            <button 
                                type="button"
                                data-settings-button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setShowSettings(!showSettings);
                                }}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                }}
                                className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition relative z-[60] cursor-pointer"
                                aria-label="開啟設定"
                            >
                                ⚙️
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 relative">
                
                {/* 設定面板（浮動覆蓋，不推擠下方內容；點擊區塊外可關閉） */}
                {showSettings && (
                    <>
                        <button
                            type="button"
                            className="fixed inset-0 z-[55] bg-slate-900/20 cursor-default"
                            onClick={() => setShowSettings(false)}
                            aria-label="關閉設定"
                        />
                        <div className="fixed left-0 right-0 top-0 z-[60] px-4 sm:px-6 lg:px-8 pt-4" data-settings-panel onClick={(e) => e.stopPropagation()}>
                            <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-6 animate-fade-in-down max-h-[85vh] overflow-y-auto">
                        <h2 className="text-lg font-bold mb-4 text-slate-800 flex items-center gap-2">
                            ⚙️ 系統設定
                        </h2>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <label htmlFor="config-spreadsheet-id" className="text-sm font-medium text-slate-700 shrink-0 w-28 cursor-text">試算表 ID</label>
                                    <input
                                        id="config-spreadsheet-id"
                                        type="text"
                                        placeholder="Spreadsheet ID"
                                        value={config.spreadsheetId}
                                        onChange={(e) => setConfig({ ...config, spreadsheetId: e.target.value })}
                                        onFocus={(e) => { e.target.select(); }}
                                        className="flex-1 min-w-0 px-3 py-2 border rounded text-sm outline-none bg-white text-slate-800 focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div className="flex items-center gap-3">
                                    <label htmlFor="config-api-key" className="text-sm font-medium text-slate-700 shrink-0 w-28 cursor-text">API 金鑰</label>
                                    <input
                                        id="config-api-key"
                                        type="text"
                                        placeholder="API Key"
                                        value={config.apiKey}
                                        onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                                        onFocus={(e) => { e.target.select(); }}
                                        className="flex-1 min-w-0 px-3 py-2 border rounded text-sm outline-none bg-white text-slate-800 focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div className="flex items-center gap-3">
                                    <label htmlFor="config-script-url" className="text-sm font-medium text-slate-700 shrink-0 w-28 cursor-text">Apps Script 網址</label>
                                    <input
                                        id="config-script-url"
                                        type="text"
                                        placeholder="Apps Script URL (Write)"
                                        value={config.scriptUrl}
                                        onChange={(e) => setConfig({ ...config, scriptUrl: e.target.value })}
                                        onFocus={(e) => { e.target.select(); }}
                                        className="flex-1 min-w-0 px-3 py-2 border rounded text-sm outline-none bg-white text-slate-800 focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                
                                {/* 按鈕區域：匯入與匯出 */}
                                <div className="flex flex-col gap-2">
                                    <div className="flex gap-2">
                                        <button onClick={connectGoogleSheets} className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 shadow-sm font-medium transition-colors">
                                            📥 匯入 (雲端➔本地)
                                        </button>
                                        <button onClick={exportToGoogleSheets} className="flex-1 bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 shadow-sm font-medium transition-colors">
                                            📤 匯出 (本地➔雲端)
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="text-sm text-slate-500 bg-slate-50 p-4 rounded-lg border border-slate-100 flex flex-col">
                                <p className="font-bold mb-2 text-slate-700">Google Sheet 格式說明 (分組版)：</p>
                                <ul className="list-disc pl-5 space-y-1 text-xs flex-1">
                                    <li>每一個工作表 (Sheet) 對應上方一個頁籤。</li>
                                    <li><strong>左側</strong>：A=分組名、B=組套名稱、C=組套內容。</li>
                                    <li><strong>右側</strong>：D=分組名、E=組套名稱、F=組套內容。</li>
                                    <li>同一分組的多筆組套，分組名填相同即可；匯出時 Apps Script 需寫入 6 欄。</li>
                                </ul>
                                <div className="mt-3 flex items-center justify-end gap-4 text-xs text-slate-500">
                                    <span>頁籤：{tabs.length}</span>
                                    <span>分組：{tabs.reduce((acc, tab) => acc + (tab.left?.length || 0) + (tab.right?.length || 0), 0)}</span>
                                    <span>組套：{tabs.reduce((acc, tab) => {
                                        const left = (tab.left || []).reduce((s, g) => s + (g.items?.length || 0), 0);
                                        const right = (tab.right || []).reduce((s, g) => s + (g.items?.length || 0), 0);
                                        return acc + left + right;
                                    }, 0)}</span>
                                </div>
                            </div>
                        </div>
                        </div>
                        </div>
                    </>
                )}

                {/* 當前頁籤標題與操作 */}
                <div
                    ref={tabEditAreaRef}
                    className="flex justify-between items-end mb-6 pb-2 border-b border-slate-200"
                >
                    <div className="flex items-center gap-3">
                        {editingTabName ? (
                            <input 
                                autoFocus
                                className="text-2xl font-bold text-slate-800 bg-transparent border-0 outline-none w-48 focus:ring-0"
                                value={activeTab.name}
                                onChange={(e) => renameCurrentTab(e.target.value)}
                                onBlur={() => setEditingTabName(false)}
                                onKeyDown={(e) => e.key === 'Enter' && setEditingTabName(false)}
                            />
                        ) : (
                            <h2
                                onClick={() => setEditingTabName(true)}
                                className="text-2xl font-bold text-slate-800 cursor-pointer hover:text-blue-600"
                                title="點擊編輯頁籤"
                            >
                                {activeTab.name}
                            </h2>
                        )}
                    </div>
                    {editingTabName && (
                        <div className="flex items-center gap-2">
                            <button onClick={() => { deleteCurrentTab(); setEditingTabName(false); }} className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-3 py-1 rounded transition">
                                刪除此頁籤
                            </button>
                            <button onClick={() => setEditingTabName(false)} className="text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 px-3 py-1 rounded transition">
                                完成
                            </button>
                        </div>
                    )}
                </div>

                {/* 主要內容區 */}
                <div className="grid md:grid-cols-2 gap-8">
                    {/* 左側：標準組套 */}
                    <div ref={leftGroupsContainerRef} className="space-y-4">
                        {(!activeTab.left || activeTab.left.length === 0) ? (
                            <div
                                className={`border-2 border-dashed rounded-xl p-6 text-center text-sm transition-colors ${dragGroupState && dropGroupTarget?.side === 'left' ? 'border-blue-400 bg-blue-50/80 text-blue-600' : 'border-slate-200 text-slate-400'}`}
                                onDragOver={(e) => {
                                    if (!dragGroupState) return;
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = 'move';
                                    setDropGroupTarget({ side: 'left', index: 0 });
                                }}
                                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropGroupTarget(null); }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    if (dragGroupState && dropGroupTarget?.side === 'left') {
                                        if (dragGroupState.side === 'right') moveGroupBetweenSides('right', dragGroupState.index, 'left', 0);
                                    }
                                    setDragGroupState(null);
                                    setDropGroupTarget(null);
                                }}
                            >
                                {editingGroupsLeft ? '+新增分組' : dragGroupState ? '放開可移入此側' : '+新增分組'}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {activeTab.left.map((group, groupIndex) => {
                                    const isDraggingGroup = dragGroupState?.side === 'left' && dragGroupState?.groupId === group.id;
                                    const isDropHere = dropGroupTarget?.side === 'left' && dropGroupTarget?.index === groupIndex;
                                    return (
                                    <div
                                        key={group.id}
                                        className={`group-box border-2 rounded-xl p-4 transition-all ${isDraggingGroup ? 'opacity-50 border-slate-400' : 'border-dashed border-slate-300 bg-white/60'} ${isDropHere ? 'ring-2 ring-blue-400 ring-inset bg-blue-50/80' : ''}`}
                                        data-group-container
                                        data-group-id={group.id}
                                        data-group-side="left"
                                        {...(group.type === 'breastNodule' && { 'data-breast-nodule-group': 'true' })}
                                        data-group-drop
                                        data-side="left"
                                        data-index={groupIndex}
                                        onDragOver={(e) => {
                                            if (!dragGroupState) return;
                                            e.preventDefault();
                                            e.dataTransfer.dropEffect = 'move';
                                            setDropGroupTarget({ side: 'left', index: groupIndex });
                                        }}
                                        onDragLeave={(e) => {
                                            if (!e.currentTarget.contains(e.relatedTarget)) setDropGroupTarget(null);
                                        }}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            if (dragGroupState && dropGroupTarget) {
                                                if (dragGroupState.side === 'left' && dropGroupTarget.side === 'left') {
                                                    reorderGroups('left', dragGroupState.index, dropGroupTarget.index);
                                                } else if (dragGroupState.side === 'right' && dropGroupTarget.side === 'left') {
                                                    moveGroupBetweenSides('right', dragGroupState.index, 'left', dropGroupTarget.index);
                                                }
                                            }
                                            setDragGroupState(null);
                                            setDropGroupTarget(null);
                                        }}
                                    >
                                            <div className="flex justify-between items-baseline mb-3">
                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                {(editingGroupsLeft || (editingTemplatesGroup?.groupId === group.id && editingTemplatesGroup?.side === 'left') || (group.type === 'breastNodule' && editingGroupName?.groupId === group.id && editingGroupName?.side === 'left')) && (
                                                    <span
                                                        draggable
                                                        onDragStart={(e) => {
                                                            e.dataTransfer.setData('text/plain', group.id);
                                                            e.dataTransfer.effectAllowed = 'move';
                                                            setDragGroupState({ side: 'left', groupId: group.id, index: groupIndex });
                                                        }}
                                                        onDragEnd={() => { setDragGroupState(null); setDropGroupTarget(null); }}
                                                        className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 touch-none select-none px-1"
                                                        title="拖曳可調整分組順序"
                                                    >
                                                        ⋮⋮
                                                    </span>
                                                )}
                                                {(editingGroupName?.groupId === group.id && editingGroupName?.side === 'left' && editingGroupName?.editing) || (editingTemplatesGroup?.groupId === group.id && editingTemplatesGroup?.side === 'left') ? (
                                                    <input
                                                        autoFocus
                                                        className={`text-sm font-bold text-slate-700 bg-transparent outline-none flex-1 mr-2 min-w-0 ${
                                                            (editingTemplatesGroup?.groupId === group.id && editingTemplatesGroup?.side === 'left') || group.type === 'breastNodule'
                                                                ? ''
                                                                : 'border-b-2 border-blue-500'
                                                        }`}
                                                        value={group.name}
                                                        onChange={(e) => renameGroup('left', group.id, e.target.value)}
                                                        onBlur={(e) => {
                                                            if (!(editingTemplatesGroup?.groupId === group.id && editingTemplatesGroup?.side === 'left')) {
                                                                finishEditingGroupName('left', group.id, e.target.value);
                                                            }
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                if (!(editingTemplatesGroup?.groupId === group.id && editingTemplatesGroup?.side === 'left')) {
                                                                    finishEditingGroupName('left', group.id, e.target.value);
                                                                }
                                                            }
                                                        }}
                                                    />
                                                ) : (
                                                    <span
                                                        onClick={() => group.type === 'breastNodule' ? setEditingGroupName({ groupId: group.id, side: 'left', editing: true }) : setEditingTemplatesGroup({ groupId: group.id, side: 'left' })}
                                                        className="text-sm font-bold text-slate-700 truncate cursor-pointer hover:text-blue-600"
                                                        title="點擊編輯組套"
                                                    >
                                                        {group.name}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-baseline gap-1 shrink-0">
                                                {group.type === 'breastNodule' ? (
                                                    <>
                                                        {editingGroupName?.groupId === group.id && editingGroupName?.side === 'left' && (
                                                            <button onClick={() => setEditingSentenceTemplate(!editingSentenceTemplate)} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="編輯">✏️</button>
                                                        )}
                                                        {editingGroupsLeft && <button onClick={() => showDeleteGroupConfirm(group.id, 'left')} className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded" title="刪除分組">🗑️</button>}
                                                    </>
                                                ) : editingTemplatesGroup?.groupId === group.id && editingTemplatesGroup?.side === 'left' ? (
                                                    <>
                                                        <button onClick={() => showDeleteGroupConfirm(group.id, 'left')} className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded" title="刪除分組">🗑️</button>
                                                        <button onClick={() => addTemplateToGroup('left', group.id)} className="text-sm font-bold leading-none w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 select-none" title="新增組套">+</button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button onClick={() => { setEditingTemplatesGroup({ groupId: group.id, side: 'left' }); addTemplateToGroup('left', group.id); }} className="text-sm font-bold leading-none w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 select-none" title="新增組套">+</button>
                                                        {editingGroupsLeft && (
                                                            <button onClick={() => showDeleteGroupConfirm(group.id, 'left')} className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded" title="刪除分組">🗑️</button>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        {group.type === 'breastNodule' ? (
                                            <div className="grid grid-cols-2 gap-4 mt-2">
                                                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                                                    <p className="text-xs font-bold text-slate-600 mb-2">尺寸 (cm)</p>
                                                    <div className="flex items-center justify-center gap-1 mb-2">
                                                        <button type="button" onClick={() => setBreastNoduleGroupParams(p => ({ ...p, activeField: 'sizeW', reEnterPending: true }))} className={`px-2 py-1 rounded text-sm font-mono min-w-[3rem] ${breastNoduleGroupParams.activeField === 'sizeW' ? 'ring-2 ring-blue-500 bg-blue-50' : 'bg-white border border-slate-200'}`}>{formatSizeDisplay(breastNoduleGroupParams.sizeWStr, '長')}</button>
                                                        <span className="text-slate-400">×</span>
                                                        <button type="button" onClick={() => setBreastNoduleGroupParams(p => ({ ...p, activeField: 'sizeH', reEnterPending: true }))} className={`px-2 py-1 rounded text-sm font-mono min-w-[3rem] ${breastNoduleGroupParams.activeField === 'sizeH' ? 'ring-2 ring-blue-500 bg-blue-50' : 'bg-white border border-slate-200'}`}>{formatSizeDisplay(breastNoduleGroupParams.sizeHStr, '寬')}</button>
                                                    </div>
                                                    <div className="relative flex justify-center items-center mx-auto shrink-0 mt-5 w-full" style={{ maxWidth: '140px', aspectRatio: '80/48' }}>
                                                        <svg viewBox="0 0 80 48" className="w-full h-full absolute inset-0 pointer-events-none" preserveAspectRatio="xMidYMid meet">
                                                            <ellipse cx="40" cy="24" rx="36" ry="20" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5" />
                                                        </svg>
                                                        <div className="relative z-10 grid grid-cols-3 gap-0.5 p-1">
                                                            {['7','8','9','4','5','6','1','2','3','C','0','.'].map((k) => (
                                                                <button key={k} type="button" onClick={() => applyBreastNoduleKeypad(k)} className="w-5 h-5 rounded bg-white/90 border border-slate-200 text-slate-700 text-[10px] font-medium hover:bg-slate-100 flex items-center justify-center shrink-0">{k}</button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                                                    <p className="text-xs font-bold text-slate-600 mb-2">方位與距離</p>
                                                    <div className="relative flex justify-center items-center mx-auto shrink-0 w-full" style={{ maxWidth: '160px', aspectRatio: '1/1' }}>
                                                        <svg viewBox="0 0 200 200" className="w-full h-full absolute inset-0">
                                                            <circle cx="100" cy="100" r="82" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="2" style={{ pointerEvents: 'none' }} />
                                                            <circle cx="100" cy="100" r="58" fill="white" stroke="#e2e8f0" strokeWidth="1" style={{ pointerEvents: 'none' }} />
                                                            {[12,1,2,3,4,5,6,7,8,9,10,11].map((h) => {
                                                                const angleDeg = (270 + h * 30) % 360;
                                                                const angleRad = (angleDeg * Math.PI) / 180;
                                                                const r = 70;
                                                                const x = 100 + r * Math.cos(angleRad);
                                                                const y = 100 + r * Math.sin(angleRad);
                                                                const isSelected = breastNoduleGroupParams.clock === h;
                                                                return (
                                                                    <g key={h} onClick={() => setBreastNoduleGroupParams(p => ({ ...p, clock: h }))} style={{ cursor: 'pointer' }} transform={`translate(${x},${y})`}>
                                                                        <circle cx={0} cy={0} r={isSelected ? 13 : 11} fill={isSelected ? '#3b82f6' : '#e2e8f0'} stroke={isSelected ? '#2563eb' : '#cbd5e1'} strokeWidth={2} />
                                                                        <foreignObject x={-13} y={-13} width={26} height={26}>
                                                                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold', color: isSelected ? 'white' : '#475569', userSelect: 'none', lineHeight: 1 }}>{h}</div>
                                                                        </foreignObject>
                                                                    </g>
                                                                );
                                                            })}
                                                        </svg>
                                                        <div className="relative z-10 flex justify-center items-center pointer-events-none" style={{ width: '100%', height: '100%' }}>
                                                            <div className="pointer-events-auto grid grid-cols-3 gap-0.5 p-0.5 max-w-[72px]">
                                                                {['4','5','6','1','2','3','C','N','M'].map((k) => (
                                                                    <button
                                                                        key={`dist-${k}`}
                                                                        type="button"
                                                                        className={`w-5 h-5 rounded border text-[10px] font-medium flex items-center justify-center shadow-sm ${
                                                                            k === 'M'
                                                                                ? (lastDistKeyPressed === 'M'
                                                                                    ? (breastNodulePendingTexts.length > 0
                                                                                        ? 'bg-blue-500 border-blue-600 text-white'
                                                                                        : 'bg-red-500 border-red-600 text-white')
                                                                                    : 'bg-white/95 border-slate-200 text-slate-700 hover:bg-slate-100')
                                                                                : (lastDistKeyPressed === k
                                                                                    ? (breastNoduleGroupParams.clock == null
                                                                                        ? 'bg-red-500 border-red-600 text-white'
                                                                                        : 'bg-blue-500 border-blue-600 text-white')
                                                                                    : 'bg-white/95 border-slate-200 text-slate-700 hover:bg-slate-100')
                                                                        }`}
                                                                        onClick={() => {
                                                                            setLastDistKeyPressed(k);
                                                                            // C 鍵：全部歸零（含左側長寬），不產生句子也不複製
                                                                            if (k === 'C') {
                                                                                setBreastNoduleGroupParams({ sizeWStr: '0', sizeHStr: '0', clock: null, distStr: '0', activeField: null, reEnterPending: false });
                                                                                setBreastNodulePendingTexts([]);
                                                                                setLastDistKeyPressed(null);
                                                                                return;
                                                                            }
                                                                            // 若尚未選擇鐘點，只將按下的鍵標成紅色提醒，不做任何距離或複製動作
                                                                            if (breastNoduleGroupParams.clock == null) { return; }
                                                                            // 若長或寬為 0，視為尚未輸入完整尺寸，不產生句子也不更新距離
                                                                            const w = parseSizeValue(breastNoduleGroupParams.sizeWStr);
                                                                            const h = parseSizeValue(breastNoduleGroupParams.sizeHStr);
                                                                            if (w === 0 || h === 0) { return; }
                                                                            const baseDistStr = breastNoduleGroupParams.distStr;
                                                                            let newDistStr = baseDistStr;
                                                                            // 更新距離 state（C=清除，數字鍵=重設，N/M 不改距離）
                                                                            if (['4','5','6','1','2','3'].includes(k)) {
                                                                                newDistStr = k; // 數字鍵一律視為重新輸入距離（單一位數）
                                                                                setBreastNoduleGroupParams(p => ({ ...p, distStr: newDistStr }));
                                                                            }
                                                                            const c = breastNoduleGroupParams.clock;
                                                                            const numericDist = parseFloat(newDistStr || baseDistStr) || 0;
                                                                            const dist = k === 'N' ? 'N' : String(numericDist);
                                                                            const singleText = breastNoduleSentenceTemplate
                                                                                .replace(/\{W\}/g, String(w))
                                                                                .replace(/\{H\}/g, String(h))
                                                                                .replace(/\{C\}/g, String(c))
                                                                                .replace(/\{D\}/g, '/' + dist + ' cm');
                                                                            let textToCopy = singleText;

                                                                            // 若按下 M，視為「暫存一顆結節」但先不複製，之後完成下一顆距離時一次複製多顆
                                                                            if (k === 'M') {
                                                                                textToCopy = null; // 此時不直接複製
                                                                                setBreastNodulePendingTexts(prev => [...prev, singleText]);
                                                                                setTimeout(() => setLastDistKeyPressed(null), 1000);
                                                                                // M1 之後：重設尺寸長寬與鐘面為 0/未選取，並讓「長」自動反白，方便輸入下一顆結節的尺寸
                                                                                setBreastNoduleGroupParams(p => ({
                                                                                    ...p,
                                                                                    sizeWStr: '0',
                                                                                    sizeHStr: '0',
                                                                                    clock: null,
                                                                                    activeField: 'sizeW',
                                                                                    reEnterPending: true
                                                                                }));
                                                                            } else if (breastNodulePendingTexts.length > 0 && k !== 'C') {
                                                                                // 已經有暫存的結節，且這次是完成另一顆（距離鍵或 N），一次複製所有，
                                                                                // 並把最新這一顆也加入暫存，方便之後再繼續新增結節時一併帶出
                                                                                const allTexts = [...breastNodulePendingTexts, singleText];
                                                                                textToCopy = allTexts.join('\n');
                                                                                setBreastNodulePendingTexts(allTexts);
                                                                            }
                                                                            if (textToCopy) {
                                                                                // 統一格式：每一行都加上「三個空格 + - + 空格」
                                                                                const lines = textToCopy.split('\n').filter(l => l.trim() !== '');
                                                                                const finalText = lines
                                                                                    .map(line => {
                                                                                        // 先去掉原本可能就有的項目符號（避免出現「-    -」）
                                                                                        const core = line.replace(/^\s*-\s*/, '');
                                                                                        return `   - ${core}`;
                                                                                    })
                                                                                    .join('\n');
                                                                                // 只複製到剪貼簿，不顯示「已複製到剪貼簿」提示
                                                                                if (navigator.clipboard && navigator.clipboard.writeText) {
                                                                                    navigator.clipboard.writeText(finalText).catch(() => {
                                                                                        const ta = document.createElement('textarea'); ta.value = finalText; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
                                                                                    });
                                                                                } else {
                                                                                    const ta = document.createElement('textarea'); ta.value = finalText; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
                                                                                }
                                                                            }
                                                                        }}
                                                                    >
                                                                        {k}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                        <div className="grid grid-cols-2 gap-3">
                                            {group.items.map((t, idx) => (
                                                <TemplateButton key={t.id} template={t} side="left" groupId={group.id} index={idx} showEditButtons={editingTemplatesGroup?.groupId === group.id && editingTemplatesGroup?.side === 'left'} ctx={templateButtonCtx} />
                                            ))}
                                            {group.items.length === 0 && (
                                                <div
                                                    data-drop-zone
                                                    data-side="left"
                                                    data-group-id={group.id}
                                                    data-index={0}
                                                    className={`col-span-2 text-center py-4 text-slate-300 text-sm italic rounded-lg min-h-[2rem] transition-colors ${dropTarget?.side === 'left' && dropTarget?.groupId === group.id && dropTarget?.index === 0 ? 'ring-2 ring-blue-400 ring-inset bg-blue-50/60' : ''}`}
                                                >
                                                    尚無組套
                                                </div>
                                            )}
                                        </div>
                                        )}
                                    </div>
                                    );
                                })}
                            </div>
                        )}
                        <div className="flex justify-center pt-2">
                            <button type="button" onClick={() => addGroup('left')} className="text-lg font-semibold text-slate-400 hover:text-green-600" title="新增分組">＋</button>
                        </div>
                    </div>

                    {/* 右側：自訂組套 */}
                    <div ref={rightGroupsContainerRef} className="space-y-4">
                        {(!activeTab.right || activeTab.right.length === 0) ? (
                            <div
                                className={`border-2 border-dashed rounded-xl p-6 text-center text-sm transition-colors ${dragGroupState && dropGroupTarget?.side === 'right' ? 'border-blue-400 bg-blue-50/80 text-blue-600' : 'border-slate-200 text-slate-400'}`}
                                onDragOver={(e) => {
                                    if (!dragGroupState) return;
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = 'move';
                                    setDropGroupTarget({ side: 'right', index: 0 });
                                }}
                                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropGroupTarget(null); }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    if (dragGroupState && dropGroupTarget?.side === 'right') {
                                        if (dragGroupState.side === 'left') moveGroupBetweenSides('left', dragGroupState.index, 'right', 0);
                                    }
                                    setDragGroupState(null);
                                    setDropGroupTarget(null);
                                }}
                            >
                                {editingGroupsRight ? '+新增分組' : dragGroupState ? '放開可移入此側' : '+新增分組'}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {activeTab.right.map((group, groupIndex) => {
                                    const isDraggingGroup = dragGroupState?.side === 'right' && dragGroupState?.groupId === group.id;
                                    const isDropHere = dropGroupTarget?.side === 'right' && dropGroupTarget?.index === groupIndex;
                                    return (
                                    <div
                                        key={group.id}
                                        className={`group-box border-2 rounded-xl p-4 transition-all ${isDraggingGroup ? 'opacity-50 border-slate-400' : 'border-dashed border-slate-300 bg-white/60'} ${isDropHere ? 'ring-2 ring-blue-400 ring-inset bg-blue-50/80' : ''}`}
                                        data-group-container
                                        data-group-id={group.id}
                                        data-group-side="right"
                                        {...(group.type === 'breastNodule' && { 'data-breast-nodule-group': 'true' })}
                                        data-group-drop
                                        data-side="right"
                                        data-index={groupIndex}
                                        onDragOver={(e) => {
                                            if (!dragGroupState) return;
                                            e.preventDefault();
                                            e.dataTransfer.dropEffect = 'move';
                                            setDropGroupTarget({ side: 'right', index: groupIndex });
                                        }}
                                        onDragLeave={(e) => {
                                            if (!e.currentTarget.contains(e.relatedTarget)) setDropGroupTarget(null);
                                        }}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            if (dragGroupState && dropGroupTarget) {
                                                if (dragGroupState.side === 'right' && dropGroupTarget.side === 'right') {
                                                    reorderGroups('right', dragGroupState.index, dropGroupTarget.index);
                                                } else if (dragGroupState.side === 'left' && dropGroupTarget.side === 'right') {
                                                    moveGroupBetweenSides('left', dragGroupState.index, 'right', dropGroupTarget.index);
                                                }
                                            }
                                            setDragGroupState(null);
                                            setDropGroupTarget(null);
                                        }}
                                    >
                                            <div className="flex justify-between items-baseline mb-3">
                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                {(editingGroupsRight || (editingTemplatesGroup?.groupId === group.id && editingTemplatesGroup?.side === 'right') || (group.type === 'breastNodule' && editingGroupName?.groupId === group.id && editingGroupName?.side === 'right')) && (
                                                    <span
                                                        draggable
                                                        onDragStart={(e) => {
                                                            e.dataTransfer.setData('text/plain', group.id);
                                                            e.dataTransfer.effectAllowed = 'move';
                                                            setDragGroupState({ side: 'right', groupId: group.id, index: groupIndex });
                                                        }}
                                                        onDragEnd={() => { setDragGroupState(null); setDropGroupTarget(null); }}
                                                        className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 touch-none select-none px-1"
                                                        title="拖曳可調整分組順序"
                                                    >
                                                        ⋮⋮
                                                    </span>
                                                )}
                                                {(editingGroupName?.groupId === group.id && editingGroupName?.side === 'right' && editingGroupName?.editing) || (editingTemplatesGroup?.groupId === group.id && editingTemplatesGroup?.side === 'right') ? (
                                                    <input
                                                        autoFocus
                                                        className={`text-sm font-bold text-slate-700 bg-transparent outline-none flex-1 mr-2 min-w-0 ${
                                                            (editingTemplatesGroup?.groupId === group.id && editingTemplatesGroup?.side === 'right') || group.type === 'breastNodule'
                                                                ? ''
                                                                : 'border-b-2 border-blue-500'
                                                        }`}
                                                        value={group.name}
                                                        onChange={(e) => renameGroup('right', group.id, e.target.value)}
                                                        onBlur={(e) => {
                                                            if (!(editingTemplatesGroup?.groupId === group.id && editingTemplatesGroup?.side === 'right')) {
                                                                finishEditingGroupName('right', group.id, e.target.value);
                                                            }
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                if (!(editingTemplatesGroup?.groupId === group.id && editingTemplatesGroup?.side === 'right')) {
                                                                    finishEditingGroupName('right', group.id, e.target.value);
                                                                }
                                                            }
                                                        }}
                                                    />
                                                ) : (
                                                    <span
                                                        onClick={() => group.type === 'breastNodule' ? setEditingGroupName({ groupId: group.id, side: 'right', editing: true }) : setEditingTemplatesGroup({ groupId: group.id, side: 'right' })}
                                                        className="text-sm font-bold text-slate-700 truncate cursor-pointer hover:text-blue-600"
                                                        title="點擊編輯組套"
                                                    >
                                                        {group.name}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-baseline gap-1 shrink-0">
                                                {group.type === 'breastNodule' ? (
                                                    <>
                                                        {editingGroupName?.groupId === group.id && editingGroupName?.side === 'right' && (
                                                            <button onClick={() => setEditingSentenceTemplate(!editingSentenceTemplate)} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="編輯">✏️</button>
                                                        )}
                                                        {editingGroupsRight && <button onClick={() => showDeleteGroupConfirm(group.id, 'right')} className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded" title="刪除分組">🗑️</button>}
                                                    </>
                                                ) : editingTemplatesGroup?.groupId === group.id && editingTemplatesGroup?.side === 'right' ? (
                                                    <>
                                                        <button onClick={() => showDeleteGroupConfirm(group.id, 'right')} className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded" title="刪除分組">🗑️</button>
                                                        <button onClick={() => addTemplateToGroup('right', group.id)} className="text-sm font-bold leading-none w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 select-none" title="新增組套">+</button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button onClick={() => { setEditingTemplatesGroup({ groupId: group.id, side: 'right' }); addTemplateToGroup('right', group.id); }} className="text-sm font-bold leading-none w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 select-none" title="新增組套">+</button>
                                                        {editingGroupsRight && (
                                                            <button onClick={() => showDeleteGroupConfirm(group.id, 'right')} className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded" title="刪除分組">🗑️</button>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        {group.type === 'breastNodule' ? (
                                            <div className="grid grid-cols-2 gap-4 mt-2">
                                                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                                                    <p className="text-xs font-bold text-slate-600 mb-2">尺寸 (cm)</p>
                                                    <div className="flex items-center justify-center gap-1 mb-2">
                                                        <button type="button" onClick={() => setBreastNoduleGroupParams(p => ({ ...p, activeField: 'sizeW', reEnterPending: true }))} className={`px-2 py-1 rounded text-sm font-mono min-w-[3rem] ${breastNoduleGroupParams.activeField === 'sizeW' ? 'ring-2 ring-blue-500 bg-blue-50' : 'bg-white border border-slate-200'}`}>{formatSizeDisplay(breastNoduleGroupParams.sizeWStr, '長')}</button>
                                                        <span className="text-slate-400">×</span>
                                                        <button type="button" onClick={() => setBreastNoduleGroupParams(p => ({ ...p, activeField: 'sizeH', reEnterPending: true }))} className={`px-2 py-1 rounded text-sm font-mono min-w-[3rem] ${breastNoduleGroupParams.activeField === 'sizeH' ? 'ring-2 ring-blue-500 bg-blue-50' : 'bg-white border border-slate-200'}`}>{formatSizeDisplay(breastNoduleGroupParams.sizeHStr, '寬')}</button>
                                                    </div>
                                                    <div className="relative flex justify-center items-center mx-auto shrink-0 w-full" style={{ maxWidth: '140px', aspectRatio: '80/48' }}>
                                                        <svg viewBox="0 0 80 48" className="w-full h-full absolute inset-0 pointer-events-none" preserveAspectRatio="xMidYMid meet">
                                                            <ellipse cx="40" cy="24" rx="36" ry="20" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5" />
                                                        </svg>
                                                        <div className="relative z-10 grid grid-cols-3 gap-0.5 p-1">
                                                            {['7','8','9','4','5','6','1','2','3','C','0','.'].map((k) => (
                                                                <button key={k} type="button" onClick={() => applyBreastNoduleKeypad(k)} className="w-5 h-5 rounded bg-white/90 border border-slate-200 text-slate-700 text-[10px] font-medium hover:bg-slate-100 flex items-center justify-center shrink-0">{k}</button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                                                    <p className="text-xs font-bold text-slate-600 mb-2">方位與距離</p>
                                                    <div className="flex justify-center mb-2 shrink-0 mx-auto w-full" style={{ maxWidth: '160px', aspectRatio: '1/1' }}>
                                                        <svg viewBox="0 0 200 200" className="w-full h-full">
                                                            <circle cx="100" cy="100" r="82" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="2" />
                                                            <circle cx="100" cy="100" r="58" fill="white" stroke="#e2e8f0" strokeWidth="1" />
                                                            {[12,1,2,3,4,5,6,7,8,9,10,11].map((h) => {
                                                                const angleDeg = (270 + h * 30) % 360;
                                                                const angleRad = (angleDeg * Math.PI) / 180;
                                                                const r = 70;
                                                                const x = 100 + r * Math.cos(angleRad);
                                                                const y = 100 + r * Math.sin(angleRad);
                                                                const isSelected = breastNoduleGroupParams.clock === h;
                                                                return (
                                                                    <g key={h} onClick={() => setBreastNoduleGroupParams(p => ({ ...p, clock: h }))} style={{ cursor: 'pointer' }} transform={`translate(${x},${y})`}>
                                                                        <circle cx={0} cy={0} r={isSelected ? 13 : 11} fill={isSelected ? '#3b82f6' : '#e2e8f0'} stroke={isSelected ? '#2563eb' : '#cbd5e1'} strokeWidth={2} />
                                                                        <foreignObject x={-13} y={-13} width={26} height={26}>
                                                                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold', color: isSelected ? 'white' : '#475569', userSelect: 'none', lineHeight: 1 }}>{h}</div>
                                                                        </foreignObject>
                                                                    </g>
                                                                );
                                                            })}
                                                        </svg>
                                                    </div>
                                                    <div className="flex items-center justify-center gap-1 mb-2">
                                                        <span className="text-xs text-slate-500">距乳頭</span>
                                                        <span className="px-2 py-1 rounded text-sm font-mono min-w-[2.5rem] bg-white border border-slate-200">{breastNoduleGroupParams.distStr || '0'}</span>
                                                        <span className="text-xs text-slate-500">cm</span>
                                                    </div>
                                                    <div className="grid grid-cols-5 gap-1 w-[160px] mx-auto">
                                                        {['1','2','3','4','5','6','7','8','9','0','C'].map((k) => (
                                                            <button key={k} type="button" onClick={() => { if (k === 'C') setBreastNodulePendingTexts([]); setBreastNoduleGroupParams(p => ({ ...p, distStr: k === 'C' ? '' : p.distStr + k })); }} className="w-7 h-7 rounded bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-100 flex items-center justify-center shrink-0">{k}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                        <div className="grid grid-cols-2 gap-3">
                                            {group.items.map((t, idx) => (
                                                <TemplateButton key={t.id} template={t} side="right" groupId={group.id} index={idx} showEditButtons={editingTemplatesGroup?.groupId === group.id && editingTemplatesGroup?.side === 'right'} ctx={templateButtonCtx} />
                                            ))}
                                            {group.items.length === 0 && (
                                                <div
                                                    data-drop-zone
                                                    data-side="right"
                                                    data-group-id={group.id}
                                                    data-index={0}
                                                    className={`col-span-2 text-center py-4 text-slate-300 text-sm italic rounded-lg min-h-[2rem] transition-colors ${dropTarget?.side === 'right' && dropTarget?.groupId === group.id && dropTarget?.index === 0 ? 'ring-2 ring-blue-400 ring-inset bg-blue-50/60' : ''}`}
                                                >
                                                    尚無組套
                                                </div>
                                            )}
                                        </div>
                                        )}
                                    </div>
                                    );
                                })}
                            </div>
                        )}
                        <div className="flex justify-center pt-2">
                            <button type="button" onClick={() => addGroup('right')} className="text-lg font-semibold text-slate-400 hover:text-green-600" title="新增分組">＋</button>
                        </div>
                    </div>
                </div>
            </div>

            {/* 刪除確認視窗 */}
            {deleteConfirmTemplate && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" data-delete-confirm-modal>
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-scale-in">
                        <p className="text-lg text-slate-800 mb-6">確定要刪除這個組套嗎?</p>
                        <div className="flex gap-3 justify-end">
                            <button onClick={() => setDeleteConfirmTemplate(null)} className="px-6 py-2 bg-slate-100 text-slate-600 rounded-lg font-bold hover:bg-slate-200">否</button>
                            <button onClick={confirmDeleteTemplate} className="px-6 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700">是</button>
                        </div>
                    </div>
                </div>
            )}

            {/* 刪除分組確認視窗 */}
            {deleteConfirmGroup && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-scale-in">
                        <p className="text-lg text-slate-800 mb-6">確定刪除此分組？分組內所有組套將一併刪除。</p>
                        <div className="flex gap-3 justify-end">
                            <button onClick={() => setDeleteConfirmGroup(null)} className="px-6 py-2 bg-slate-100 text-slate-600 rounded-lg font-bold hover:bg-slate-200">否</button>
                            <button onClick={confirmDeleteGroup} className="px-6 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700">是</button>
                        </div>
                    </div>
                </div>
            )}

            {/* 編輯彈窗 */}
            {editingTemplate && (
                <div
                    className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
                >
                    <div
                        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 animate-scale-in"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-slate-800">編輯內容</h3>
                            <button
                                onClick={cancelTemplateEdit}
                                className="text-slate-400 hover:text-slate-600 text-2xl"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">顯示名稱</label>
                                <input 
                                    type="text" 
                                    value={editingTemplate.name} 
                                    onInput={(e) => setEditingTemplate({...editingTemplate, name: e.target.value})} 
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">報告內容</label>
                                <textarea 
                                    value={editingTemplate.content} 
                                    onInput={(e) => setEditingTemplate({...editingTemplate, content: e.target.value})} 
                                    rows="12" 
                                    className="w-full px-4 py-3 border rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm leading-relaxed" 
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={saveTemplateEdit}
                                    className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-bold hover:bg-blue-700 shadow-md shadow-blue-100"
                                >
                                    儲存
                                </button>
                                <button
                                    onClick={cancelTemplateEdit}
                                    className="px-6 py-2 bg-slate-100 text-slate-600 rounded-lg font-bold hover:bg-slate-200"
                                >
                                    取消
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {editingSentenceTemplate && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 animate-scale-in" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-slate-800">編輯句子模板</h3>
                            <button onClick={() => setEditingSentenceTemplate(false)} className="text-slate-400 hover:text-slate-600 text-2xl">✕</button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">可用變數</label>
                                <p className="text-sm text-slate-500 mb-2">{'{W}'} = 長、{'{H}'} = 寬、{'{C}'} = 鐘點、{'{D}'} = 距離</p>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">句子模板</label>
                                <textarea
                                    value={breastNoduleSentenceTemplate}
                                    onInput={(e) => setBreastNoduleSentenceTemplate(e.target.value)}
                                    rows="4"
                                    className="w-full px-4 py-3 border rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm leading-relaxed"
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button onClick={() => setEditingSentenceTemplate(false)} className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-bold hover:bg-blue-700 shadow-md shadow-blue-100">儲存</button>
                                <button onClick={() => setEditingSentenceTemplate(false)} className="px-6 py-2 bg-slate-100 text-slate-600 rounded-lg font-bold hover:bg-slate-200">取消</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 拖曳頁籤時跟隨游標的幽靈標籤 */}
            {dragTabGhost && (
                <div
                    className="fixed z-[9999] pointer-events-none rounded-full flex items-center justify-center shadow-xl border-2 border-slate-400 bg-slate-200 text-slate-800 font-bold text-sm whitespace-nowrap px-4 py-2"
                    style={{
                        left: dragTabGhost.x,
                        top: dragTabGhost.y,
                        width: dragTabGhost.width,
                        height: dragTabGhost.height,
                        boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.15), 0 8px 10px -6px rgb(0 0 0 / 0.1)'
                    }}
                >
                    {dragTabGhost.name}
                </div>
            )}
            {/* 拖曳時跟隨游標的按鈕幽靈 */}
            {dragGhost && (
                <div
                    className="fixed z-[9999] pointer-events-none rounded-lg overflow-hidden flex shadow-xl border-2 border-blue-400 bg-white text-slate-700 font-medium"
                    style={{
                        left: dragGhost.x,
                        top: dragGhost.y,
                        width: dragGhost.width,
                        height: dragGhost.height,
                        boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.15), 0 8px 10px -6px rgb(0 0 0 / 0.1)'
                    }}
                >
                    <span className="w-4 shrink-0 rounded-l-lg bg-slate-100/80" />
                    <span className="flex-1 px-3 py-3 flex items-center min-w-0 truncate">{dragGhost.name}</span>
                </div>
            )}
            {/* Toast 提示：3 秒後淡出並略往上滑後消失 */}
            {toast && (
                <div
                    className={`fixed left-1/2 top-6 z-[10000] px-5 py-3 rounded-lg shadow-lg text-sm font-medium text-white toast-disappear ${
                        toast.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'
                    }`}
                    role="alert"
                >
                    {toast.message}
                </div>
            )}
        </div>
    );
}