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

// C 清除鍵圖示（線條垃圾桶 T1）
function EraserIcon({ size = 12, className = '' }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
    );
}

// M 鍵圖示（加號 A1 圓角粗線＋，加入暫存）；color:inherit 使線條與按鈕數字同色
function ListIcon({ size = 12, className = '' }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" className={className} style={{ color: 'inherit' }} aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
        </svg>
    );
}

// 甲狀腺外框 SVG（來自 file.svg，僅線條可編輯）
const THYROID_VIEWBOX = '274 208 480 374';
const THYROID_PATH = 'M653.985840,220.653915 C682.355042,221.259750 702.516235,235.096466 716.516663,258.188324 C731.378601,282.701080 737.488220,310.169281 741.339417,338.227936 C743.129395,351.268951 744.282715,364.420319 744.050293,377.523651 C743.220581,424.298248 734.972473,469.836731 718.948303,513.812622 C713.287292,529.348450 704.536072,543.051575 690.576843,552.813965 C663.135498,572.005005 631.689941,568.548828 607.770386,543.993835 C598.325378,534.297913 590.353699,523.383179 581.222839,513.443542 C565.103210,495.896118 545.780151,484.204102 521.787476,481.688751 C504.628082,479.889832 488.345947,483.563354 473.097137,491.712677 C457.760864,499.908752 446.319122,512.340210 435.636444,525.690063 C427.520203,535.832764 419.054443,545.575012 408.423035,553.397583 C380.635101,573.843811 347.180389,565.213440 327.228668,544.606995 C314.326721,531.281616 307.743164,514.555420 302.527557,497.199921 C293.984192,468.770508 287.623047,439.836212 284.999756,410.262787 C281.532898,371.179443 283.308044,332.403168 294.990234,294.579224 C300.327026,277.300201 306.930725,260.516205 319.011230,246.690872 C337.451935,225.586731 360.659576,216.587555 388.395050,222.136902 C403.624603,225.184021 414.139862,235.567245 422.353241,248.274857 C430.511230,260.896698 436.039917,274.940338 443.475708,287.945129 C453.103760,304.784119 464.601135,320.069031 482.654663,328.784668 C513.202637,343.532166 546.837585,335.500275 569.474915,308.543793 C579.551392,296.544739 586.604980,282.781555 593.444763,268.872040 C598.156616,259.289886 603.006958,249.826202 609.697510,241.407425 C620.917786,227.288757 635.341125,220.064529 653.985840,220.653915 M723.645691,472.260681 C724.848877,466.568848 725.944458,460.851776 727.274109,455.189636 C732.657104,432.266602 735.359131,409.029175 735.876160,385.500122 C736.220642,369.821777 735.647461,354.190430 733.637146,338.648712 C730.392822,313.567383 724.582275,289.134766 712.483826,266.709717 C701.499023,246.348953 685.440552,232.167953 661.681763,228.816650 C645.086365,226.475769 630.291687,230.033325 618.562683,243.001877 C610.619263,251.784882 605.380615,262.167114 600.268188,272.649658 C591.695374,290.227234 582.210510,307.109619 567.978333,320.979004 C536.984924,351.182465 489.585114,351.208679 458.823578,320.870880 C448.625732,310.813507 440.699127,299.169373 434.031342,286.591553 C427.718964,274.684174 422.426331,262.253113 414.889771,250.974472 C400.906830,230.048645 382.073303,224.515549 358.807343,230.140366 C337.851685,235.206635 323.713531,249.133774 314.152924,267.954315 C302.090393,291.699982 296.102325,317.125061 293.116638,343.472198 C290.287994,368.433868 290.729340,393.352142 293.512573,418.194153 C296.854279,448.020660 303.817108,477.135437 313.415649,505.561493 C318.037415,519.248840 324.806732,531.864075 335.586029,541.865967 C354.215546,559.151855 383.686066,563.243774 405.141968,546.268555 C412.256470,540.639709 418.527863,534.250183 424.280975,527.340820 C433.869995,515.824585 442.948883,503.876984 454.892395,494.543762 C477.730804,476.696686 503.342255,470.047455 531.830078,475.707367 C556.277527,480.564636 575.210815,494.472626 591.157593,513.003723 C600.811523,524.222168 609.358215,536.479309 621.297241,545.568970 C639.640320,559.534363 661.207642,560.892639 681.143616,549.492432 C696.236877,540.861572 705.154785,527.262939 711.505188,511.669617 C716.600159,499.158936 720.046814,486.111725 723.645691,472.260681 z';
function ThyroidOutline({ className = '', strokeWidth = 0.45, stroke = '#334155' }) {
    return (
        <svg viewBox={THYROID_VIEWBOX} className={className} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" preserveAspectRatio="xMidYMid meet" aria-label="甲狀腺">
            <path d={THYROID_PATH} />
        </svg>
    );
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
        ? 'bg-blue-50 border-2 border-blue-400 text-blue-600 shadow-md'
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
                                            ? 'bg-blue-500 text-white scale-110'
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
                                                ? 'bg-blue-500 text-white scale-110'
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
                                            ? 'bg-blue-500 text-white scale-110'
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
                                    className={`text-[10px] font-bold rounded transition-all z-10 relative flex items-center justify-center shrink-0 ${copiedId === `${template.id}-enlarged-small` ? 'bg-blue-500 text-white scale-110' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95'}`}
                                    title="替換為 No enlarged" style={{ width: '20px', height: '20px' }}>小</button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); copyEnlarged(template, 'medium'); }}
                                    className={`text-[10px] font-bold rounded transition-all z-10 relative flex items-center justify-center shrink-0 ${copiedId === `${template.id}-enlarged-medium` ? 'bg-blue-500 text-white scale-110' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95'}`}
                                    title="替換為 Borderline enlarged" style={{ width: '20px', height: '20px' }}>中</button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); copyEnlarged(template, 'large'); }}
                                    className={`text-[10px] font-bold rounded transition-all z-10 relative flex items-center justify-center shrink-0 ${copiedId === `${template.id}-enlarged-large` ? 'bg-blue-500 text-white scale-110' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95'}`}
                                    title="替換為 Enlarged" style={{ width: '20px', height: '20px' }}>大</button>
                            </div>
                        )}
                        {hasSeverity && !showEditButtons && (
                            <div className="flex items-center gap-[4px] ml-1">
                                <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); copySeverity(template, 'mild'); }}
                                    className={`text-[10px] font-bold rounded transition-all z-10 relative flex items-center justify-center shrink-0 ${copiedId === `${template.id}-severity-mild` ? 'bg-blue-500 text-white scale-110' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95'}`}
                                    title="替換為 Mild" style={{ width: '20px', height: '20px' }}>輕</button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); copySeverity(template, 'moderate'); }}
                                    className={`text-[10px] font-bold rounded transition-all z-10 relative flex items-center justify-center shrink-0 ${copiedId === `${template.id}-severity-moderate` ? 'bg-blue-500 text-white scale-110' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95'}`}
                                    title="替換為 Moderate" style={{ width: '20px', height: '20px' }}>中</button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); copySeverity(template, 'severe'); }}
                                    className={`text-[10px] font-bold rounded transition-all z-10 relative flex items-center justify-center shrink-0 ${copiedId === `${template.id}-severity-severe` ? 'bg-blue-500 text-white scale-110' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95'}`}
                                    title="替換為 Severe" style={{ width: '20px', height: '20px' }}>重</button>
                            </div>
                        )}
                        {hasLobe && !showEditButtons && (
                            <div className="flex items-center gap-1 ml-1">
                                <div className="flex flex-col gap-0.5">
                                    <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); copyLobe(template, 'rul'); }}
                                        className={`text-[8px] font-bold px-1 py-0.5 rounded transition-all z-10 relative ${copiedId === `${template.id}-lobe-rul` ? 'bg-blue-500 text-white scale-110' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95'}`}
                                        title="替換為 RUL" style={{ minWidth: '16px', minHeight: '16px', lineHeight: '1' }}>上</button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); copyLobe(template, 'rml'); }}
                                        className={`text-[8px] font-bold px-1 py-0.5 rounded transition-all z-10 relative ${copiedId === `${template.id}-lobe-rml` ? 'bg-blue-500 text-white scale-110' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95'}`}
                                        title="替換為 RML" style={{ minWidth: '16px', minHeight: '16px', lineHeight: '1' }}>中</button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); copyLobe(template, 'rll'); }}
                                        className={`text-[8px] font-bold px-1 py-0.5 rounded transition-all z-10 relative ${copiedId === `${template.id}-lobe-rll` ? 'bg-blue-500 text-white scale-110' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95'}`}
                                        title="替換為 RLL" style={{ minWidth: '16px', minHeight: '16px', lineHeight: '1' }}>下</button>
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); copyLobe(template, 'lul'); }}
                                        className={`text-[8px] font-bold px-1 py-0.5 rounded transition-all z-10 relative ${copiedId === `${template.id}-lobe-lul` ? 'bg-blue-500 text-white scale-110' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95'}`}
                                        title="替換為 LUL" style={{ minWidth: '16px', minHeight: '16px', lineHeight: '1' }}>上</button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); copyLobe(template, 'lll'); }}
                                        className={`text-[8px] font-bold px-1 py-0.5 rounded transition-all z-10 relative ${copiedId === `${template.id}-lobe-lll` ? 'bg-blue-500 text-white scale-110' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95'}`}
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

