import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import './app.css';

// 定義 Storage Key (若有改結構建議換名以防衝突)
const STORAGE_KEY = 'radiologyTemplatesConfig_v2';

export function App() {
    // 預設資料結構：包含 Chest CT 和 Xray
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
    const [editingTabName, setEditingTabName] = useState(false); // 是否正在修改頁籤名稱
    const [showSettings, setShowSettings] = useState(false);
    const [copiedId, setCopiedId] = useState(null);
    const [syncStatus, setSyncStatus] = useState('本地儲存');
    
    const [config, setConfig] = useState({
        spreadsheetId: '',
        apiKey: '',
        scriptUrl: '',
        isConnected: false
    });

    // 取得當前頁籤的資料方便操作
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
            
            // 1. 先讀取試算表的 Metadata，取得所有工作表名稱
            const metaResponse = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}?key=${config.apiKey}`
            );
            const metaData = await metaResponse.json();
            
            if (!metaData.sheets) throw new Error('無法讀取試算表結構');

            setSyncStatus('下載內容中...');
            const newTabs = [];

            // 2. 遍歷每一個 Sheet，讀取 A:D 欄位
            for (const sheet of metaData.sheets) {
                const title = sheet.properties.title;
                const range = `${title}!A2:D`; // A,B=左側; C,D=右側
                
                const res = await fetch(
                    `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${range}?key=${config.apiKey}`
                );
                const json = await res.json();
                const rows = json.values || [];

                const leftItems = [];
                const rightItems = [];

                rows.forEach((row, idx) => {
                    // 解析左側 (Col A, B)
                    if (row[0]) {
                        leftItems.push({
                            id: `L-${title}-${idx}-${Date.now()}`,
                            name: row[0],
                            content: row[1] || ''
                        });
                    }
                    // 解析右側 (Col C, D)
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

    // 新增右側組套按鈕
    const addRightTemplate = () => {
        const newTemplate = { id: `R-new-${Date.now()}`, name: '新組套', content: '' };
        const updatedTabs = [...tabs];
        updatedTabs[activeTabIdx].right.push(newTemplate);
        
        setTabs(updatedTabs);
        saveToLocal(updatedTabs);
        startEdit(newTemplate, 'right');
    };

    // --- 頁籤管理 ---

    const addNewTab = () => {
        const name = prompt("請輸入新頁籤名稱 (例如: MRI, Sono):", "New Tab");
        if (!name) return;
        const newTab = {
            id: `tab-${Date.now()}`,
            name: name,
            left: [],
            right: []
        };
        const newTabs = [...tabs, newTab];
        setTabs(newTabs);
        setActiveTabIdx(newTabs.length - 1); // 切換到新頁籤
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
        setEditingTabName(false);
    }

    const connectGoogleSheets = async () => {
        const newConfig = { ...config, isConnected: true };
        setConfig(newConfig);
        saveToLocal(tabs, newConfig);
        await loadFromGoogleSheets();
        setShowSettings(false);
    };

    // --- UI Components ---

    const TemplateButton = ({ template, side }) => (
        <div className="relative group">
            <button
                onClick={() => copyToClipboard(template)}
                className={`${
                    copiedId === template.id 
                        ? 'bg-emerald-500 text-white shadow-inner scale-[0.98] copied-animation' 
                        : 'bg-white border border-slate-200 text-slate-700 hover:border-blue-400 hover:text-blue-600 shadow-sm hover:shadow-md'
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
                                <input type="text" placeholder="Spreadsheet ID" value={config.spreadsheetId} onChange={(e) => setConfig({...config, spreadsheetId: e.target.value})} className="w-full px-3 py-2 border rounded text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                                <input type="text" placeholder="API Key" value={config.apiKey} onChange={(e) => setConfig({...config, apiKey: e.target.value})} className="w-full px-3 py-2 border rounded text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                                <input type="text" placeholder="Apps Script URL (Write)" value={config.scriptUrl} onChange={(e) => setConfig({...config, scriptUrl: e.target.value})} className="w-full px-3 py-2 border rounded text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                                
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
                                    <button onClick={() => setShowSettings(false)} className="w-full py-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 transition-colors text-sm">
                                        關閉視窗
                                    </button>
                                </div>
                            </div>

                            <div className="text-sm text-slate-500 bg-slate-50 p-4 rounded-lg border border-slate-100">
                                <p className="font-bold mb-2 text-slate-700">Google Sheet 格式說明 (多頁籤版)：</p>
                                <ul className="list-disc pl-5 space-y-1 text-xs">
                                    <li>每一個工作表 (Sheet) 對應上方一個頁籤。</li>
                                    <li>工作表名稱 = 頁籤名稱。</li>
                                    <li><strong>A, B 欄</strong>：左側組套 (名稱, 內容)。</li>
                                    <li><strong>C, D 欄</strong>：右側組套 (名稱, 內容)。</li>
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
                                className="text-2xl font-bold text-slate-800 bg-transparent border-b-2 border-blue-500 outline-none w-48"
                                value={activeTab.name}
                                onChange={(e) => renameCurrentTab(e.target.value)}
                                onBlur={() => setEditingTabName(false)}
                                onKeyDown={(e) => e.key === 'Enter' && setEditingTabName(false)}
                            />
                        ) : (
                            <h2 
                                className="text-2xl font-bold text-slate-800 cursor-pointer hover:text-blue-600 flex items-center gap-2"
                                onClick={() => setEditingTabName(true)}
                                title="點擊修改名稱"
                            >
                                {activeTab.name}
                                <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-1 rounded-full">編輯</span>
                            </h2>
                        )}
                    </div>
                    <button onClick={deleteCurrentTab} className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-3 py-1 rounded transition">
                        刪除此頁籤
                    </button>
                </div>

                {/* 主要內容區 */}
                <div className="grid md:grid-cols-2 gap-8">
                    {/* 左側欄 */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">標準組套 (Left)</h3>
                        </div>
                        <div className="grid gap-3">
                            {activeTab.left.map(t => <TemplateButton key={t.id} template={t} side="left" />)}
                            {activeTab.left.length === 0 && <div className="text-center py-8 text-slate-300 text-sm italic bg-slate-50/50 rounded-lg">無資料 (請填寫 Sheet A/B 欄)</div>}
                        </div>
                    </div>

                    {/* 右側欄 */}
                    <div className="space-y-4">
                         <div className="flex justify-between items-center">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">自訂組套 (Right)</h3>
                            <button onClick={addRightTemplate} className="text-xs bg-green-50 text-green-600 font-bold px-2 py-1 rounded hover:bg-green-100 border border-green-200">＋ 新增</button>
                        </div>
                        <div className="grid gap-3">
                            {activeTab.right.map(t => <TemplateButton key={t.id} template={t} side="right" />)}
                            {activeTab.right.length === 0 && <div className="text-center py-8 text-slate-300 text-sm italic border-2 border-dashed border-slate-100 rounded-lg">尚無資料</div>}
                        </div>
                    </div>
                </div>
            </div>

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
        </div>
    );
}