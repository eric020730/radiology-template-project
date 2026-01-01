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
    const saveToLocal = (left, right) => {
        const data = {
            leftTemplates: left,
            rightTemplates: right,
            config: config,
            lastUpdated: new Date().toISOString()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    };

    // 從 Google Sheets 載入資料
    const loadFromGoogleSheets = async () => {
        if (!config.spreadsheetId || !config.apiKey) {
            alert('請先設定 Google Sheets ID 和 API Key');
            return;
        }

        try {
            setSyncStatus('匯入中...');
            
            // 讀取左側組套
            const leftResponse = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/左側組套!A2:C?key=${config.apiKey}`
            );
            const leftData = await leftResponse.json();
            
            // 讀取右側組套
            const rightResponse = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/右側組套!A2:C?key=${config.apiKey}`
            );
            const rightData = await rightResponse.json();

            if (leftData.values) {
                const loadedLeft = leftData.values.map(row => ({
                    id: row[0] || `temp-${Date.now()}`,
                    name: row[1] || '',
                    content: row[2] || ''
                }));
                setLeftTemplates(loadedLeft);
            }

            if (rightData.values) {
                const loadedRight = rightData.values.map(row => ({
                    id: row[0] || `custom-${Date.now()}`,
                    name: row[1] || '',
                    content: row[2] || ''
                }));
                setRightTemplates(loadedRight);
            }

            setSyncStatus('匯入成功！');
            saveToLocal(
                leftData.values ? leftData.values.map(row => ({ id: row[0], name: row[1], content: row[2] })) : leftTemplates,
                rightData.values ? rightData.values.map(row => ({ id: row[0], name: row[1], content: row[2] })) : rightTemplates
            );
            
            alert('✅ 已從 Google Sheets 成功匯入組套資料！');
            setTimeout(() => setSyncStatus('已連接'), 2000);
        } catch (error) {
            console.error('匯入失敗:', error);
            setSyncStatus('匯入失敗');
            alert('❌ 從 Google Sheets 匯入失敗');
        }
    };

    // 匯出到 Google Sheets（使用 Apps Script）
    const exportToGoogleSheets = async () => {
        if (!config.spreadsheetId || !config.scriptUrl) {
            alert('需要設定 Apps Script 網址才能匯出。');
            return;
        }

        if (!confirm('確定要將目前的組套資料匯出到 Google Sheets 嗎？')) {
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
            alert('✅ 組套資料已成功匯出到 Google Sheets！');
            setTimeout(() => setSyncStatus('已連接'), 2000);
            
        } catch (error) {
            console.error('匯出失敗:', error);
            setSyncStatus('匯出失敗');
            alert('❌ 匯出失敗');
        }
    };

    // 複製到剪貼簿
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

    // 開始編輯
    const startEdit = (template, side) => {
        setEditingTemplate({ ...template, side });
    };

    // 儲存編輯
    const saveEdit = () => {
        if (!editingTemplate) return;
        
        let newLeft = leftTemplates;
        let newRight = rightTemplates;

        if (editingTemplate.side === 'left') {
            newLeft = leftTemplates.map(t => 
                t.id === editingTemplate.id ? editingTemplate : t
            );
            setLeftTemplates(newLeft);
        } else {
            newRight = rightTemplates.map(t => 
                t.id === editingTemplate.id ? editingTemplate : t
            );
            setRightTemplates(newRight);
        }
        
        saveToLocal(newLeft, newRight);
        setEditingTemplate(null);
        setSyncStatus('已儲存');
        setTimeout(() => setSyncStatus(config.isConnected ? '已連接' : '本地儲存'), 2000);
    };

    // 新增右側組套
    const addRightTemplate = () => {
        const newId = `custom-${Date.now()}`;
        const newTemplate = { id: newId, name: '新組套', content: '' };
        const newRight = [...rightTemplates, newTemplate];
        setRightTemplates(newRight);
        saveToLocal(leftTemplates, newRight);
        startEdit(newTemplate, 'right');
    };

    // 連接 Google Sheets
    const connectGoogleSheets = async () => {
        if (!config.spreadsheetId || !config.apiKey) {
            alert('請輸入試算表 ID 和 API Key');
            return;
        }
        const newConfig = { ...config, isConnected: true };
        setConfig(newConfig);
        saveToLocal(leftTemplates, rightTemplates);
        await loadFromGoogleSheets();
        alert('✅ 已成功連接 Google Sheets！');
        setShowSettings(false);
    };

    // 組套按鈕元件
    const TemplateButton = ({ template, side }) => (
        <div className="relative group">
            <button
                onClick={() => copyToClipboard(template)}
                className={`${
                    copiedId === template.id 
                        ? 'bg-green-500 text-white' 
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                } w-full px-4 py-3 rounded-lg font-medium transition-all`}
            >
                {copiedId === template.id ? '✓ 已複製！' : template.name}
            </button>
            <button
                onClick={() => startEdit(template, side)}
                className="absolute top-1 right-1 p-1 bg-white rounded opacity-0 group-hover:opacity-100 transition-opacity shadow"
                title="編輯"
            >
                ✏️
            </button>
        </div>
    );

    return (
        <div className="p-6">
            <div className="max-w-7xl mx-auto">
                {/* 標題列 */}
                <div className="bg-white rounded-lg shadow-md p-4 mb-6 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">放射科報告組套系統</h1>
                        <p className="text-sm text-gray-600 mt-1">點擊按鈕一鍵複製報告內容</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-sm">
                            <span className="text-gray-600">狀態：</span>
                            <span className="text-gray-600 font-medium">{syncStatus}</span>
                        </div>
                        {config.isConnected && (
                            <button
                                onClick={loadFromGoogleSheets}
                                className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm"
                            >
                                🔄 重新載入
                            </button>
                        )}
                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
                        >
                            ⚙️
                        </button>
                    </div>
                </div>

                {/* 設定面板 */}
                {showSettings && (
                    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                        <h2 className="text-xl font-bold mb-4">Google Sheets 設定</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">試算表 ID</label>
                                <input
                                    type="text"
                                    value={config.spreadsheetId}
                                    onChange={(e) => setConfig({...config, spreadsheetId: e.target.value})}
                                    placeholder="從網址複製試算表 ID"
                                    className="w-full px-4 py-2 border rounded-lg outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">API 金鑰</label>
                                <input
                                    type="text"
                                    value={config.apiKey}
                                    onChange={(e) => setConfig({...config, apiKey: e.target.value})}
                                    placeholder="請輸入 Google Sheets API 金鑰"
                                    className="w-full px-4 py-2 border rounded-lg outline-none"
                                />
                            </div>
                            <div className="flex gap-3">
                                <button onClick={connectGoogleSheets} className="px-4 py-2 bg-blue-600 text-white rounded-lg">連接</button>
                                <button onClick={() => setShowSettings(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg">取消</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* 主要按鈕區域 */}
                <div className="grid md:grid-cols-2 gap-6">
                    {/* 左側組套 */}
                    <div className="bg-white rounded-lg shadow-md p-6">
                        <h2 className="text-xl font-bold mb-4 text-gray-800">預設組套</h2>
                        <div className="space-y-3">
                            {leftTemplates.map(template => (
                                <TemplateButton key={template.id} template={template} side="left" />
                            ))}
                        </div>
                    </div>

                    {/* 右側組套 - 已移除所有刪除按鈕 */}
                    <div className="bg-white rounded-lg shadow-md p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-gray-800">自訂組套</h2>
                            <button
                                onClick={addRightTemplate}
                                className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                            >
                                ➕ 新增
                            </button>
                        </div>
                        <div className="space-y-3">
                            {rightTemplates.length === 0 
                                ? <p className="text-gray-400 text-center py-8">尚無自訂組套</p>
                                : rightTemplates.map(template => (
                                    <div key={template.id}>
                                        <TemplateButton template={template} side="right" />
                                    </div>
                                ))
                            }
                        </div>
                    </div>
                </div>

                {/* 編輯對話框 - 僅保留儲存與取消 */}
                {editingTemplate && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-xl font-bold">編輯組套</h3>
                                <button onClick={() => setEditingTemplate(null)}>✕</button>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">組套縮寫</label>
                                    <input
                                        type="text"
                                        value={editingTemplate.name}
                                        onChange={(e) => setEditingTemplate({...editingTemplate, name: e.target.value})}
                                        className="w-full px-4 py-2 border rounded-lg outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">組套內容</label>
                                    <textarea
                                        value={editingTemplate.content}
                                        onChange={(e) => setEditingTemplate({...editingTemplate, content: e.target.value})}
                                        rows="12"
                                        className="w-full px-4 py-2 border rounded-lg outline-none font-mono text-sm"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-3 mt-6">
                                <button onClick={saveEdit} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg">💾 儲存</button>
                                <button onClick={() => setEditingTemplate(null)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg">取消</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}