// 確保名為「乳房結節描述」的分組有 breastNodule 類型
function ensureBreastNoduleTypes(tabsData) {
    if (!Array.isArray(tabsData)) return tabsData;
    return tabsData.map(tab => ({
        ...tab,
        left: (tab.left || []).map(g =>
            g.name === '乳房結節描述' ? { ...g, type: g.type || 'breastNodule' } : g
        ),
        right: (tab.right || []).map(g =>
            g.name === '乳房結節描述' ? { ...g, type: g.type || 'breastNodule' } : g
        )
    }));
}

function ensureThyroidNoduleTypes(tabsData) {
    if (!Array.isArray(tabsData)) return tabsData;
    return tabsData.map(tab => ({
        ...tab,
        left: (tab.left || []).map(g =>
            g.name === '甲狀腺結節描述' ? { ...g, type: g.type || 'thyroidNodule' } : g
        ),
        right: (tab.right || []).map(g =>
            g.name === '甲狀腺結節描述' ? { ...g, type: g.type || 'thyroidNodule' } : g
        )
    }));
}

// 從 localStorage 讀取初始狀態，避免 useEffect 造成的閃爍
function loadInitialState() {
    const defaultTabs = [{ id: 'tab-default', name: '新頁籤', left: [], right: [] }];
    const defaultConfig = { spreadsheetId: '', apiKey: '', scriptUrl: '', isConnected: false };
    try {
        const saved = localStorage.getItem(STORAGE_KEY)
            || localStorage.getItem('radiologyTemplatesConfig_v2');
        if (saved) {
            const data = JSON.parse(saved);
            let tabs = defaultTabs;
            let activeTabIdx = 0;
            let config = defaultConfig;
            if (data.tabs && Array.isArray(data.tabs)) {
                const baseTabs = isLegacyV2Tabs(data.tabs) ? migrateV2ToV3(data.tabs) : data.tabs;
                tabs = ensureThyroidNoduleTypes(ensureBreastNoduleTypes(baseTabs));
                if (typeof data.activeTabIdx === 'number' && data.activeTabIdx >= 0 && data.activeTabIdx < tabs.length) {
                    activeTabIdx = data.activeTabIdx;
                }
            }
            if (data.config) config = data.config;
            return { tabs, activeTabIdx, config };
        }
    } catch (e) {
        console.error("localStorage 存取失敗", e);
    }
    return { tabs: defaultTabs, activeTabIdx: 0, config: defaultConfig };
}

