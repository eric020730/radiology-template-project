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

export function App() {
    // 預設資料結構：分組版，每側為 Group[]，每組 { id, name, items: Template[] }
    const defaultTabs = [
        {
            id: 'tab-chest',
            name: 'Chest CT',
            left: [
                {
                    id: 'g-chest-left-1',
                    name: '標準',
                    items: [
                        { id: 'L-1', name: 'ctlungc+', content: 'Contrast-enhanced chest CT shows:\n1. No active lung lesion.\n2. No mediastinal lymphadenopathy.' },
                        { id: 'L-2', name: 'ctlungc-', content: 'Non-contrast chest CT shows:\nNo definite lung nodule noted.' },
                    ]
                },
            ],
            right: []
        },
        {
            id: 'tab-xray',
            name: 'Xray',
            left: [
                {
                    id: 'g-xray-left-1',
                    name: '標準',
                    items: [
                        { id: 'XL-1', name: 'CXR Normal', content: 'The heart size is normal.\nThe bilateral lungs are clear.' },
                    ]
                },
            ],
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
    const [copiedId, setCopiedId] = useState(null);
    const [syncStatus, setSyncStatus] = useState('本地儲存');
    const [dragState, setDragState] = useState(null);   // { template, sourceGroupId, sourceSide, sourceIndex }
    const [dropTarget, setDropTarget] = useState(null); // { side, groupId, index }
    const [dragGhost, setDragGhost] = useState(null);   // 拖曳時跟隨游標的按鈕 { x, y, width, height, name }
    const [dragGroupState, setDragGroupState] = useState(null); // { side, groupId, index } 正在拖曳的分組
    const [dropGroupTarget, setDropGroupTarget] = useState(null); // { side, index } 分組拖放目標（插入到該 index）
    const didDragRef = useRef(false);
    const dragPayloadRef = useRef(null); // 自訂拖曳時暫存來源 { sourceSide, sourceGroupId, sourceIndex }
    const dragOffsetRef = useRef({ x: 0, y: 0 });      // 拖曳起點在按鈕內的偏移
    const moveTemplateRef = useRef(null);
    const swapTemplatesRef = useRef(null);
    
    const [config, setConfig] = useState({
        spreadsheetId: '',
        apiKey: '',
        scriptUrl: '',
        isConnected: false
    });

    // 取得當前頁籤的資料方便操作
    const activeTab = tabs[activeTabIdx] || tabs[0];

    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY)
            || localStorage.getItem('radiologyTemplatesConfig_v2'); // 相容 v2
        if (saved) {
            try {
                const data = JSON.parse(saved);
                if (data.tabs && Array.isArray(data.tabs)) {
                    const tabsData = isLegacyV2Tabs(data.tabs) ? migrateV2ToV3(data.tabs) : data.tabs;
                    setTabs(tabsData);
                }
                if (data.config) setConfig(data.config);
            } catch (e) {
                console.error("讀取舊存檔失敗", e);
            }
        }
    }, []);

    const saveToLocal = (newTabs, currentConfig = config) => {
        const data = {
            tabs: newTabs,
            config: currentConfig,
            lastUpdated: new Date().toISOString()
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
                        if (!leftByGroup[gName]) leftByGroup[gName] = [];
                        leftByGroup[gName].push({
                            id: `L-${title}-${idx}-${ts}`,
                            name: String(row[1]).trim(),
                            content: (row[2] != null ? String(row[2]) : '').trim()
                        });
                    }
                    // 右側：D=分組名, E=名稱, F=內容
                    if (row[3] != null && String(row[3]).trim() !== '' && row[4] != null) {
                        const gName = String(row[3]).trim();
                        if (!rightByGroup[gName]) rightByGroup[gName] = [];
                        rightByGroup[gName].push({
                            id: `R-${title}-${idx}-${ts}`,
                            name: String(row[4]).trim(),
                            content: (row[5] != null ? String(row[5]) : '').trim()
                        });
                    }
                });

                const toGroups = (byGroup, prefix) =>
                    Object.entries(byGroup).map(([name, items], i) => ({
                        id: `${prefix}-${title}-${i}-${ts}`,
                        name,
                        items
                    }));

                newTabs.push({
                    id: `tab-${title}`,
                    name: title,
                    left: toGroups(leftByGroup, 'g-left'),
                    right: toGroups(rightByGroup, 'g-right')
                });
            }

            setTabs(newTabs);
            setActiveTabIdx(0);
            saveToLocal(newTabs); // 更新本地
            setSyncStatus('匯入成功！');
            alert(`✅ 成功匯入 ${newTabs.length} 個頁籤！`);
            setTimeout(() => setSyncStatus('已連接'), 2000);

        } catch (error) {
            console.error(error);
            setSyncStatus('匯入失敗');
            alert('❌ 匯入失敗，請檢查 API Key 權限或 Sheet ID。');
        }
    };

    const exportToGoogleSheets = async () => {
        if (!config.scriptUrl) {
            alert('請填寫 Apps Script 網址');
            return;
        }
        try {
            setSyncStatus('匯出中...');
            // 傳送整個 tabs 結構給 Apps Script
            await fetch(config.scriptUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tabs: tabs }) 
            });

            setSyncStatus('匯出成功！');
            alert('✅ 資料已成功發送至雲端 (請確認 Script 已支援多頁籤)！');
            setTimeout(() => setSyncStatus('已連接'), 2000);
        } catch (error) {
            alert('❌ 匯出失敗');
        }
    };

    // --- 編輯與操作邏輯 ---

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
        setEditingGroupName(null);
    };

    // 分組拖曳排序：將 side 側的 fromIndex 分組移到 toIndex
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
        setTabs(newTabs);
        setActiveTabIdx(newTabs.length - 1);
        saveToLocal(newTabs);
    };

    const deleteCurrentTab = () => {
        if (tabs.length <= 1) {
            alert("至少要保留一個頁籤！");
            return;
        }
        if (!confirm(`確定要刪除「${activeTab.name}」頁籤嗎？這會刪除裡面的所有內容。`)) return;
        
        const newTabs = tabs.filter((_, idx) => idx !== activeTabIdx);
        setTabs(newTabs);
        setActiveTabIdx(0);
        saveToLocal(newTabs);
    };

    const renameCurrentTab = (newName) => {
        const newTabs = [...tabs];
        newTabs[activeTabIdx].name = newName;
        setTabs(newTabs);
        saveToLocal(newTabs);
    };

    const connectGoogleSheets = async () => {
        const newConfig = { ...config, isConnected: true };
        setConfig(newConfig);
        saveToLocal(tabs, newConfig);
        await loadFromGoogleSheets();
        setShowSettings(false);
    };

    // --- UI Components ---

    const TemplateButton = ({ template, side, groupId, index, showEditButtons }) => {
        const isDragging = dragState?.template?.id === template.id;
        const isDropTarget = dropTarget?.side === side && dropTarget?.groupId === groupId && dropTarget?.index === index;
        const buttonClass = copiedId === template.id
            ? 'bg-emerald-500 text-white shadow-inner scale-[0.98] copied-animation'
            : 'bg-white border border-slate-200 text-slate-700 hover:border-blue-400 hover:text-blue-600 shadow-sm hover:shadow-md';
        const startCustomDrag = (e) => {
            e.preventDefault();
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
                setTimeout(() => { didDragRef.current = false; }, 0);
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
                className={`relative group rounded-lg min-h-[3rem] transition-colors ${isDropTarget ? 'ring-2 ring-blue-400 ring-inset bg-blue-50/80' : ''} ${isDragging ? 'opacity-50' : ''}`}
            >
                <div className={`flex w-full rounded-lg overflow-hidden ${buttonClass}`}>
                    {/* 左側窄條：mousedown 啟動自訂拖曳（不依賴 HTML5 DnD） */}
                    <span
                        role="button"
                        tabIndex={0}
                        onMouseDown={startCustomDrag}
                        onClick={(ev) => ev.preventDefault()}
                        onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') ev.preventDefault(); }}
                        className="template-drag-handle w-4 shrink-0 cursor-grab active:cursor-grabbing touch-none rounded-l-lg block select-none"
                        title="拖曳可移動"
                    />
                    <button
                        type="button"
                        onClick={() => {
                            if (didDragRef.current) return;
                            copyToClipboard(template);
                        }}
                        className="flex-1 px-3 py-3 rounded-r-lg font-medium transition-all duration-200 text-left flex justify-between items-center min-w-0 border-0 bg-transparent text-inherit"
                    >
                        <span className="truncate mr-2">{template.name}</span>
                        {copiedId === template.id && <span className="text-xs bg-white/20 px-2 py-0.5 rounded shrink-0">OK</span>}
                    </button>
                </div>
                {showEditButtons && (
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); showDeleteConfirm(template, side); }}
                            className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition"
                            title="刪除"
                        >
                            🗑️
                        </button>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); startEdit(template, side); }}
                            className="p-1 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded transition"
                            title="編輯"
                        >
                            ✏️
                        </button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="bg-slate-50 min-h-screen flex flex-col font-sans">
            {/* 頂部導航列 */}
            <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16 items-center">
                        <div className="flex items-center gap-2">
                            <span className="text-xl font-bold text-slate-800 bg-blue-100 p-2 rounded-lg">R</span>
                            <span className="font-bold text-slate-700 hidden sm:block">放射科組套</span>
                        </div>

                        {/* 頁籤滾動區 */}
                        <div className="flex-1 mx-6 overflow-x-auto no-scrollbar flex items-center gap-1">
                            {tabs.map((tab, idx) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTabIdx(idx)}
                                    className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-bold transition-all ${
                                        activeTabIdx === idx 
                                            ? 'bg-slate-800 text-white shadow-md' 
                                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                    }`}
                                >
                                    {tab.name}
                                </button>
                            ))}
                            <button onClick={addNewTab} className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-green-600 transition" title="新增頁籤">
                                ＋
                            </button>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400 font-mono hidden sm:inline">{syncStatus}</span>
                            <button onClick={() => setShowSettings(!showSettings)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition">
                                ⚙️
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
                
                {/* 設定面板 */}
                {showSettings && (
                    <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-6 mb-6 animate-fade-in-down">
                        <h2 className="text-lg font-bold mb-4 text-slate-800 flex items-center gap-2">
                            ⚙️ 系統設定
                        </h2>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <label htmlFor="config-spreadsheet-id" className="text-sm font-medium text-slate-700 shrink-0 w-28 cursor-text">試算表 ID</label>
                                    <input id="config-spreadsheet-id" type="text" placeholder="Spreadsheet ID" value={config.spreadsheetId} onChange={(e) => setConfig({...config, spreadsheetId: e.target.value})} onFocus={(e) => e.target.select()} className="flex-1 min-w-0 px-3 py-2 border rounded text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                                </div>
                                <div className="flex items-center gap-3">
                                    <label htmlFor="config-api-key" className="text-sm font-medium text-slate-700 shrink-0 w-28 cursor-text">API 金鑰</label>
                                    <input id="config-api-key" type="text" placeholder="API Key" value={config.apiKey} onChange={(e) => setConfig({...config, apiKey: e.target.value})} onFocus={(e) => e.target.select()} className="flex-1 min-w-0 px-3 py-2 border rounded text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                                </div>
                                <div className="flex items-center gap-3">
                                    <label htmlFor="config-script-url" className="text-sm font-medium text-slate-700 shrink-0 w-28 cursor-text">Apps Script 網址</label>
                                    <input id="config-script-url" type="text" placeholder="Apps Script URL (Write)" value={config.scriptUrl} onChange={(e) => setConfig({...config, scriptUrl: e.target.value})} onFocus={(e) => e.target.select()} className="flex-1 min-w-0 px-3 py-2 border rounded text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                                </div>
                                
                                {/* 按鈕區域：包含匯入與匯出 */}
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

                            <div className="text-sm text-slate-500 bg-slate-50 p-4 rounded-lg border border-slate-100">
                                <p className="font-bold mb-2 text-slate-700">Google Sheet 格式說明 (分組版)：</p>
                                <ul className="list-disc pl-5 space-y-1 text-xs">
                                    <li>每一個工作表 (Sheet) 對應上方一個頁籤。</li>
                                    <li><strong>左側</strong>：A=分組名、B=組套名稱、C=組套內容。</li>
                                    <li><strong>右側</strong>：D=分組名、E=組套名稱、F=組套內容。</li>
                                    <li>同一分組的多筆組套，分組名填相同即可；匯出時 Apps Script 需寫入 6 欄。</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                )}

                {/* 當前頁籤標題與操作 */}
                <div className="flex justify-between items-end mb-6 pb-2 border-b border-slate-200">
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
                            <h2 className="text-2xl font-bold text-slate-800">
                                {activeTab.name}
                            </h2>
                        )}
                    </div>
                    {editingTabName ? (
                        <div className="flex items-center gap-2">
                            <button onClick={() => { deleteCurrentTab(); setEditingTabName(false); }} className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-3 py-1 rounded transition">
                                刪除此頁籤
                            </button>
                            <button onClick={() => setEditingTabName(false)} className="text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 px-3 py-1 rounded transition">
                                完成
                            </button>
                        </div>
                    ) : (
                        <button onClick={() => setEditingTabName(true)} className="text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-1 rounded border border-blue-200 transition">
                            編輯頁籤
                        </button>
                    )}
                </div>

                {/* 主要內容區 */}
                <div className="grid md:grid-cols-2 gap-8">
                    {/* 左側：標準組套 */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">標準組套 (Left)</h3>
                            {editingGroupsLeft ? (
                                <div className="flex items-center gap-2">
                                    <button onClick={() => addGroup('left')} className="text-xs bg-green-50 text-green-600 font-bold px-2 py-1 rounded hover:bg-green-100 border border-green-200">新增分組</button>
                                    <button onClick={() => setEditingGroupsLeft(false)} className="text-xs bg-slate-100 text-slate-600 font-bold px-2 py-1 rounded hover:bg-slate-200 border border-slate-200">完成</button>
                                </div>
                            ) : (
                                <button onClick={() => setEditingGroupsLeft(true)} className="text-xs bg-blue-50 text-blue-600 font-bold px-2 py-1 rounded hover:bg-blue-100 border border-blue-200">編輯分組</button>
                            )}
                        </div>
                        {(!activeTab.left || activeTab.left.length === 0) ? (
                            <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center text-slate-400 text-sm">
                                {editingGroupsLeft ? '尚無分組，請點「新增分組」' : '尚無分組，請點「編輯分組」後可新增與刪除分組'}
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
                                        data-group-drop
                                        data-side="left"
                                        data-index={groupIndex}
                                        onDragOver={(e) => {
                                            if (!editingGroupsLeft || !dragGroupState || dragGroupState.side !== 'left') return;
                                            e.preventDefault();
                                            e.dataTransfer.dropEffect = 'move';
                                            setDropGroupTarget({ side: 'left', index: groupIndex });
                                        }}
                                        onDragLeave={(e) => {
                                            if (!e.currentTarget.contains(e.relatedTarget)) setDropGroupTarget(null);
                                        }}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            if (dragGroupState?.side === 'left' && dropGroupTarget?.side === 'left') {
                                                reorderGroups('left', dragGroupState.index, dropGroupTarget.index);
                                            }
                                            setDragGroupState(null);
                                            setDropGroupTarget(null);
                                        }}
                                    >
                                        <div className="flex justify-between items-center mb-3">
                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                {editingGroupsLeft && (
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
                                                {editingGroupName?.groupId === group.id && editingGroupName?.side === 'left' ? (
                                                    <input
                                                        autoFocus
                                                        className="text-sm font-bold text-slate-700 bg-transparent border-b-2 border-blue-500 outline-none flex-1 mr-2 min-w-0"
                                                        value={group.name}
                                                        onChange={(e) => renameGroup('left', group.id, e.target.value)}
                                                        onBlur={() => setEditingGroupName(null)}
                                                        onKeyDown={(e) => e.key === 'Enter' && setEditingGroupName(null)}
                                                    />
                                                ) : (
                                                    <span
                                                        className="text-sm font-bold text-slate-700 cursor-pointer hover:text-blue-600 truncate"
                                                        onClick={() => setEditingGroupName({ groupId: group.id, side: 'left' })}
                                                        title="點擊修改分組名稱"
                                                    >
                                                        {group.name}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                {editingTemplatesGroup?.groupId === group.id && editingTemplatesGroup?.side === 'left' ? (
                                                    <>
                                                        <button onClick={() => addTemplateToGroup('left', group.id)} className="text-xs bg-green-50 text-green-600 px-2 py-1 rounded hover:bg-green-100 border border-green-200">新增組套</button>
                                                        <button onClick={() => setEditingTemplatesGroup(null)} className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded hover:bg-slate-200 border border-slate-200">完成</button>
                                                    </>
                                                ) : (
                                                    <button onClick={() => setEditingTemplatesGroup({ groupId: group.id, side: 'left' })} className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100 border border-blue-200">編輯組套</button>
                                                )}
                                                {editingGroupsLeft && (
                                                    <button onClick={() => showDeleteGroupConfirm(group.id, 'left')} className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded" title="刪除分組">🗑️</button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            {group.items.map((t, idx) => (
                                                <TemplateButton key={t.id} template={t} side="left" groupId={group.id} index={idx} showEditButtons={editingTemplatesGroup?.groupId === group.id && editingTemplatesGroup?.side === 'left'} />
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
                                    </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* 右側：自訂組套 */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">自訂組套 (Right)</h3>
                            {editingGroupsRight ? (
                                <div className="flex items-center gap-2">
                                    <button onClick={() => addGroup('right')} className="text-xs bg-green-50 text-green-600 font-bold px-2 py-1 rounded hover:bg-green-100 border border-green-200">新增分組</button>
                                    <button onClick={() => setEditingGroupsRight(false)} className="text-xs bg-slate-100 text-slate-600 font-bold px-2 py-1 rounded hover:bg-slate-200 border border-slate-200">完成</button>
                                </div>
                            ) : (
                                <button onClick={() => setEditingGroupsRight(true)} className="text-xs bg-blue-50 text-blue-600 font-bold px-2 py-1 rounded hover:bg-blue-100 border border-blue-200">編輯分組</button>
                            )}
                        </div>
                        {(!activeTab.right || activeTab.right.length === 0) ? (
                            <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center text-slate-400 text-sm">
                                {editingGroupsRight ? '尚無分組，請點「新增分組」' : '尚無分組，請點「編輯分組」後可新增與刪除分組'}
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
                                        data-group-drop
                                        data-side="right"
                                        data-index={groupIndex}
                                        onDragOver={(e) => {
                                            if (!editingGroupsRight || !dragGroupState || dragGroupState.side !== 'right') return;
                                            e.preventDefault();
                                            e.dataTransfer.dropEffect = 'move';
                                            setDropGroupTarget({ side: 'right', index: groupIndex });
                                        }}
                                        onDragLeave={(e) => {
                                            if (!e.currentTarget.contains(e.relatedTarget)) setDropGroupTarget(null);
                                        }}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            if (dragGroupState?.side === 'right' && dropGroupTarget?.side === 'right') {
                                                reorderGroups('right', dragGroupState.index, dropGroupTarget.index);
                                            }
                                            setDragGroupState(null);
                                            setDropGroupTarget(null);
                                        }}
                                    >
                                        <div className="flex justify-between items-center mb-3">
                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                {editingGroupsRight && (
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
                                                {editingGroupName?.groupId === group.id && editingGroupName?.side === 'right' ? (
                                                    <input
                                                        autoFocus
                                                        className="text-sm font-bold text-slate-700 bg-transparent border-b-2 border-blue-500 outline-none flex-1 mr-2 min-w-0"
                                                        value={group.name}
                                                        onChange={(e) => renameGroup('right', group.id, e.target.value)}
                                                        onBlur={() => setEditingGroupName(null)}
                                                        onKeyDown={(e) => e.key === 'Enter' && setEditingGroupName(null)}
                                                    />
                                                ) : (
                                                    <span
                                                        className="text-sm font-bold text-slate-700 cursor-pointer hover:text-blue-600 truncate"
                                                        onClick={() => setEditingGroupName({ groupId: group.id, side: 'right' })}
                                                        title="點擊修改分組名稱"
                                                    >
                                                        {group.name}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                {editingTemplatesGroup?.groupId === group.id && editingTemplatesGroup?.side === 'right' ? (
                                                    <>
                                                        <button onClick={() => addTemplateToGroup('right', group.id)} className="text-xs bg-green-50 text-green-600 px-2 py-1 rounded hover:bg-green-100 border border-green-200">新增組套</button>
                                                        <button onClick={() => setEditingTemplatesGroup(null)} className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded hover:bg-slate-200 border border-slate-200">完成</button>
                                                    </>
                                                ) : (
                                                    <button onClick={() => setEditingTemplatesGroup({ groupId: group.id, side: 'right' })} className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100 border border-blue-200">編輯組套</button>
                                                )}
                                                {editingGroupsRight && (
                                                    <button onClick={() => showDeleteGroupConfirm(group.id, 'right')} className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded" title="刪除分組">🗑️</button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            {group.items.map((t, idx) => (
                                                <TemplateButton key={t.id} template={t} side="right" groupId={group.id} index={idx} showEditButtons={editingTemplatesGroup?.groupId === group.id && editingTemplatesGroup?.side === 'right'} />
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
                                    </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 刪除確認視窗 */}
            {deleteConfirmTemplate && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
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
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 animate-scale-in">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-slate-800">編輯內容</h3>
                            <button onClick={() => setEditingTemplate(null)} className="text-slate-400 hover:text-slate-600 text-2xl">✕</button>
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
                                    className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm leading-relaxed" 
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button onClick={saveTemplateEdit} className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-bold hover:bg-blue-700 shadow-md shadow-blue-100">儲存</button>
                                <button onClick={() => setEditingTemplate(null)} className="px-6 py-2 bg-slate-100 text-slate-600 rounded-lg font-bold hover:bg-slate-200">取消</button>
                            </div>
                        </div>
                    </div>
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
        </div>
    );
}