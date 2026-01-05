import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import './app.css';

// 更改 Key 名稱，避免讀取到舊格式的資料導致錯誤
const STORAGE_KEY = 'radiologyTemplatesConfig_v2';

export function App() {
    // 預設資料：包含 Chest CT 和 Xray 兩個頁籤
    const defaultTabs = [
        {
            id: 'tab-chest',
            name: 'Chest CT',
            left: [
                { id: 'L-1', name: 'ctlungc+', content: 'Contrast-enhanced chest CT shows:\n1. No active lung lesion.\n2. No mediastinal lymphadenopathy.' },
                { id: 'L-2', name: 'ctlungc-', content: 'Non-contrast chest CT shows:\nNo definite lung nodule noted.' },
            ],
            right: []
        },
        {
            id: 'tab-xray',
            name: 'Xray',
            left: [
                { id: 'XL-1', name: 'CXR Normal', content: 'The heart size is normal.\nThe bilateral lungs are clear.' },
            ],
            right: []
        }
    ];

    const [tabs, setTabs] = useState(defaultTabs);
    const [activeTabIdx, setActiveTabIdx] = useState(0); // 目前顯示第幾個頁籤
    
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [editingTabName, setEditingTabName] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [copiedId, setCopiedId] = useState(null);
    const [syncStatus, setSyncStatus] = useState('本地儲存');
    
    const [config, setConfig] = useState({
        spreadsheetId: '',
        apiKey: '',
        scriptUrl: '',
        isConnected: false
    });

    // 取得當前頁籤
    const activeTab = tabs[activeTabIdx] || tabs[0];

    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const data = JSON.parse(saved);
                if (data.tabs && Array.isArray(data.tabs)) setTabs(data.tabs);
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
            
            // 1. 取得所有工作表名稱
            const metaResponse = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}?key=${config.apiKey}`
            );
            const metaData = await metaResponse.json();
            
            if (!metaData.sheets) throw new Error('無法讀取試算表結構');

            setSyncStatus('下載內容中...');
            const newTabs = [];

            // 2. 逐一讀取每個工作表的 A:D 欄
            for (const sheet of metaData.sheets) {
                const title = sheet.properties.title;
                // 略過名稱為 "工作表1" 這種未命名的，或者你可以保留
                const range = `${title}!A2:D`; 
                
                const res = await fetch(
                    `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${range}?key=${config.apiKey}`
                );
                const json = await res.json();
                const rows = json.values || [];

                const leftItems = [];
                const rightItems = [];

                rows.forEach((row, idx) => {
                    // A, B 欄 -> 左側
                    if (row[0]) {
                        leftItems.push({
                            id: `L-${title}-${idx}-${Date.now()}`,
                            name: row[0],
                            content: row[1] || ''
                        });
                    }
                    // C, D 欄 -> 右側
                    if (row[2]) {
                        rightItems.push({
                            id: `R-${title}-${idx}-${Date.now()}`,
                            name: row[2],
                            content: row[3] || ''
                        });
                    }
                });

                newTabs.push({
                    id: `tab-${title}`,
                    name: title,
                    left: leftItems,
                    right: rightItems
                });
            }

            setTabs(newTabs);
            setActiveTabIdx(0);
            saveToLocal(newTabs);
            setSyncStatus('匯入成功！');
            alert(`✅ 成功匯入 ${newTabs.length} 個頁籤！`);
            setTimeout(() => setSyncStatus('已連接'), 2000);

        } catch (error) {
            console.error(error);
            setSyncStatus('匯入失敗');
            alert('❌ 匯入失敗，請檢查 API Key 或 Sheet ID。');
        }
    };

    // 匯出功能目前先保留 JSON 結構傳送，Apps Script 端需要另外修改才能支援寫入多 Sheet
    const exportToGoogleSheets = async () => {
        if (!config.scriptUrl) {
            alert('請填寫 Apps Script 網址');
            return;
        }
        try {
            setSyncStatus('匯出中...');
            await fetch(config.scriptUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tabs: tabs }) 
            });
            setSyncStatus('匯出成功！');
            alert('✅ 資料已發送 (請確認 Apps Script 已更新以支援多頁籤)');
            setTimeout(() => setSyncStatus('已連接'), 2000);
        } catch (error) {
            alert('❌ 匯出失敗');
        }
    };

    // --- 編輯與操作 ---
    const copyToClipboard = async (template) => {
        const text = template.content;
        try {
            await navigator.clipboard.writeText(text);
            setCopiedId(template.id);
            setTimeout(() => setCopiedId(null), 1000);
        } catch (err) {
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
        const updatedTabs = [...tabs];
        const currentTab = { ...updatedTabs[activeTabIdx] };
        
        if (editingTemplate.side === 'left') {
            currentTab.left = currentTab.left.map(t => t.id === editingTemplate.id ? editingTemplate : t);
        } else {
            currentTab.right = currentTab.right.map(t => t.id === editingTemplate.id ? editingTemplate : t);
        }
        
        updatedTabs[activeTabIdx] = currentTab;
        setTabs(updatedTabs);
        saveToLocal(updatedTabs);
        setEditingTemplate(null);
    };

    const addRightTemplate = () => {
        const newTemplate = { id: `R-new-${Date.now()}`, name: '新組套', content: '' };
        const updatedTabs = [...tabs];
        updatedTabs[activeTabIdx].right.push(newTemplate);
        setTabs(updatedTabs);
        saveToLocal(updatedTabs);
        startEdit(newTemplate, 'right');
    };

    const addNewTab = () => {
        const name = prompt("輸入新頁籤名稱 (如 MRI, Sono):", "New Tab");
        if (!name) return;
        const newTab = { id: `tab-${Date.now()}`, name: name, left: [], right: [] };
        const newTabs = [...tabs, newTab];
        setTabs(newTabs);
        setActiveTabIdx(newTabs.length - 1);
        saveToLocal(newTabs);
    };

    const deleteCurrentTab = () => {
        if (tabs.length <= 1) return alert("至少保留一個頁籤！");
        if (!confirm(`確定刪除「${activeTab.name}」？`)) return;
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
        setEditingTabName(false);
    }

    const connectGoogleSheets = async () => {
        const newConfig = { ...config, isConnected: true };
        setConfig(newConfig);
        saveToLocal(tabs, newConfig);
        await loadFromGoogleSheets();
        setShowSettings(false);
    };

    // --- UI 元件 ---
    const TemplateButton = ({ template, side }) => (
        <div className="relative group">
            <button
                onClick={() => copyToClipboard(template)}
                className={`${
                    copiedId === template.id 
                        ? 'bg-green-500 text-white shadow-inner' 
                        : 'bg-white border border-slate-200 text-slate-700 hover:border-blue-400 hover:text-blue-600 shadow-sm'
                } w-full px-4 py-3 rounded-lg font-medium transition-all duration-200 text-left flex justify-between items-center`}
            >
                <span className="truncate mr-2">{template.name}</span>
                {copiedId === template.id && <span className="text-xs bg-white/20 px-2 py-0.5 rounded">OK</span>}
            </button>
            <button
                onClick={(e) => { e.stopPropagation(); startEdit(template, side); }}
                className="absolute top-2 right-2 p-1 text-slate-300 hover:text-blue-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            >
                ✏️
            </button>
        </div>
    );

    return (
        <div className="bg-slate-50 min-h-screen flex flex-col font-sans">
            {/* 頂部導航 */}
            <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4">
                    <div className="flex justify-between h-14 items-center">
                        <div className="flex items-center gap-2 font-bold text-slate-700">
                            <span className="bg-blue-600 text-white px-2 py-0.5 rounded text-sm">R</span>
                            <span className="hidden sm:block">放射組套</span>
                        </div>

                        {/* 頁籤區 */}
                        <div className="flex-1 mx-4 overflow-x-auto flex items-center gap-1 no-scrollbar">
                            {tabs.map((tab, idx) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTabIdx(idx)}
                                    className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-bold transition-all ${
                                        activeTabIdx === idx 
                                            ? 'bg-slate-800 text-white shadow' 
                                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                    }`}
                                >
                                    {tab.name}
                                </button>
                            ))}
                            <button onClick={addNewTab} className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-green-600 transition">＋</button>
                        </div>

                        <button onClick={() => setShowSettings(!showSettings)} className="text-slate-400 hover:text-slate-600">⚙️</button>
                    </div>
                </div>
            </div>

            <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
                {/* 設定面板 */}
                {showSettings && (
                    <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-5 mb-6">
                        <h2 className="text-lg font-bold mb-4 text-slate-800">連結 Google Sheet</h2>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-3">
                                <input type="text" placeholder="Spreadsheet ID" value={config.spreadsheetId} onChange={(e) => setConfig({...config, spreadsheetId: e.target.value})} className="w-full px-3 py-2 border rounded text-sm" />
                                <input type="text" placeholder="API Key" value={config.apiKey} onChange={(e) => setConfig({...config, apiKey: e.target.value})} className="w-full px-3 py-2 border rounded text-sm" />
                                <div className="flex gap-2">
                                    <button onClick={connectGoogleSheets} className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700">同步 (匯入)</button>
                                    <button onClick={() => setShowSettings(false)} className="px-4 bg-slate-100 rounded">關閉</button>
                                </div>
                            </div>
                            <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded">
                                <p className="font-bold mb-1">Sheet 格式說明：</p>
                                <ul className="list-disc pl-4 space-y-1">
                                    <li>每個分頁(Sheet) 對應一個頁籤</li>
                                    <li>A/B 欄：左側名稱/內容</li>
                                    <li>C/D 欄：右側名稱/內容</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                )}

                {/* 頁籤標題 */}
                <div className="flex justify-between items-end mb-4 border-b border-slate-200 pb-2">
                    {editingTabName ? (
                        <input autoFocus value={activeTab.name} onChange={(e) => renameCurrentTab(e.target.value)} onBlur={() => setEditingTabName(false)} className="text-2xl font-bold bg-transparent border-b-2 border-blue-500 outline-none w-48" />
                    ) : (
                        <h2 onClick={() => setEditingTabName(true)} className="text-2xl font-bold text-slate-800 cursor-pointer hover:text-blue-600" title="點擊改名">{activeTab.name}</h2>
                    )}
                    <button onClick={deleteCurrentTab} className="text-xs text-red-400 hover:text-red-600">刪除頁籤</button>
                </div>

                {/* 內容區 */}
                <div className="grid md:grid-cols-2 gap-6">
                    {/* 左欄 */}
                    <div className="space-y-3">
                        <div className="text-xs font-bold text-slate-400 uppercase">標準組套</div>
                        {activeTab.left.map(t => <TemplateButton key={t.id} template={t} side="left" />)}
                    </div>
                    {/* 右欄 */}
                    <div className="space-y-3">
                        <div className="flex justify-between">
                            <span className="text-xs font-bold text-slate-400 uppercase">自訂組套</span>
                            <button onClick={addRightTemplate} className="text-xs text-green-600 font-bold hover:bg-green-50 px-2 rounded">＋新增</button>
                        </div>
                        {activeTab.right.map(t => <TemplateButton key={t.id} template={t} side="right" />)}
                        {activeTab.right.length === 0 && <div className="text-center py-6 text-slate-300 text-sm border-2 border-dashed rounded-lg">無資料</div>}
                    </div>
                </div>
            </div>

            {/* 編輯視窗 */}
            {editingTemplate && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6">
                        <h3 className="text-lg font-bold mb-4">編輯內容</h3>
                        <div className="space-y-4">
                            <input type="text" value={editingTemplate.name} onInput={(e) => setEditingTemplate({...editingTemplate, name: e.target.value})} className="w-full px-3 py-2 border rounded" placeholder="名稱" />
                            <textarea value={editingTemplate.content} onInput={(e) => setEditingTemplate({...editingTemplate, content: e.target.value})} rows="10" className="w-full px-3 py-2 border rounded font-mono text-sm" placeholder="報告內容" />
                            <div className="flex gap-2">
                                <button onClick={saveTemplateEdit} className="flex-1 bg-blue-600 text-white py-2 rounded">儲存</button>
                                <button onClick={() => setEditingTemplate(null)} className="px-4 bg-slate-100 rounded">取消</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}