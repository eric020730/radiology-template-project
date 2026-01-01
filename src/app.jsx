import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import './app.css';

// Google Sheets API 配置
const STORAGE_KEY = 'radiologyTemplatesConfig';

export function App() {
    // 預設左側組套
    const defaultLeftTemplates = [
        { id: 'ctlungc+', name: 'ctlungc+', content: '' },
        { id: 'ctlungc-', name: 'ctlungc-', content: '' },
        { id: 'ctlungpoop', name: 'ctlungpoop', content: '' },
        { id: 'ctlungpoopc-', name: 'ctlungpoopc-', content: '' },
        { id: 'ctlunghe', name: 'ctlunghe', content: '' },
        { id: 'else', name: 'else', content: '' }
    ];

    const [leftTemplates, setLeftTemplates] = useState(defaultLeftTemplates);
    const [rightTemplates, setRightTemplates] = useState([]);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [showSettings, setShowSettings] = useState(false);
    const [copiedId, setCopiedId] = useState(null);
    const [syncStatus, setSyncStatus] = useState('本地儲存');
    
    // Google Sheets 配置
    const [config, setConfig] = useState({
        spreadsheetId: '',
        apiKey: '',
        scriptUrl: '',
        isConnected: false
    });

    // 載入本地儲存的資料
    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const data = JSON.parse(saved);
            if (data.leftTemplates) setLeftTemplates(data.leftTemplates);
            if (data.rightTemplates) setRightTemplates(data.rightTemplates);
            if (data.config) setConfig(data.config);
        }
    }, []);

    // 儲存到本地
    const saveToLocal = (left, right, currentConfig = config) => {
        const data = {
            leftTemplates: left,
            rightTemplates: right,
            config: currentConfig,
            lastUpdated: new Date().toISOString()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    };

    // 從 Google Sheets 載入資料 (修正了 ID 重複的問題)
    const loadFromGoogleSheets = async () => {
        if (!config.spreadsheetId || !config.apiKey) {
            alert('請先設定 Google Sheets ID 和 API Key');
            return;
        }

        try {
            setSyncStatus('匯入中...');
            
            const leftResponse = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/左側組套!A2:C?key=${config.apiKey}`
            );
            const leftData = await leftResponse.json();
            
            const rightResponse = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/右側組套!A2:C?key=${config.apiKey}`
            );
            const rightData = await rightResponse.json();

            // 加入 index 確保 ID 絕對唯一
            if (leftData.values) {
                const loadedLeft = leftData.values.map((row, index) => ({
                    id: row[0] || `left-${index}-${Date.now()}`, 
                    name: row[1] || '',
                    content: row[2] || ''
                }));
                setLeftTemplates(loadedLeft);
            }

            if (rightData.values) {
                const loadedRight = rightData.values.map((row, index) => ({
                    id: row[0] || `right-${index}-${Date.now()}`,
                    name: row[1] || '',
                    content: row[2] || ''
                }));
                setRightTemplates(loadedRight);
            }

            setSyncStatus('匯入成功！');
            alert('✅ 已成功匯入組套資料！');
            setTimeout(() => setSyncStatus('已連接'), 2000);
        } catch (error) {
            console.error('匯入失敗:', error);
            setSyncStatus('匯入失敗');
            alert('❌ 匯入失敗');
        }
    };

    // 匯出功能
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
                body: JSON.stringify({
                    leftTemplates: leftTemplates,
                    rightTemplates: rightTemplates
                })
            });

            setSyncStatus('匯出成功！');
            alert('✅ 資料已發送！請確認試算表。');
            setTimeout(() => setSyncStatus('已連接'), 2000);
        } catch (error) {
            alert('❌ 匯出失敗');
        }
    };

    // 複製功能
    const copyToClipboard = async (template) => {
        try {
            await navigator.clipboard.writeText(template.content);
            setCopiedId(template.id);
            setTimeout(() => setCopiedId(null), 2000);
        } catch (err) {
            const textarea = document.createElement('textarea');
            textarea.value = template.content;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            setCopiedId(template.id);
            setTimeout(() => setCopiedId(null), 2000);
        }
    };

    const startEdit = (template, side) => {
        setEditingTemplate({ ...template, side });
    };

    const saveEdit = () => {
        if (!editingTemplate) return;
        let newLeft = leftTemplates;
        let newRight = rightTemplates;

        if (editingTemplate.side === 'left') {
            newLeft = leftTemplates.map(t => t.id === editingTemplate.id ? editingTemplate : t);
            setLeftTemplates(newLeft);
        } else {
            newRight = rightTemplates.map(t => t.id === editingTemplate.id ? editingTemplate : t);
            setRightTemplates(newRight);
        }
        
        saveToLocal(newLeft, newRight);
        setEditingTemplate(null);
    };

    const addRightTemplate = () => {
        const newId = `custom-${Date.now()}`;
        const newTemplate = { id: newId, name: '新組套', content: '' };
        const newRight = [...rightTemplates, newTemplate];
        setRightTemplates(newRight);
        saveToLocal(leftTemplates, newRight);
        startEdit(newTemplate, 'right');
    };

    const connectGoogleSheets = async () => {
        if (!config.spreadsheetId || !config.apiKey) {
            alert('請輸入 ID 和 Key');
            return;
        }
        const newConfig = { ...config, isConnected: true };
        setConfig(newConfig);
        saveToLocal(leftTemplates, rightTemplates, newConfig);
        await loadFromGoogleSheets();
        setShowSettings(false);
    };

    // 按鈕元件
    const TemplateButton = ({ template, side }) => (
        <div className="relative group">
            <button
                onClick={() => copyToClipboard(template)}
                className={`${
                    copiedId === template.id 
                        ? 'bg-green-500 text-white' 
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                } w-full px-4 py-3 rounded-lg font-medium transition-all shadow-sm`}
            >
                {copiedId === template.id ? '✓ 已複製！' : template.name}
            </button>
            <button
                onClick={() => startEdit(template, side)}
                className="absolute top-1 right-1 p-1 bg-white rounded opacity-0 group-hover:opacity-100 transition-opacity shadow text-xs"
            >
                ✏️
            </button>
        </div>
    );

    return (
        <div className="p-6 bg-slate-50 min-h-screen">
            <div className="max-w-7xl mx-auto">
                {/* 標題列 */}
                <div className="bg-white rounded-xl shadow-sm p-5 mb-8 flex justify-between items-center border border-slate-200">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">放射科報告組套系統</h1>
                        <p className="text-sm text-slate-500 mt-1">點擊按鈕複製內容，✏️ 編輯組套</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-xs text-slate-400 bg-slate-100 px-3 py-1 rounded-full font-mono">
                            {syncStatus}
                        </div>
                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className="p-2 hover:bg-slate-100 rounded-full transition text-slate-400"
                        >
                            ⚙️
                        </button>
                    </div>
                </div>

                {/* 設定面板 */}
                {showSettings && (
                    <div className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-blue-100 animate-in fade-in slide-in-from-top-4 duration-300">
                        <h2 className="text-lg font-bold mb-4 text-slate-800">系統設定</h2>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">試算表 ID</label>
                                    <input
                                        type="text"
                                        value={config.spreadsheetId}
                                        onChange={(e) => setConfig({...config, spreadsheetId: e.target.value})}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">API 金鑰</label>
                                    <input
                                        type="text"
                                        value={config.apiKey}
                                        onChange={(e) => setConfig({...config, apiKey: e.target.value})}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Apps Script 網址</label>
                                    <input
                                        type="text"
                                        value={config.scriptUrl}
                                        onChange={(e) => setConfig({...config, scriptUrl: e.target.value})}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={connectGoogleSheets} className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-bold hover:bg-blue-700 transition">連接並匯入</button>
                                    <button onClick={() => setShowSettings(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200">取消</button>
                                </div>
                            </div>
                            <div className="bg-slate-50 p-4 rounded-lg flex flex-col justify-center">
                                <h3 className="font-bold text-sm mb-2 text-slate-700">資料管理</h3>
                                <div className="space-y-2">
                                    <button onClick={loadFromGoogleSheets} className="w-full bg-white border border-slate-200 text-slate-700 py-2 rounded-lg text-sm hover:border-blue-400 transition">📥 從雲端同步到本地</button>
                                    <button onClick={exportToGoogleSheets} className="w-full bg-white border border-slate-200 text-slate-700 py-2 rounded-lg text-sm hover:border-purple-400 transition">📤 將本地上傳到雲端</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 按鈕區 */}
                <div className="grid md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                            <span className="w-2 h-2 bg-blue-500 rounded-full"></span> 預設組套
                        </h2>
                        <div className="grid grid-cols-1 gap-3">
                            {leftTemplates.map(template => (
                                <TemplateButton key={template.id} template={template} side="left" />
                            ))}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                <span className="w-2 h-2 bg-green-500 rounded-full"></span> 自訂組套
                            </h2>
                            <button onClick={addRightTemplate} className="text-xs font-bold text-green-600 hover:bg-green-50 px-2 py-1 rounded transition">＋ 新增</button>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                            {rightTemplates.length === 0 
                                ? <div className="border-2 border-dashed border-slate-200 rounded-xl py-12 text-center text-slate-400 text-sm">尚無資料</div>
                                : rightTemplates.map(template => (
                                    <TemplateButton key={template.id} template={template} side="right" />
                                ))
                            }
                        </div>
                    </div>
                </div>

                {/* 編輯窗 */}
                {editingTemplate && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 animate-in zoom-in-95 duration-200">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold text-slate-800">編輯內容</h3>
                                <button onClick={() => setEditingTemplate(null)} className="text-slate-400 hover:text-slate-600 text-2xl">✕</button>
                            </div>
                            <div className="space-y-5">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">顯示名稱</label>
                                    <input
                                        type="text"
                                        value={editingTemplate.name}
                                        onInput={(e) => setEditingTemplate({...editingTemplate, name: e.target.value})}
                                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">報告內容</label>
                                    <textarea
                                        value={editingTemplate.content}
                                        onInput={(e) => setEditingTemplate({...editingTemplate, content: e.target.value})}
                                        rows="10"
                                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm leading-relaxed"
                                    />
                                </div>
                                <div className="flex gap-3">
                                    <button onClick={saveEdit} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition">💾 儲存變更</button>
                                    <button onClick={() => setEditingTemplate(null)} className="px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition">取消</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}