export function App() {
    const initialState = loadInitialState();

    const [tabs, setTabs] = useState(initialState.tabs);
    const [activeTabIdx, setActiveTabIdx] = useState(initialState.activeTabIdx);
    
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
    const [breastNoduleMergedTemplate, setBreastNoduleMergedTemplate] = useState("Some small hypoechoic nodules ({SIZES}) at {C}'{D} from nipple.");
    const [breastNodulePendingTexts, setBreastNodulePendingTexts] = useState([]); // 暫存多顆結節的結構資料 { w, h, clock }，搭配 M 鍵使用
    const [editingSentenceTemplate, setEditingSentenceTemplate] = useState(false);
    const [lastDistKeyPressed, setLastDistKeyPressed] = useState(null);
    const [breastNoduleSizeKeyHighlight, setBreastNoduleSizeKeyHighlight] = useState(null); // 'C' 時顯示尺寸鍵盤 C 反白
    const [thyroidNoduleParams, setThyroidNoduleParams] = useState({
        right: { sizeWStr: '0', sizeHStr: '0', activeField: null, reEnterPending: false },
        left: { sizeWStr: '0', sizeHStr: '0', activeField: null, reEnterPending: false }
    });
    const [thyroidNoduleSentenceTemplate, setThyroidNoduleSentenceTemplate] = useState("A {W}x{H}cm hypoechoic nodule at {SIDE} lobe of thyroid gland.");
    const [thyroidNoduleMergedTemplate, setThyroidNoduleMergedTemplate] = useState("Several hypoechoic nodules ({SIZES}) at {SIDE} lobe of thyroid gland.");
    const [thyroidNoduleMultiExampleTemplate, setThyroidNoduleMultiExampleTemplate] = useState("Several hypoechoic nodules ({SIZES}) at {SIDE} lobe of thyroid gland."); // 3+ 顆時使用
    const [thyroidNodulePending, setThyroidNodulePending] = useState([]); // [{w, h, side}, ...] 單一暫存，同時輸出左右側
    const [thyroidLastKeyPressed, setThyroidLastKeyPressed] = useState({ right: null, left: null });
    const [thyroidPlusHighlightLobe, setThyroidPlusHighlightLobe] = useState(null); // + 點擊後反白 1 秒，'left' | null
    const [thyroidNoduleSizeKeyHighlight, setThyroidNoduleSizeKeyHighlight] = useState(null); // 'right' | 'left' | null
    const [thyroidJustReachedThree, setThyroidJustReachedThree] = useState(false); // 單一 + 新增至某側 3 顆時為 true，點 split + 或 C 後清除
    const [editingThyroidSentenceTemplate, setEditingThyroidSentenceTemplate] = useState(false);
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
    const copiedTimerRef = useRef(null); // 控制組套複製後高亮時間，確保最後一次點擊維持完整 1 秒
    const leftGroupsContainerRef = useRef(null);  // 左側分組容器 ref
    const rightGroupsContainerRef = useRef(null); // 右側分組容器 ref
    const thyroidNoduleParamsRef = useRef(thyroidNoduleParams);
    thyroidNoduleParamsRef.current = thyroidNoduleParams;
    const thyroidNodulePendingRef = useRef(thyroidNodulePending);
    thyroidNodulePendingRef.current = thyroidNodulePending;
    const tabEditAreaRef = useRef(null);          // 當前頁籤標題與操作區域 ref
    const tabScrollRef = useRef(null);            // 頁籤欄左右滑動容器 ref
    
    const [config, setConfig] = useState(initialState.config);
    const [toast, setToast] = useState(null); // { message, type: 'success'|'error' }，3 秒後自動消失
    const toastTimerRef = useRef(null);
    const showToast = (message, type = 'success') => {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setToast({ message, type });
        toastTimerRef.current = setTimeout(() => { setToast(null); toastTimerRef.current = null; }, 3000);
    };

    // 取得當前頁籤的資料方便操作
    const activeTab = tabs[activeTabIdx] || tabs[0];
    const thyroidShowSplitPlus = thyroidJustReachedThree;

    // 將名稱為「乳房結節描述」的分組補上 type，避免因匯入或外部腳本改動而失去特殊 UI

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
            let thyroidNoduleTemplateFromSheets = null;

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
                        if (gName === '甲狀腺結節描述' && content) {
                            const isThyroidTemplateRow = templateName === '句子模板';
                            if (isThyroidTemplateRow || thyroidNoduleTemplateFromSheets == null) {
                                thyroidNoduleTemplateFromSheets = content;
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
                        if (gName === '甲狀腺結節描述' && content) {
                            const isThyroidTemplateRow = templateName === '句子模板';
                            if (isThyroidTemplateRow || thyroidNoduleTemplateFromSheets == null) {
                                thyroidNoduleTemplateFromSheets = content;
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
                        ...(name === '乳房結節描述' ? { type: 'breastNodule' } : name === '甲狀腺結節描述' ? { type: 'thyroidNodule' } : {})
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
            if (thyroidNoduleTemplateFromSheets != null) {
                setThyroidNoduleSentenceTemplate(thyroidNoduleTemplateFromSheets);
            }
            const keepIdx = activeTabIdx < newTabs.length ? activeTabIdx : 0;
            setActiveTabIdx(keepIdx);
            saveToLocal(newTabs, config, keepIdx);
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
                    if (group.type === 'breastNodule') {
                        const baseItems = group.items || [];
                        const withoutTemplate = baseItems.filter(it => it.name !== '句子模板' && it.name !== '合併模板');
                        return { ...group, items: [...withoutTemplate, { id: `${group.id}-template`, name: '句子模板', content: breastNoduleSentenceTemplate }, { id: `${group.id}-merged-template`, name: '合併模板', content: breastNoduleMergedTemplate }] };
                    }
                    if (group.type === 'thyroidNodule') {
                        const baseItems = group.items || [];
                        const withoutTemplate = baseItems.filter(it => it.name !== '句子模板' && it.name !== '合併模板' && it.name !== '多顆範例模板');
                        return { ...group, items: [...withoutTemplate, { id: `${group.id}-template`, name: '句子模板', content: thyroidNoduleSentenceTemplate }, { id: `${group.id}-merged-template`, name: '合併模板', content: thyroidNoduleMergedTemplate }, { id: `${group.id}-multi-example-template`, name: '多顆範例模板', content: thyroidNoduleMultiExampleTemplate }] };
                    }
                    return group;
                }),
                right: (tab.right || []).map(group => {
                    if (group.type === 'breastNodule') {
                        const baseItems = group.items || [];
                        const withoutTemplate = baseItems.filter(it => it.name !== '句子模板' && it.name !== '合併模板');
                        return { ...group, items: [...withoutTemplate, { id: `${group.id}-template`, name: '句子模板', content: breastNoduleSentenceTemplate }, { id: `${group.id}-merged-template`, name: '合併模板', content: breastNoduleMergedTemplate }] };
                    }
                    if (group.type === 'thyroidNodule') {
                        const baseItems = group.items || [];
                        const withoutTemplate = baseItems.filter(it => it.name !== '句子模板' && it.name !== '合併模板' && it.name !== '多顆範例模板');
                        return { ...group, items: [...withoutTemplate, { id: `${group.id}-template`, name: '句子模板', content: thyroidNoduleSentenceTemplate }, { id: `${group.id}-merged-template`, name: '合併模板', content: thyroidNoduleMergedTemplate }, { id: `${group.id}-multi-example-template`, name: '多顆範例模板', content: thyroidNoduleMultiExampleTemplate }] };
                    }
                    return group;
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

    const markCopied = (id) => {
        if (copiedTimerRef.current) {
            clearTimeout(copiedTimerRef.current);
        }
        setCopiedId(id);
        copiedTimerRef.current = setTimeout(() => {
            setCopiedId(null);
            copiedTimerRef.current = null;
        }, 1000);
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
            markCopied(`${template.id}-enlarged-${size}`);
        } catch (err) {
            // Fallback for older browsers
            const ta = document.createElement('textarea');
            ta.value = textToCopy;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            markCopied(`${template.id}-enlarged-${size}`);
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
            markCopied(`${template.id}-lobe-${lobe}`);
        } catch (err) {
            // Fallback for older browsers
            const ta = document.createElement('textarea');
            ta.value = textToCopy;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            markCopied(`${template.id}-lobe-${lobe}`);
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
            markCopied(`${template.id}-severity-${severity}`);
        } catch (err) {
            // Fallback for older browsers
            const ta = document.createElement('textarea');
            ta.value = textToCopy;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            markCopied(`${template.id}-severity-${severity}`);
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
            markCopied(`${template.id}-${side}`);
        } catch (err) {
            // Fallback for older browsers
            const ta = document.createElement('textarea');
            ta.value = textToCopy;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            markCopied(`${template.id}-${side}`);
        }
    };

    const copyToClipboard = async (template) => {
        const text = template.content;
        try {
            await navigator.clipboard.writeText(text);
            markCopied(template.id);
        } catch (err) {
            // Fallback for older browsers
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            markCopied(template.id);
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

    const formatSizeDisplay = (str, placeholder, forThyroid = false) => {
        if (!str) return placeholder;
        if (str === '0') return '0';
        if (str.includes('.')) return str;
        if (str.length >= 2) return str;
        if (forThyroid) return str; // 甲狀腺：第一數字為個位數
        return `0.${str}`;
    };

    const parseSizeValue = (str, forThyroid = false) => {
        if (!str) return 0;
        if (str.includes('.')) return parseFloat(str) || 0;
        if (forThyroid || str.length >= 2) return parseFloat(str) || 0; // 甲狀腺或多位：個位數
        return parseFloat(`0.${str}`) || 0;
    };

    const generateNoduleTexts = (nodules, dist) => {
        const groups = {};
        const order = [];
        for (const n of nodules) {
            const key = String(n.clock);
            if (!groups[key]) { groups[key] = { clock: n.clock, items: [] }; order.push(key); }
            groups[key].items.push(n);
        }
        const lines = [];
        for (const key of order) {
            const g = groups[key];
            if (g.items.length === 1) {
                const { w, h } = g.items[0];
                let text = breastNoduleSentenceTemplate
                    .replace(/\{W\}/g, String(w))
                    .replace(/\{H\}/g, String(h))
                    .replace(/\{C\}/g, String(g.clock))
                    .replace(/\{D\}/g, '/' + dist + ' cm');
                if (w >= 1 || h >= 1) {
                    text = text.replace(/\bsmall\b/gi, '').replace(/\s{2,}/g, ' ');
                }
                lines.push(text);
            } else {
                const sizes = g.items.map(n => `${n.w}x${n.h}cm`).join(', ');
                const anyLarge = g.items.some(n => n.w >= 1 || n.h >= 1);
                let text = breastNoduleMergedTemplate
                    .replace(/\{SIZES\}/g, sizes)
                    .replace(/\{C\}/g, String(g.clock))
                    .replace(/\{D\}/g, '/' + dist + ' cm');
                if (anyLarge) {
                    text = text.replace(/\bsmall\b/gi, '').replace(/\s{2,}/g, ' ');
                }
                lines.push(text);
            }
        }
        return lines;
    };

    const applyBreastNoduleKeypad = (key) => {
        if (key === 'C') {
            setBreastNodulePendingTexts([]);
            setBreastNoduleSizeKeyHighlight('C');
            setTimeout(() => setBreastNoduleSizeKeyHighlight(null), 1000);
            setBreastNoduleGroupParams({ sizeWStr: '0', sizeHStr: '0', clock: null, distStr: '0', activeField: null, reEnterPending: false });
            return;
        }
        setBreastNoduleGroupParams((p) => {
            const { activeField, sizeWStr, sizeHStr, distStr } = p;
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

    const applyThyroidNoduleKeypad = (lobeSide, key) => {
        if (key === 'M' || key === 'MR' || key === 'ML') {
            handleThyroidAction(lobeSide, key);
            return;
        }
        if (key === 'C') {
            thyroidNodulePendingRef.current = [];
            setThyroidNodulePending([]);
            setThyroidJustReachedThree(false);
            setThyroidNoduleSizeKeyHighlight(lobeSide);
            setTimeout(() => setThyroidNoduleSizeKeyHighlight(null), 1000);
            // 同時清除剪貼簿中剛複製的結節句子
            if (navigator.clipboard?.writeText) {
                navigator.clipboard.writeText('').catch(() => {});
            }
        }
        setThyroidNoduleParams(prev => {
            const p = prev[lobeSide];
            const { activeField, sizeWStr, sizeHStr } = p;
            let updated;
            if (key === 'C') {
                const cleared = { right: { sizeWStr: '0', sizeHStr: '0', activeField: null, reEnterPending: false }, left: { sizeWStr: '0', sizeHStr: '0', activeField: null, reEnterPending: false } };
                thyroidNoduleParamsRef.current = cleared;
                return cleared;
            } else if (activeField === null) {
                if (key === '.') return prev;
                updated = { ...p, sizeWStr: key, activeField: 'sizeW', reEnterPending: false };
            } else if (activeField === 'sizeW') {
                // 與乳房結節相同邏輯
                if (p.reEnterPending && key !== '.') {
                    updated = { ...p, sizeWStr: key, reEnterPending: false };
                } else if (key === '.') {
                    if (sizeWStr && !sizeWStr.includes('.') && sizeWStr !== '0') updated = { ...p, sizeWStr: sizeWStr + '.', reEnterPending: false };
                    else return prev;
                } else if (!sizeWStr || sizeWStr === '0') {
                    updated = { ...p, sizeWStr: key, reEnterPending: false };
                } else if (sizeWStr.includes('.')) {
                    if ((sizeWStr.split('.')[1] || '').length >= 1) return prev;
                    updated = { ...p, sizeWStr: sizeWStr + key, activeField: 'sizeH', reEnterPending: false };
                } else {
                    // 允許多位整數（如 10、11）再按 . 輸入小數
                    updated = { ...p, sizeWStr: sizeWStr + key, reEnterPending: false };
                }
            } else if (activeField === 'sizeH') {
                // 與乳房結節相同邏輯
                if (key === '.') {
                    if (sizeHStr && !sizeHStr.includes('.') && sizeHStr !== '0') updated = { ...p, sizeHStr: sizeHStr + '.', reEnterPending: false };
                    else return prev;
                } else if (p.reEnterPending || !sizeHStr || sizeHStr === '0') {
                    updated = { ...p, sizeHStr: key, reEnterPending: false };
                } else if (sizeHStr.includes('.')) {
                    if ((sizeHStr.split('.')[1] || '').length >= 1) return prev;
                    updated = { ...p, sizeHStr: sizeHStr + key, reEnterPending: false };
                } else {
                    // 允許多位整數（如 2、12）
                    updated = { ...p, sizeHStr: sizeHStr + key, reEnterPending: false };
                }
            } else {
                return prev;
            }
            const nextState = { ...prev, [lobeSide]: updated || p };
            thyroidNoduleParamsRef.current = nextState; // 即時同步 ref，確保 + 能讀到剛輸入的值
            if (key !== 'C' && key !== '.') {
                const newP = nextState[lobeSide];
                const completingW = parseSizeValue(newP.sizeWStr, true);
                const completingH = parseSizeValue(newP.sizeHStr, true);
                if (completingW > 0 && completingH > 0) {
                    const nodesFromParams = [];
                    for (const s of ['right', 'left']) {
                        const q = nextState[s];
                        const qw = parseSizeValue(q.sizeWStr, true);
                        const qh = parseSizeValue(q.sizeHStr, true);
                        if (qw > 0 && qh > 0) nodesFromParams.push({ w: qw, h: qh, side: s });
                    }
                    const pending = thyroidNodulePendingRef.current;
                    const nodesToOutput = []; // 同側：pending（先前+加入） + params（本次輸入完成）
                    for (const s of ['right', 'left']) {
                        const fromP = nodesFromParams.filter(n => n.side === s);
                        const fromPending = pending.filter(n => n.side === s);
                        nodesToOutput.push(...fromPending, ...fromP);
                    }
                    if (nodesToOutput.length > 0) outputThyroidFromNodes(nodesToOutput);
                }
            }
            return nextState;
        });
    };

    const outputThyroidFromNodes = (nodes) => {
        if (!nodes || nodes.length === 0) return;
        const bySide = { right: nodes.filter(n => n.side === 'right').map(n => ({ w: n.w, h: n.h })), left: nodes.filter(n => n.side === 'left').map(n => ({ w: n.w, h: n.h })) };
        const outputLines = [];
        for (const side of ['right', 'left']) {
            const nodules = bySide[side];
            if (nodules.length === 0) continue;
            const sizes = nodules.map(n => `${n.w}x${n.h}cm`).join(', ');
            const template = nodules.length === 1 ? thyroidNoduleSentenceTemplate : nodules.length === 2 ? thyroidNoduleMergedTemplate : thyroidNoduleMultiExampleTemplate;
            const line = nodules.length === 1
                ? template.split('{W}').join(String(nodules[0].w)).split('{H}').join(String(nodules[0].h)).split('{SIDE}').join(side)
                : template.split('{SIZES}').join(sizes).split('{SIDE}').join(side);
            outputLines.push(...line.split('\n').filter(l => l.trim() !== ''));
        }
        if (outputLines.length === 0) return;
        const finalText = outputLines.map(l => `   - ${l.replace(/^\s*-\s*/, '')}`).join('\n');
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(finalText).catch(() => {});
        else { const ta = document.createElement('textarea'); ta.value = finalText; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); }
    };

    const copyThyroidNoduleOutput = (completingLobeSide, sizeWStr, sizeHStr) => {
        const completingW = parseSizeValue(sizeWStr, true);
        const completingH = parseSizeValue(sizeHStr, true);
        if (completingW === 0 || completingH === 0) return;
        const outputLines = [];
        const newPending = []; // 累積本次輸出的結節，供後續繼續追加
        const bySide = { right: thyroidNodulePending.filter(p => p.side === 'right').map(p => ({ w: p.w, h: p.h })), left: thyroidNodulePending.filter(p => p.side === 'left').map(p => ({ w: p.w, h: p.h })) };
        for (const side of ['right', 'left']) {
            const pending = bySide[side];
            const p = thyroidNoduleParams[side];
            const w = parseSizeValue(p.sizeWStr, true);
            const h = parseSizeValue(p.sizeHStr, true);
            const currentNodule = (w > 0 && h > 0) ? { w, h } : null;
            let nodules;
            if (side === completingLobeSide) {
                nodules = [...pending, { w: completingW, h: completingH }];
            } else if (pending.length > 0 || currentNodule) {
                nodules = currentNodule ? [...pending, currentNodule] : pending;
            } else {
                continue;
            }
            if (nodules.length === 0) continue;
            for (const n of nodules) newPending.push({ w: n.w, h: n.h, side });
            const tmpl = nodules.length === 1 ? thyroidNoduleSentenceTemplate : nodules.length === 2 ? thyroidNoduleMergedTemplate : thyroidNoduleMultiExampleTemplate;
            let line;
            if (nodules.length === 1) {
                line = tmpl.split('{W}').join(String(nodules[0].w)).split('{H}').join(String(nodules[0].h)).split('{SIDE}').join(side);
            } else {
                const sizes = nodules.map(n => `${n.w}x${n.h}cm`).join(', ');
                line = tmpl.split('{SIZES}').join(sizes).split('{SIDE}').join(side);
            }
            outputLines.push(...line.split('\n').filter(l => l.trim() !== ''));
        }
        if (outputLines.length === 0) return;
        setThyroidNodulePending(newPending);
        setThyroidNoduleParams({
            right: { sizeWStr: '0', sizeHStr: '0', activeField: null, reEnterPending: false },
            left: { sizeWStr: '0', sizeHStr: '0', activeField: null, reEnterPending: false }
        });
        const finalText = outputLines.map(line => {
            const core = line.replace(/^\s*-\s*/, '');
            return `   - ${core}`;
        }).join('\n');
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(finalText).catch(() => {
                const ta = document.createElement('textarea'); ta.value = finalText; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
            });
        } else {
            const ta = document.createElement('textarea'); ta.value = finalText; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
        }
    };

    const handleThyroidAction = (lobeSide, key) => {
        const p = thyroidNoduleParams[lobeSide];
        const w = parseSizeValue(p.sizeWStr, true);
        const h = parseSizeValue(p.sizeHStr, true);
        if (key === 'M' || key === 'MR' || key === 'ML') {
            const params = thyroidNoduleParamsRef.current;
            const rightP = params.right;
            const rightW = parseSizeValue(rightP.sizeWStr, true);
            const rightH = parseSizeValue(rightP.sizeHStr, true);
            const leftP = params.left;
            const leftW = parseSizeValue(leftP.sizeWStr, true);
            const leftH = parseSizeValue(leftP.sizeHStr, true);
            const rightValid = rightW > 0 && rightH > 0;
            const leftValid = leftW > 0 && leftH > 0;
            const pendingRight = thyroidNodulePendingRef.current.filter(p => p.side === 'right');
            const pendingLeft = thyroidNodulePendingRef.current.filter(p => p.side === 'left');
            const addRight = (key === 'M' && rightValid) || (key === 'MR' && rightValid);
            const addLeft = (key === 'M' && leftValid) || (key === 'ML' && leftValid);
            // 同側 ≥3 顆時，點同側 +（無新尺寸）→ 直接複製 Several 格式；點對側 +（需輸入該側尺寸）→ 新增對側結節
            const copyRightOnly = key === 'MR' && !rightValid && pendingRight.length >= 3;
            const copyLeftOnly = key === 'ML' && !leftValid && pendingLeft.length >= 3;
            if (key === 'MR') { setThyroidPlusHighlightLobe('right'); setTimeout(() => setThyroidPlusHighlightLobe(null), 1000); }
            else if (key === 'ML') { setThyroidPlusHighlightLobe('left'); setTimeout(() => setThyroidPlusHighlightLobe(null), 1000); }
            else { setThyroidPlusHighlightLobe(null); }
            const copyOppositeAndRevert = (key === 'MR' && pendingLeft.length >= 3 && !leftValid) || (key === 'ML' && pendingRight.length >= 3 && !rightValid);
            if (!addRight && !addLeft && !copyRightOnly && !copyLeftOnly && !copyOppositeAndRevert) return;
            if (copyRightOnly || copyLeftOnly || copyOppositeAndRevert) {
                outputThyroidFromNodes(thyroidNodulePendingRef.current);
                setThyroidJustReachedThree(false);
                return;
            }
            const toAdd = [];
            if (addRight) toAdd.push({ w: rightW, h: rightH, side: 'right' });
            if (addLeft) toAdd.push({ w: leftW, h: leftH, side: 'left' });
            const clearedParams = {
                right: addRight ? { sizeWStr: '0', sizeHStr: '0', activeField: null, reEnterPending: false } : rightP,
                left: addLeft ? { sizeWStr: '0', sizeHStr: '0', activeField: null, reEnterPending: false } : leftP
            };
            thyroidNoduleParamsRef.current = clearedParams;
            const newPending = [...thyroidNodulePendingRef.current, ...toAdd];
            thyroidNodulePendingRef.current = newPending;
            setThyroidNodulePending(newPending);
            const rightCount = newPending.filter(p => p.side === 'right').length;
            const leftCount = newPending.filter(p => p.side === 'left').length;
            if ((addRight && rightCount >= 3) || (addLeft && leftCount >= 3)) setThyroidJustReachedThree(true);
            outputThyroidFromNodes(newPending);
            setThyroidNoduleParams(prev => ({
                right: addRight ? { sizeWStr: '0', sizeHStr: '0', activeField: null, reEnterPending: false } : prev.right,
                left: addLeft ? { sizeWStr: '0', sizeHStr: '0', activeField: null, reEnterPending: false } : prev.left
            }));
            return;
        }

        if (key === 'N' && (w === 0 || h === 0)) return;
        if (key === 'N') {
            setThyroidLastKeyPressed(prev => ({ ...prev, [lobeSide]: key }));
            const pending = thyroidNodulePending.filter(p => p.side === lobeSide).map(p => ({ w: p.w, h: p.h }));
            let textToCopy;
            if (pending.length > 0) {
                const allNodules = [...pending, { w, h }];
                const sizes = allNodules.map(n => `${n.w}x${n.h}cm`).join(', ');
                const tmpl = allNodules.length === 2 ? thyroidNoduleMergedTemplate : thyroidNoduleMultiExampleTemplate;
                textToCopy = tmpl.replace(/\{SIZES\}/g, sizes).replace(/\{SIDE\}/g, lobeSide);
            } else {
                textToCopy = thyroidNoduleSentenceTemplate
                    .replace(/\{W\}/g, String(w))
                    .replace(/\{H\}/g, String(h))
                    .replace(/\{SIDE\}/g, lobeSide);
            }
            const lines = textToCopy.split('\n').filter(l => l.trim() !== '');
            const finalText = lines.map(line => {
                const core = line.replace(/^\s*-\s*/, '');
                return `   - ${core}`;
            }).join('\n');
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(finalText).catch(() => {
                    const ta = document.createElement('textarea'); ta.value = finalText; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
                });
            } else {
                const ta = document.createElement('textarea'); ta.value = finalText; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
            }
            setThyroidNodulePending(prev => prev.filter(p => p.side !== lobeSide));
            setThyroidNoduleParams(prev => ({
                ...prev,
                [lobeSide]: { sizeWStr: '0', sizeHStr: '0', activeField: null, reEnterPending: false }
            }));
            setTimeout(() => setThyroidLastKeyPressed(prev => ({ ...prev, [lobeSide]: null })), 1000);
        }
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

    // 重新命名分組；若新名稱為「乳房結節描述」則設為乳房結節類型，若從該名稱改為其他則清除類型
    const renameGroup = (side, groupId, newName) => {
        const updatedTabs = tabs.map((tab, ti) => {
            if (ti !== activeTabIdx) return tab;
            const groups = side === 'left' ? [...tab.left] : [...tab.right];
            const next = groups.map(g => {
                if (g.id !== groupId) return g;
                const trimmed = String(newName).trim();
                const isBreastName = trimmed === '乳房結節描述';
                const isThyroidName = trimmed === '甲狀腺結節描述';
                const type = isBreastName ? 'breastNodule' : isThyroidName ? 'thyroidNodule' : ((g.type === 'breastNodule' || g.type === 'thyroidNodule') ? undefined : g.type);
                return { ...g, name: newName, type };
            });
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
                            <button onClick={addNewTab} className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition shrink-0" title="新增頁籤">
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
                                        {...(group.type === 'thyroidNodule' && { 'data-thyroid-nodule-group': 'true' })}
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
                                                {(editingGroupsLeft || (editingTemplatesGroup?.groupId === group.id && editingTemplatesGroup?.side === 'left') || ((group.type === 'breastNodule' || group.type === 'thyroidNodule') && editingGroupName?.groupId === group.id && editingGroupName?.side === 'left')) && (
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
                                                            (editingTemplatesGroup?.groupId === group.id && editingTemplatesGroup?.side === 'left') || group.type === 'breastNodule' || group.type === 'thyroidNodule'
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
                                                        onClick={() => (group.type === 'breastNodule' || group.type === 'thyroidNodule') ? setEditingGroupName({ groupId: group.id, side: 'left', editing: true }) : setEditingTemplatesGroup({ groupId: group.id, side: 'left' })}
                                                        className="text-sm font-bold text-slate-700 truncate cursor-pointer hover:text-blue-600"
                                                        title="點擊編輯組套"
                                                    >
                                                        {group.name}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-baseline gap-1 shrink-0">
                                                {(group.type === 'breastNodule' || group.type === 'thyroidNodule') ? (
                                                    <>
                                                        {editingGroupName?.groupId === group.id && editingGroupName?.side === 'left' && (
                                                            <>
                                                                <button onClick={() => showDeleteGroupConfirm(group.id, 'left')} className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded" title="刪除分組">🗑️</button>
                                                                <button onClick={() => group.type === 'breastNodule' ? setEditingSentenceTemplate(!editingSentenceTemplate) : setEditingThyroidSentenceTemplate(!editingThyroidSentenceTemplate)} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="編輯">✏️</button>
                                                            </>
                                                        )}
                                                        {editingGroupsLeft && <button onClick={() => showDeleteGroupConfirm(group.id, 'left')} className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded" title="刪除分組">🗑️</button>}
                                                    </>
                                                ) : editingTemplatesGroup?.groupId === group.id && editingTemplatesGroup?.side === 'left' ? (
                                                    <>
                                                        <button onClick={() => showDeleteGroupConfirm(group.id, 'left')} className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded" title="刪除分組">🗑️</button>
                                                        <button onClick={() => addTemplateToGroup('left', group.id)} className="text-sm font-bold leading-none w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 select-none" title="新增組套">+</button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button onClick={() => { setEditingTemplatesGroup({ groupId: group.id, side: 'left' }); addTemplateToGroup('left', group.id); }} className="text-sm font-bold leading-none w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 select-none" title="新增組套">+</button>
                                                        {editingGroupsLeft && (
                                                            <button onClick={() => showDeleteGroupConfirm(group.id, 'left')} className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded" title="刪除分組">🗑️</button>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        {group.type === 'breastNodule' ? (
                                            <div className="grid grid-cols-2 gap-4 mt-2">
                                                <div className="rounded-lg border border-slate-200 bg-white p-3">
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
                                                                <button key={k} type="button" onClick={() => applyBreastNoduleKeypad(k)} className={`w-5 h-5 rounded border text-[10px] font-medium leading-none inline-flex items-center justify-center shrink-0 ${k === 'C' && breastNoduleSizeKeyHighlight === 'C' ? 'bg-blue-500 border-blue-600 text-white' : 'bg-white/90 border-slate-200 text-slate-700 hover:bg-slate-100'}`}><span className="inline-flex items-center justify-center w-full h-full leading-[1]">{k === 'C' ? <EraserIcon size={12} /> : k}</span></button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="rounded-lg border border-slate-200 bg-white p-3">
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
                                                                    <g
                                                                        key={h}
                                                                        onClick={() => {
                                                                            setBreastNoduleGroupParams(p => ({ ...p, clock: h }));
                                                                            setLastDistKeyPressed(null);
                                                                        }}
                                                                        style={{ cursor: 'pointer' }}
                                                                        transform={`translate(${x},${y})`}
                                                                    >
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
                                                                {['4','5','6','1','2','3','M','N','.'].map((k) => (
                                                                    <button
                                                                        key={`dist-${k}`}
                                                                        type="button"
                                                                        className={`w-5 h-5 rounded border text-[10px] font-medium leading-none flex items-center justify-center shadow-sm ${
                                                                            k === 'M'
                                                                                ? (lastDistKeyPressed === 'M'
                                                                                    ? (breastNodulePendingTexts.length > 0
                                                                                        ? 'bg-blue-500 border-blue-600 text-white'
                                                                                        : 'bg-red-500 border-red-600 text-white')
                                                                                    : 'bg-white/95 border-slate-200 text-slate-700 hover:bg-slate-100')
                                                                                : k === '.'
                                                                                    ? (lastDistKeyPressed === '.' && breastNoduleGroupParams.clock != null ? 'bg-blue-500 border-blue-600 text-white' : 'bg-white/95 border-slate-200 text-slate-700 hover:bg-slate-100')
                                                                                    : ((lastDistKeyPressed === k || (lastDistKeyPressed === '.' && breastNoduleGroupParams.distStr && breastNoduleGroupParams.distStr.split('.')[0] === k)) && breastNoduleGroupParams.clock != null
                                                                                        ? 'bg-blue-500 border-blue-600 text-white'
                                                                                        : 'bg-white/95 border-slate-200 text-slate-700 hover:bg-slate-100')
                                                                        }`}
                                                                        onClick={() => {
                                                                            // . 鍵：將離乳頭距離加上 .5（如 2 → 2.5），並複製
                                                                            if (k === '.') {
                                                                                if (breastNoduleGroupParams.clock == null) return;
                                                                                const w = parseSizeValue(breastNoduleGroupParams.sizeWStr);
                                                                                const h = parseSizeValue(breastNoduleGroupParams.sizeHStr);
                                                                                if (w === 0 || h === 0) return;
                                                                                const baseDistStr = breastNoduleGroupParams.distStr || '';
                                                                                if (baseDistStr.includes('.')) return; // 已有小數則不再追加
                                                                                const newDistStr = (baseDistStr || '0') + '.5';
                                                                                setBreastNoduleGroupParams(p => ({ ...p, distStr: newDistStr }));
                                                                                setLastDistKeyPressed('.');
                                                                                const c = breastNoduleGroupParams.clock;
                                                                                const numericDist = parseFloat(newDistStr) || 0;
                                                                                let singleText = breastNoduleSentenceTemplate
                                                                                    .replace(/\{W\}/g, String(w)).replace(/\{H\}/g, String(h))
                                                                                    .replace(/\{C\}/g, String(c))
                                                                                    .replace(/\{D\}/g, '/' + numericDist + ' cm');
                                                                                if (w >= 1 || h >= 1) singleText = singleText.replace(/\bsmall\b/gi, '').replace(/\s{2,}/g, ' ');
                                                                                let textToCopy = breastNodulePendingTexts.length > 0
                                                                                    ? generateNoduleTexts([...breastNodulePendingTexts, { w, h, clock: c }], String(numericDist)).join('\n')
                                                                                    : singleText;
                                                                                if (textToCopy) {
                                                                                    const lines = textToCopy.split('\n').filter(l => l.trim() !== '');
                                                                                    const finalText = lines.map(line => `   - ${line.replace(/^\s*-\s*/, '')}`).join('\n');
                                                                                    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(finalText).catch(() => {});
                                                                                    else { const ta = document.createElement('textarea'); ta.value = finalText; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); }
                                                                                }
                                                                                setTimeout(() => setLastDistKeyPressed(null), 1000);
                                                                                return;
                                                                            }
                                                                            // M 鍵：若尺寸/方位/距離未完整，不反白也不觸發任何動作
                                                                            if (k === 'M') {
                                                                                const w = parseSizeValue(breastNoduleGroupParams.sizeWStr);
                                                                                const h = parseSizeValue(breastNoduleGroupParams.sizeHStr);
                                                                                const distStr = breastNoduleGroupParams.distStr;
                                                                                if (w === 0 || h === 0 || breastNoduleGroupParams.clock == null || distStr === '' || distStr == null) {
                                                                                    return;
                                                                                }
                                                                            }
                                                                            setLastDistKeyPressed(k);
                                                                            // 若尚未選擇鐘點，只將按下的鍵標成紅色提醒，不做任何距離或複製動作
                                                                            if (breastNoduleGroupParams.clock == null) { return; }
                                                                            // 若長或寬為 0，視為尚未輸入完整尺寸，不產生句子也不更新距離
                                                                            const w = parseSizeValue(breastNoduleGroupParams.sizeWStr);
                                                                            const h = parseSizeValue(breastNoduleGroupParams.sizeHStr);
                                                                            if (w === 0 || h === 0) { return; }
                                                                            const baseDistStr = breastNoduleGroupParams.distStr;
                                                                            let newDistStr = baseDistStr;
                                                                            // 更新距離 state（數字鍵=重設，N/M 不改距離）
                                                                            if (['4','5','6','1','2','3'].includes(k)) {
                                                                                newDistStr = k; // 數字鍵一律視為重新輸入距離（單一位數）
                                                                                setBreastNoduleGroupParams(p => ({ ...p, distStr: newDistStr }));
                                                                            }
                                                                            const c = breastNoduleGroupParams.clock;
                                                                            const numericDist = parseFloat(newDistStr || baseDistStr) || 0;
                                                                            const dist = k === 'N' ? 'N' : String(numericDist);
                                                                            let singleText = breastNoduleSentenceTemplate
                                                                                .replace(/\{W\}/g, String(w))
                                                                                .replace(/\{H\}/g, String(h))
                                                                                .replace(/\{C\}/g, String(c))
                                                                                .replace(/\{D\}/g, '/' + dist + ' cm');
                                                                            // 長或寬任一 >= 1 時，自動移除 "small"
                                                                            if (w >= 1 || h >= 1) {
                                                                                singleText = singleText.replace(/\bsmall\b/gi, '').replace(/\s{2,}/g, ' ');
                                                                            }
                                                                            let textToCopy = singleText;

                                                                            if (k === 'M') {
                                                                                textToCopy = null;
                                                                                const noduleData = { w, h, clock: c };
                                                                                setBreastNodulePendingTexts(prev => {
                                                                                    if (prev.length > 0) {
                                                                                        const last = prev[prev.length - 1];
                                                                                        if (last.w === w && last.h === h && last.clock === c) return prev;
                                                                                    }
                                                                                    return [...prev, noduleData];
                                                                                });
                                                                                setTimeout(() => setLastDistKeyPressed(null), 1000);
                                                                                setBreastNoduleGroupParams(p => ({
                                                                                    ...p,
                                                                                    sizeWStr: '0',
                                                                                    sizeHStr: '0',
                                                                                    clock: null,
                                                                                    activeField: 'sizeW',
                                                                                    reEnterPending: true
                                                                                }));
                                                                            } else if (breastNodulePendingTexts.length > 0 && k !== '.') {
                                                                                const allNodules = [...breastNodulePendingTexts, { w, h, clock: c }];
                                                                                const allLines = generateNoduleTexts(allNodules, dist);
                                                                                textToCopy = allLines.join('\n');
                                                                                setBreastNodulePendingTexts(allNodules);
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
                                                                        <span className="inline-flex items-center justify-center w-full h-full leading-[1]">{k === 'M' ? '+' : k}</span>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : group.type === 'thyroidNodule' ? (
                                            <div className="rounded-lg border border-slate-200 bg-white p-0.5 flex flex-row items-start gap-3">
                                                <div className="relative flex-shrink-0 ml-4" style={{ width: '200px', aspectRatio: '480/374' }}>
                                                    <ThyroidOutline className="w-full h-full absolute inset-0 pointer-events-none" />
                                                    <div className="absolute inset-0 flex items-center justify-between" style={{ padding: '4% 5% 4% 5%' }}>
                                                        {['right', 'left'].map(lobeSide => (
                                                            <div key={lobeSide} className="flex flex-col items-center gap-0.5">
                                                                <div className="grid grid-cols-3 gap-0.5 p-0.5 max-w-[72px]">
                                                                    {(lobeSide === 'right' ? ['7','8','9','4','5','6','1','2','3','C','0','.'] : ['7','8','9','4','5','6','1','2','3','M','0','.']).map((k) => (
                                                                        (lobeSide === 'left' && k === 'M' && thyroidShowSplitPlus) ? (
                                                                            <div key={`thy-l-${lobeSide}-plus`} className="flex items-stretch gap-0 rounded overflow-hidden border border-slate-200 shadow-sm" style={{ width: '20px', height: '20px' }}>
                                                                                <button type="button" onClick={() => handleThyroidAction('right', 'MR')} title="加入右側" className={`flex-1 min-w-0 text-[9px] font-medium flex items-center justify-center border-r border-slate-200 ${thyroidPlusHighlightLobe === 'right' ? 'bg-blue-500 text-white' : 'bg-white/90 text-slate-700 hover:bg-slate-100'}`}>+</button>
                                                                                <button type="button" onClick={() => handleThyroidAction('left', 'ML')} title="加入左側" className={`flex-1 min-w-0 text-[9px] font-medium flex items-center justify-center ${thyroidPlusHighlightLobe === 'left' ? 'bg-blue-500 text-white' : 'bg-white/90 text-slate-700 hover:bg-slate-100'}`}>+</button>
                                                                            </div>
                                                                        ) : (
                                                                            <button key={`thy-l-${lobeSide}-${k}`} type="button" onClick={() => applyThyroidNoduleKeypad(lobeSide, k)} className={`w-5 h-5 rounded border text-[10px] font-medium leading-none flex items-center justify-center shadow-sm ${k === 'C' && thyroidNoduleSizeKeyHighlight === lobeSide ? 'bg-blue-500 border-blue-600 text-white' : k === 'M' && thyroidPlusHighlightLobe === lobeSide ? 'bg-blue-500 border-blue-600 text-white' : 'bg-white/90 border-slate-200 text-slate-700 hover:bg-slate-100'}`}><span className="inline-flex items-center justify-center w-full h-full leading-[1]">{k === 'C' ? <EraserIcon size={12} /> : k === 'M' ? <span style={{display:'inline-block',transform:'translate(0, -1px)'}}>+</span> : k}</span></button>
                                                                        )
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col gap-2 items-start pl-1.5 pt-1">
                                                    <div className="flex gap-4">
                                                        {['right', 'left'].map(lobeSide => (
                                                            <div key={lobeSide} className="flex flex-col items-center gap-0.5">
                                                                <p className="text-[11px] font-bold text-slate-500 mb-0.5">{lobeSide === 'right' ? 'Right lobe' : 'Left lobe'}</p>
                                                                <div className="flex items-center justify-center gap-0.5">
                                                                    <button type="button" onClick={() => setThyroidNoduleParams(prev => ({...prev, [lobeSide]: {...prev[lobeSide], activeField: 'sizeW', reEnterPending: true}}))} className={`px-1.5 py-0.5 rounded text-xs font-mono min-w-[2.2rem] ${thyroidNoduleParams[lobeSide].activeField === 'sizeW' ? 'ring-2 ring-blue-500 bg-blue-50' : 'bg-white border border-slate-200'}`}>{formatSizeDisplay(thyroidNoduleParams[lobeSide].sizeWStr, '長', true)}</button>
                                                                    <span className="text-slate-400 text-xs">×</span>
                                                                    <button type="button" onClick={() => setThyroidNoduleParams(prev => ({...prev, [lobeSide]: {...prev[lobeSide], activeField: 'sizeH', reEnterPending: true}}))} className={`px-1.5 py-0.5 rounded text-xs font-mono min-w-[2.2rem] ${thyroidNoduleParams[lobeSide].activeField === 'sizeH' ? 'ring-2 ring-blue-500 bg-blue-50' : 'bg-white border border-slate-200'}`}>{formatSizeDisplay(thyroidNoduleParams[lobeSide].sizeHStr, '寬', true)}</button>
                                                                </div>
                                                            </div>
                                                        ))}
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
                            <button type="button" onClick={() => addGroup('left')} className="text-lg font-semibold text-slate-400 hover:text-slate-700" title="新增分組">＋</button>
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
                                        {...(group.type === 'thyroidNodule' && { 'data-thyroid-nodule-group': 'true' })}
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
                                                {(editingGroupsRight || (editingTemplatesGroup?.groupId === group.id && editingTemplatesGroup?.side === 'right') || ((group.type === 'breastNodule' || group.type === 'thyroidNodule') && editingGroupName?.groupId === group.id && editingGroupName?.side === 'right')) && (
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
                                                            (editingTemplatesGroup?.groupId === group.id && editingTemplatesGroup?.side === 'right') || group.type === 'breastNodule' || group.type === 'thyroidNodule'
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
                                                        onClick={() => (group.type === 'breastNodule' || group.type === 'thyroidNodule') ? setEditingGroupName({ groupId: group.id, side: 'right', editing: true }) : setEditingTemplatesGroup({ groupId: group.id, side: 'right' })}
                                                        className="text-sm font-bold text-slate-700 truncate cursor-pointer hover:text-blue-600"
                                                        title="點擊編輯組套"
                                                    >
                                                        {group.name}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-baseline gap-1 shrink-0">
                                                {(group.type === 'breastNodule' || group.type === 'thyroidNodule') ? (
                                                    <>
                                                        {editingGroupName?.groupId === group.id && editingGroupName?.side === 'right' && (
                                                            <>
                                                                <button onClick={() => showDeleteGroupConfirm(group.id, 'right')} className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded" title="刪除分組">🗑️</button>
                                                                <button onClick={() => group.type === 'breastNodule' ? setEditingSentenceTemplate(!editingSentenceTemplate) : setEditingThyroidSentenceTemplate(!editingThyroidSentenceTemplate)} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="編輯">✏️</button>
                                                            </>
                                                        )}
                                                        {editingGroupsRight && <button onClick={() => showDeleteGroupConfirm(group.id, 'right')} className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded" title="刪除分組">🗑️</button>}
                                                    </>
                                                ) : editingTemplatesGroup?.groupId === group.id && editingTemplatesGroup?.side === 'right' ? (
                                                    <>
                                                        <button onClick={() => showDeleteGroupConfirm(group.id, 'right')} className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded" title="刪除分組">🗑️</button>
                                                        <button onClick={() => addTemplateToGroup('right', group.id)} className="text-sm font-bold leading-none w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 select-none" title="新增組套">+</button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button onClick={() => { setEditingTemplatesGroup({ groupId: group.id, side: 'right' }); addTemplateToGroup('right', group.id); }} className="text-sm font-bold leading-none w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 select-none" title="新增組套">+</button>
                                                        {editingGroupsRight && (
                                                            <button onClick={() => showDeleteGroupConfirm(group.id, 'right')} className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded" title="刪除分組">🗑️</button>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        {group.type === 'breastNodule' ? (
                                            <div className="grid grid-cols-2 gap-4 mt-2">
                                                <div className="rounded-lg border border-slate-200 bg-white p-3">
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
                                                                <button key={k} type="button" onClick={() => applyBreastNoduleKeypad(k)} className={`w-5 h-5 rounded border text-[10px] font-medium leading-none inline-flex items-center justify-center shrink-0 ${k === 'C' && breastNoduleSizeKeyHighlight === 'C' ? 'bg-blue-500 border-blue-600 text-white' : 'bg-white/90 border-slate-200 text-slate-700 hover:bg-slate-100'}`}><span className="inline-flex items-center justify-center w-full h-full leading-[1]">{k === 'C' ? <EraserIcon size={12} /> : k}</span></button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="rounded-lg border border-slate-200 bg-white p-3">
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
                                                                    <g
                                                                        key={h}
                                                                        onClick={() => {
                                                                            setBreastNoduleGroupParams(p => ({ ...p, clock: h }));
                                                                            setLastDistKeyPressed(null);
                                                                        }}
                                                                        style={{ cursor: 'pointer' }}
                                                                        transform={`translate(${x},${y})`}
                                                                    >
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
                                                                {['4','5','6','1','2','3','M','N','.'].map((k) => (
                                                                    <button
                                                                        key={`dist-r-${k}`}
                                                                        type="button"
                                                                        className={`w-5 h-5 rounded border text-[10px] font-medium leading-none flex items-center justify-center shadow-sm ${
                                                                            k === 'M'
                                                                                ? (lastDistKeyPressed === 'M'
                                                                                    ? (breastNodulePendingTexts.length > 0
                                                                                        ? 'bg-blue-500 border-blue-600 text-white'
                                                                                        : 'bg-red-500 border-red-600 text-white')
                                                                                    : 'bg-white/95 border-slate-200 text-slate-700 hover:bg-slate-100')
                                                                                : k === '.'
                                                                                    ? (lastDistKeyPressed === '.' && breastNoduleGroupParams.clock != null ? 'bg-blue-500 border-blue-600 text-white' : 'bg-white/95 border-slate-200 text-slate-700 hover:bg-slate-100')
                                                                                    : ((lastDistKeyPressed === k || (lastDistKeyPressed === '.' && breastNoduleGroupParams.distStr && breastNoduleGroupParams.distStr.split('.')[0] === k)) && breastNoduleGroupParams.clock != null
                                                                                        ? 'bg-blue-500 border-blue-600 text-white'
                                                                                        : 'bg-white/95 border-slate-200 text-slate-700 hover:bg-slate-100')
                                                                        }`}
                                                                        onClick={() => {
                                                                            // . 鍵：將離乳頭距離加上 .5（如 2 → 2.5），並複製
                                                                            if (k === '.') {
                                                                                if (breastNoduleGroupParams.clock == null) return;
                                                                                const w = parseSizeValue(breastNoduleGroupParams.sizeWStr);
                                                                                const h = parseSizeValue(breastNoduleGroupParams.sizeHStr);
                                                                                if (w === 0 || h === 0) return;
                                                                                const baseDistStr = breastNoduleGroupParams.distStr || '';
                                                                                if (baseDistStr.includes('.')) return;
                                                                                const newDistStr = (baseDistStr || '0') + '.5';
                                                                                setBreastNoduleGroupParams(p => ({ ...p, distStr: newDistStr }));
                                                                                setLastDistKeyPressed('.');
                                                                                const c = breastNoduleGroupParams.clock;
                                                                                const numericDist = parseFloat(newDistStr) || 0;
                                                                                let singleText = breastNoduleSentenceTemplate
                                                                                    .replace(/\{W\}/g, String(w)).replace(/\{H\}/g, String(h))
                                                                                    .replace(/\{C\}/g, String(c))
                                                                                    .replace(/\{D\}/g, '/' + numericDist + ' cm');
                                                                                if (w >= 1 || h >= 1) singleText = singleText.replace(/\bsmall\b/gi, '').replace(/\s{2,}/g, ' ');
                                                                                let textToCopy = breastNodulePendingTexts.length > 0
                                                                                    ? generateNoduleTexts([...breastNodulePendingTexts, { w, h, clock: c }], String(numericDist)).join('\n')
                                                                                    : singleText;
                                                                                if (textToCopy) {
                                                                                    const lines = textToCopy.split('\n').filter(l => l.trim() !== '');
                                                                                    const finalText = lines.map(line => `   - ${line.replace(/^\s*-\s*/, '')}`).join('\n');
                                                                                    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(finalText).catch(() => {});
                                                                                    else { const ta = document.createElement('textarea'); ta.value = finalText; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); }
                                                                                }
                                                                                setTimeout(() => setLastDistKeyPressed(null), 1000);
                                                                                return;
                                                                            }
                                                                            if (k === 'M') {
                                                                                const w = parseSizeValue(breastNoduleGroupParams.sizeWStr);
                                                                                const h = parseSizeValue(breastNoduleGroupParams.sizeHStr);
                                                                                const distStr = breastNoduleGroupParams.distStr;
                                                                                if (w === 0 || h === 0 || breastNoduleGroupParams.clock == null || distStr === '' || distStr == null) {
                                                                                    return;
                                                                                }
                                                                            }
                                                                            setLastDistKeyPressed(k);
                                                                            if (breastNoduleGroupParams.clock == null) { return; }
                                                                            const w = parseSizeValue(breastNoduleGroupParams.sizeWStr);
                                                                            const h = parseSizeValue(breastNoduleGroupParams.sizeHStr);
                                                                            if (w === 0 || h === 0) { return; }
                                                                            const baseDistStr = breastNoduleGroupParams.distStr;
                                                                            let newDistStr = baseDistStr;
                                                                            if (['4','5','6','1','2','3'].includes(k)) {
                                                                                newDistStr = k;
                                                                                setBreastNoduleGroupParams(p => ({ ...p, distStr: newDistStr }));
                                                                            }
                                                                            const c = breastNoduleGroupParams.clock;
                                                                            const numericDist = parseFloat(newDistStr || baseDistStr) || 0;
                                                                            const dist = k === 'N' ? 'N' : String(numericDist);
                                                                            let singleText = breastNoduleSentenceTemplate
                                                                                .replace(/\{W\}/g, String(w))
                                                                                .replace(/\{H\}/g, String(h))
                                                                                .replace(/\{C\}/g, String(c))
                                                                                .replace(/\{D\}/g, '/' + dist + ' cm');
                                                                            if (w >= 1 || h >= 1) {
                                                                                singleText = singleText.replace(/\bsmall\b/gi, '').replace(/\s{2,}/g, ' ');
                                                                            }
                                                                            let textToCopy = singleText;

                                                                            if (k === 'M') {
                                                                                textToCopy = null;
                                                                                const noduleData = { w, h, clock: c };
                                                                                setBreastNodulePendingTexts(prev => {
                                                                                    if (prev.length > 0) {
                                                                                        const last = prev[prev.length - 1];
                                                                                        if (last.w === w && last.h === h && last.clock === c) return prev;
                                                                                    }
                                                                                    return [...prev, noduleData];
                                                                                });
                                                                                setTimeout(() => setLastDistKeyPressed(null), 1000);
                                                                                setBreastNoduleGroupParams(p => ({
                                                                                    ...p,
                                                                                    sizeWStr: '0',
                                                                                    sizeHStr: '0',
                                                                                    clock: null,
                                                                                    activeField: 'sizeW',
                                                                                    reEnterPending: true
                                                                                }));
                                                                            } else if (breastNodulePendingTexts.length > 0 && k !== '.') {
                                                                                const allNodules = [...breastNodulePendingTexts, { w, h, clock: c }];
                                                                                const allLines = generateNoduleTexts(allNodules, dist);
                                                                                textToCopy = allLines.join('\n');
                                                                                setBreastNodulePendingTexts(allNodules);
                                                                            }
                                                                            if (textToCopy) {
                                                                                const lines = textToCopy.split('\n').filter(l => l.trim() !== '');
                                                                                const finalText = lines
                                                                                    .map(line => {
                                                                                        const core = line.replace(/^\s*-\s*/, '');
                                                                                        return `   - ${core}`;
                                                                                    })
                                                                                    .join('\n');
                                                                                navigator.clipboard.writeText(finalText).catch(() => {});
                                                                            }
                                                                            setTimeout(() => setLastDistKeyPressed(null), 1000);
                                                                        }}
                                                                    ><span className="inline-flex items-center justify-center w-full h-full leading-[1]">{k === 'M' ? '+' : k}</span></button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : group.type === 'thyroidNodule' ? (
                                            <div className="rounded-lg border border-slate-200 bg-white p-0.5 flex flex-row items-start gap-3">
                                                <div className="relative flex-shrink-0 ml-4" style={{ width: '200px', aspectRatio: '480/374' }}>
                                                    <ThyroidOutline className="w-full h-full absolute inset-0 pointer-events-none" />
                                                    <div className="absolute inset-0 flex items-center justify-between" style={{ padding: '4% 5% 4% 5%' }}>
                                                        {['right', 'left'].map(lobeSide => (
                                                            <div key={lobeSide} className="flex flex-col items-center gap-0.5">
                                                                <div className="grid grid-cols-3 gap-0.5 p-0.5 max-w-[72px]">
                                                                    {(lobeSide === 'right' ? ['7','8','9','4','5','6','1','2','3','C','0','.'] : ['7','8','9','4','5','6','1','2','3','M','0','.']).map((k) => (
                                                                        (lobeSide === 'left' && k === 'M' && thyroidShowSplitPlus) ? (
                                                                            <div key={`thy-r-${lobeSide}-plus`} className="flex items-stretch gap-0 rounded overflow-hidden border border-slate-200 shadow-sm" style={{ width: '20px', height: '20px' }}>
                                                                                <button type="button" onClick={() => handleThyroidAction('right', 'MR')} title="加入右側" className={`flex-1 min-w-0 text-[9px] font-medium flex items-center justify-center border-r border-slate-200 ${thyroidPlusHighlightLobe === 'right' ? 'bg-blue-500 text-white' : 'bg-white/90 text-slate-700 hover:bg-slate-100'}`}>+</button>
                                                                                <button type="button" onClick={() => handleThyroidAction('left', 'ML')} title="加入左側" className={`flex-1 min-w-0 text-[9px] font-medium flex items-center justify-center ${thyroidPlusHighlightLobe === 'left' ? 'bg-blue-500 text-white' : 'bg-white/90 text-slate-700 hover:bg-slate-100'}`}>+</button>
                                                                            </div>
                                                                        ) : (
                                                                            <button key={`thy-r-${lobeSide}-${k}`} type="button" onClick={() => applyThyroidNoduleKeypad(lobeSide, k)} className={`w-5 h-5 rounded border text-[10px] font-medium leading-none flex items-center justify-center shadow-sm ${k === 'C' && thyroidNoduleSizeKeyHighlight === lobeSide ? 'bg-blue-500 border-blue-600 text-white' : k === 'M' && thyroidPlusHighlightLobe === lobeSide ? 'bg-blue-500 border-blue-600 text-white' : 'bg-white/90 border-slate-200 text-slate-700 hover:bg-slate-100'}`}><span className="inline-flex items-center justify-center w-full h-full leading-[1]">{k === 'C' ? <EraserIcon size={12} /> : k === 'M' ? <span style={{display:'inline-block',transform:'translate(0, -1px)'}}>+</span> : k}</span></button>
                                                                        )
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col gap-2 items-start pl-1.5 pt-1">
                                                    <div className="flex gap-4">
                                                        {['right', 'left'].map(lobeSide => (
                                                            <div key={lobeSide} className="flex flex-col items-center gap-0.5">
                                                                <p className="text-[11px] font-bold text-slate-500 mb-0.5">{lobeSide === 'right' ? 'Right lobe' : 'Left lobe'}</p>
                                                                <div className="flex items-center justify-center gap-0.5">
                                                                    <button type="button" onClick={() => setThyroidNoduleParams(prev => ({...prev, [lobeSide]: {...prev[lobeSide], activeField: 'sizeW', reEnterPending: true}}))} className={`px-1.5 py-0.5 rounded text-xs font-mono min-w-[2.2rem] ${thyroidNoduleParams[lobeSide].activeField === 'sizeW' ? 'ring-2 ring-blue-500 bg-blue-50' : 'bg-white border border-slate-200'}`}>{formatSizeDisplay(thyroidNoduleParams[lobeSide].sizeWStr, '長', true)}</button>
                                                                    <span className="text-slate-400 text-xs">×</span>
                                                                    <button type="button" onClick={() => setThyroidNoduleParams(prev => ({...prev, [lobeSide]: {...prev[lobeSide], activeField: 'sizeH', reEnterPending: true}}))} className={`px-1.5 py-0.5 rounded text-xs font-mono min-w-[2.2rem] ${thyroidNoduleParams[lobeSide].activeField === 'sizeH' ? 'ring-2 ring-blue-500 bg-blue-50' : 'bg-white border border-slate-200'}`}>{formatSizeDisplay(thyroidNoduleParams[lobeSide].sizeHStr, '寬', true)}</button>
                                                                </div>
                                                            </div>
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
                            <button type="button" onClick={() => addGroup('right')} className="text-lg font-semibold text-slate-400 hover:text-slate-700" title="新增分組">＋</button>
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
                                <p className="text-sm text-slate-500 mb-2">{'{W}'} = 長、{'{H}'} = 寬、{'{C}'} = 鐘點、{'{D}'} = 距離、{'{SIZES}'} = 合併尺寸列表</p>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">單顆結節模板</label>
                                <textarea
                                    value={breastNoduleSentenceTemplate}
                                    onInput={(e) => setBreastNoduleSentenceTemplate(e.target.value)}
                                    rows="3"
                                    className="w-full px-4 py-3 border rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm leading-relaxed"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">同位置多顆合併模板</label>
                                <textarea
                                    value={breastNoduleMergedTemplate}
                                    onInput={(e) => setBreastNoduleMergedTemplate(e.target.value)}
                                    rows="3"
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

            {editingThyroidSentenceTemplate && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 animate-scale-in" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-slate-800">編輯甲狀腺結節句子模板</h3>
                            <button onClick={() => setEditingThyroidSentenceTemplate(false)} className="text-slate-400 hover:text-slate-600 text-2xl">✕</button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">可用變數</label>
                                <p className="text-sm text-slate-500 mb-2">{'{W}'} = 長、{'{H}'} = 寬、{'{SIDE}'} = 左/右葉、{'{SIZES}'} = 合併尺寸列表</p>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">單顆結節模板</label>
                                <textarea
                                    value={thyroidNoduleSentenceTemplate}
                                    onInput={(e) => setThyroidNoduleSentenceTemplate(e.target.value)}
                                    rows="3"
                                    className="w-full px-4 py-3 border rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm leading-relaxed"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">同位置多顆合併模板（2 顆時使用）</label>
                                <textarea
                                    value={thyroidNoduleMergedTemplate}
                                    onInput={(e) => setThyroidNoduleMergedTemplate(e.target.value)}
                                    rows="3"
                                    className="w-full px-4 py-3 border rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm leading-relaxed"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">多顆範例模板（3+ 顆時使用）</label>
                                <p className="text-xs text-slate-400 mb-1">當單側 ≥3 顆時觸發（{'{SIZES}'}、{'{SIDE}'}）</p>
                                <textarea
                                    value={thyroidNoduleMultiExampleTemplate}
                                    onInput={(e) => setThyroidNoduleMultiExampleTemplate(e.target.value)}
                                    rows="2"
                                    className="w-full px-4 py-3 border rounded-lg bg-white text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm leading-relaxed"
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button onClick={() => setEditingThyroidSentenceTemplate(false)} className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-bold hover:bg-blue-700 shadow-md shadow-blue-100">儲存</button>
                                <button onClick={() => setEditingThyroidSentenceTemplate(false)} className="px-6 py-2 bg-slate-100 text-slate-600 rounded-lg font-bold hover:bg-slate-200">取消</button>
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