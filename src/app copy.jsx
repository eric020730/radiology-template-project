import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import './app.css';

const STORAGE_KEY = 'radiologyTemplatesConfig';

export function App() {
    const defaultLeftTemplates = [
        { id: 'L-1', name: 'ctlungc+', content: '' },
        { id: 'L-2', name: 'ctlungc-', content: '' },
        { id: 'L-3', name: 'ctlungpoop', content: '' },
        { id: 'L-4', name: 'ctlungpoopc-', content: '' },
        { id: 'L-5', name: 'ctlunghe', content: '' },
        { id: 'L-6', name: 'else', content: '' }
    ];

    const [leftTemplates, setLeftTemplates] = useState(defaultLeftTemplates);
    const [rightTemplates, setRightTemplates] = useState([]);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [showSettings, setShowSettings] = useState(false);
    const [copiedId, setCopiedId] = useState(null);
    const [syncStatus, setSyncStatus] = useState('本地儲存');
    
    const [config, setConfig] = useState({
        spreadsheetId: '',
        apiKey: '',
        scriptUrl: '',
        isConnected: false
    });

    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const data = JSON.parse(saved);
            if (data.leftTemplates) setLeftTemplates(data.leftTemplates);
            if (data.rightTemplates) setRightTemplates(data.rightTemplates);
            if (data.config) setConfig(data.config);
        }
    }, []);

    const saveToLocal = (left, right, currentConfig = config) => {
        const data = {
            leftTemplates: left,
            rightTemplates: right,
            config: currentConfig,
            lastUpdated: new Date().toISOString()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    };

    // 從 Google Sheets 載入 (範圍縮減為 A:B)
    const loadFromGoogleSheets = async () => {
        if (!config.spreadsheetId || !config.apiKey) {
            alert('請先設定 ID 和 API Key');
            return;
        }

        try {
            setSyncStatus('匯入中...');
            
            // 讀取 A2:B (名稱, 內容)
            const leftResponse = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/左側組套!A2:B?key=${config.apiKey}`
            );
            const leftData = await leftResponse.json();
            
            const rightResponse = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/右側組套!A2:B?key=${config.apiKey}`
            );
            const rightData = await rightResponse.json();

            if (leftData.values) {
                const loadedLeft = leftData.values.map((row, index) => ({
                    id: `L-${index}-${Date.now()}`, 
                    name: row[0] || '',
                    content: row[1] || ''
                }));
                setLeftTemplates(loadedLeft);
            }

            if (rightData.values) {
                const loadedRight = rightData.values.map((row, index) => ({
                    id: `R-${index}-${Date.now()}`,
                    name: row[0] || '',
                    content: row[1] || ''
                }));
                setRightTemplates(loadedRight);
            }

            setSyncStatus('匯入成功！');
            alert('✅ 匯入成功！(2欄格式)');
            setTimeout(() => setSyncStatus('已連接'), 2000);
        } catch (error) {
            setSyncStatus('匯入失敗');
            alert('❌ 匯入失敗，請確認試算表格式是否為：第1欄名稱、第2欄內容');
        }
    };

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
            alert('✅ 資料已成功發送至雲端 (2欄格式)！');
            setTimeout(() => setSyncStatus('已連接'), 2000);
        } catch (error) {
            alert('❌ 匯出失敗');
        }
    };

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
        const newId = `R-new-${Date.now()}`;
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

    const TemplateButton = ({ template, side }) => (
        <div className="relative group">
            <button
                onClick={() => copyToClipboard(template)}
                className={`${
                    copiedId === template.id 
                        ? 'bg-green-500 text-white shadow-inner' 
                        : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                } w-full px-4 py-3 rounded-lg font-medium transition-all duration-200`}
            >
                {copiedId === template.id ? '✓ 已複製！' : template.name}
            </button>
            <button
                onClick={() => startEdit(template, side)}
                className="absolute top-1 right-1 p-1 bg-white/90 rounded opacity-0 group-hover:opacity-100 transition-opacity shadow text-xs"
            >
                ✏️
            </button>
        </div>
    );

    return (
        <div className="p-6 bg-slate-50 min-h-screen">
            <div className="max-w-7xl mx-auto">
                <div className="bg-white rounded-xl shadow-sm p-5 mb-8 flex justify-between items-center border border-slate-200">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">放射科報告組套系統</h1>
                        <p className="text-sm text-slate-500 mt-1">只保留 [名稱] 與 [內容] 兩欄結構</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-xs text-slate-400 bg-slate-100 px-3 py-1 rounded-full font-mono">
                            {syncStatus}
                        </div>
                        <button onClick={() => setShowSettings(!showSettings)} className="p-2 hover:bg-slate-100 rounded-full transition text-slate-400">⚙️</button>
                    </div>
                </div>

                {showSettings && (
                    <div className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-blue-100">
                        <h2 className="text-lg font-bold mb-4 text-slate-800">系統連結設定</h2>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">試算表 ID</label>
                                    <input type="text" value={config.spreadsheetId} onChange={(e) => setConfig({...config, spreadsheetId: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">API 金鑰 (Read)</label>
                                    <input type="text" value={config.apiKey} onChange={(e) => setConfig({...config, apiKey: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Apps Script 網址 (Write)</label>
                                    <input type="text" value={config.scriptUrl} onChange={(e) => setConfig({...config, scriptUrl: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={connectGoogleSheets} className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-bold hover:bg-blue-700">連接並同步</button>
                                    <button onClick={() => setShowSettings(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg">關閉</button>
                                </div>
                            </div>
                            <div className="bg-slate-50 p-4 rounded-lg">
                                <h3 className="font-bold text-sm mb-2 text-slate-700">雲端同步說明</h3>
                                <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                                    1. 試算表第1欄請填入 [組套名稱]<br/>
                                    2. 第2欄請填入 [組套內容]<br/>
                                    3. 匯入會覆蓋本地，匯出會覆蓋雲端。
                                </p>
                                <div className="space-y-2">
                                    <button onClick={loadFromGoogleSheets} className="w-full bg-white border border-slate-200 text-slate-700 py-2 rounded-lg text-sm hover:border-blue-400 transition">📥 雲端 ➔ 本地 (匯入)</button>
                                    <button onClick={exportToGoogleSheets} className="w-full bg-white border border-slate-200 text-slate-700 py-2 rounded-lg text-sm hover:border-purple-400 transition">📤 本地 ➔ 雲端 (匯出)</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="grid md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">預設組套</h2>
                        <div className="grid grid-cols-1 gap-3">
                            {leftTemplates.map(template => <TemplateButton key={template.id} template={template} side="left" />)}
                        </div>
                    </div>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">自訂組套</h2>
                            <button onClick={addRightTemplate} className="text-xs font-bold text-green-600 hover:bg-green-50 px-2 py-1 rounded transition">＋ 新增</button>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                            {rightTemplates.length === 0 
                                ? <div className="border-2 border-dashed border-slate-200 rounded-xl py-12 text-center text-slate-400 text-sm">尚無資料</div>
                                : rightTemplates.map(template => <TemplateButton key={template.id} template={template} side="right" />)}
                        </div>
                    </div>
                </div>

                {editingTemplate && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold text-slate-800">編輯組套</h3>
                                <button onClick={() => setEditingTemplate(null)} className="text-slate-400 hover:text-slate-600 text-2xl">✕</button>
                            </div>
                            <div className="space-y-5">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">組套縮寫 (顯示於按鈕)</label>
                                    <input type="text" value={editingTemplate.name} onInput={(e) => setEditingTemplate({...editingTemplate, name: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">報告內容 (複製的內容)</label>
                                    <textarea value={editingTemplate.content} onInput={(e) => setEditingTemplate({...editingTemplate, content: e.target.value})} rows="10" className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm leading-relaxed" />
                                </div>
                                <div className="flex gap-3">
                                    <button onClick={saveEdit} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition">💾 儲存</button>
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