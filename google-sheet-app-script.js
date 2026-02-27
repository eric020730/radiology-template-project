function doPost(e) {
  try {
    const jsonData = JSON.parse(e.postData.contents);
    const tabs = jsonData.tabs;

    if (!tabs || !Array.isArray(tabs)) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: '格式錯誤: 找不到 tabs 資料' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 分組版：左側 A=分組名稱 B=左側組套名稱 C=左側組套內容 / 右側 D=分組名稱 E=右側組套名稱 F=右側組套內容
    const headerRow = ['左側分組名稱', '左側組套名稱', '左側組套內容', '右側分組名稱', '右側組套名稱', '右側組套內容'];

    // 將分組與組套攤平為一列一列：[分組名稱, 組套名稱, 組套內容]
    const toRows = (sideGroups) => {
      if (!sideGroups || !Array.isArray(sideGroups)) return [];
      const rows = [];
      sideGroups.forEach(group => {
        const gName = group.name || '';
        (group.items || []).forEach(item => {
          rows.push([gName, item.name || '', item.content || '']);
        });
      });
      return rows;
    };
    
    // 收集所有需要處理的工作表
    const sheetsToProcess = [];
    tabs.forEach((tab, index) => {
      const sheetName = tab.name;
      let sheet = ss.getSheetByName(sheetName);

      if (!sheet) {
        sheet = ss.insertSheet(sheetName);
      }

      const leftRows = toRows(tab.left);
      const rightRows = toRows(tab.right);
      const maxRows = Math.max(leftRows.length, rightRows.length, 1);
      const dataRows = [];

      for (let i = 0; i < maxRows; i++) {
        const left = leftRows[i] || ['', '', ''];
        const right = rightRows[i] || ['', '', ''];
        dataRows.push([
          left[0],  left[1],  left[2],   // A, B, C
          right[0], right[1], right[2]   // D, E, F
        ]);
      }

      // 清除整個工作表內容和格式，確保完全清除舊資料
      sheet.clear();
      // 寫入新的表頭（6 欄格式）
      sheet.getRange(1, 1, 1, 6).setValues([headerRow]).setFontWeight('bold').setBackground('#f3f4f6');
      // 寫入資料
      if (dataRows.length > 0) {
        sheet.getRange(2, 1, dataRows.length, 6).setValues(dataRows);
      }

      sheet.setColumnWidth(1, 120);
      sheet.setColumnWidth(2, 150);
      sheet.setColumnWidth(3, 300);
      sheet.setColumnWidth(4, 120);
      sheet.setColumnWidth(5, 150);
      sheet.setColumnWidth(6, 300);
      
      sheetsToProcess.push({ sheet: sheet, targetIndex: index });
    });

    // 重新排序工作表，使其順序與 tabs 陣列一致
    // 從後往前移動，避免索引變化影響
    for (let i = sheetsToProcess.length - 1; i >= 0; i--) {
      const { sheet, targetIndex } = sheetsToProcess[i];
      const currentIndex = ss.getSheets().indexOf(sheet);
      if (currentIndex !== targetIndex) {
        sheet.activate();
        ss.moveActiveSheet(targetIndex + 1); // moveActiveSheet 使用 1-based 索引
      }
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: '已成功更新所有頁籤（分組版 6 欄）並重新排序' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 一次性遷移：把「目前試算表」裡所有工作表從舊 4 欄格式改成新 6 欄格式。
 * 使用方式：在 Apps Script 編輯器選取此函式，按「執行」。
 * 舊格式：A=左名稱 B=左內容 C=右名稱 D=右內容
 * 新格式：A=左側分組名稱 B=左側組套名稱 C=左側組套內容 D=右側分組名稱 E=右側組套名稱 F=右側組套內容（左/右分組名稱預設為「預設」）
 */
function migrateAllSheetsToNewFormat() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const newHeader = ['左側分組名稱', '左側組套名稱', '左側組套內容', '右側分組名稱', '右側組套名稱', '右側組套內容'];

  ss.getSheets().forEach(sheet => {
    const lastRow = sheet.getLastRow();
    if (lastRow < 1) {
      sheet.getRange(1, 1, 1, 6).setValues([newHeader]).setFontWeight('bold').setBackground('#f3f4f6');
      sheet.setColumnWidth(1, 120);
      sheet.setColumnWidth(2, 150);
      sheet.setColumnWidth(3, 300);
      sheet.setColumnWidth(4, 120);
      sheet.setColumnWidth(5, 150);
      sheet.setColumnWidth(6, 300);
      return;
    }

    const maxCol = sheet.getLastColumn();
    const dataRange = sheet.getRange(2, 1, lastRow, Math.max(maxCol, 4));
    const rows = dataRange.getValues();

    let newRows;
    if (maxCol <= 4) {
      // 舊 4 欄：A=左名稱 B=左內容 C=右名稱 D=右內容 → 插入分組名稱「預設」
      newRows = rows.map(row => [
        '預設',                    // A 左側分組名稱
        row[0] != null ? row[0] : '',  // B 左側組套名稱
        row[1] != null ? row[1] : '',  // C 左側組套內容
        '預設',                    // D 右側分組名稱
        row[2] != null ? row[2] : '',  // E 右側組套名稱
        row[3] != null ? row[3] : ''   // F 右側組套內容
      ]);
    } else {
      // 已是 6 欄：只確保表頭正確，資料不動
      const header = sheet.getRange(1, 1, 1, 6).getValues()[0];
      const isNewHeader = header[0] === '左側分組名稱' || header[0] === '左側組套名稱';
      if (isNewHeader) return;
      newRows = rows.map(row => [
        row[0] != null ? row[0] : '',
        row[1] != null ? row[1] : '',
        row[2] != null ? row[2] : '',
        row[3] != null ? row[3] : '',
        row[4] != null ? row[4] : '',
        row[5] != null ? row[5] : ''
      ]);
    }

    sheet.clearContents();
    sheet.getRange(1, 1, 1, 6).setValues([newHeader]).setFontWeight('bold').setBackground('#f3f4f6');
    if (newRows.length > 0) {
      sheet.getRange(2, 1, newRows.length, 6).setValues(newRows);
    }
    sheet.setColumnWidth(1, 120);
    sheet.setColumnWidth(2, 150);
    sheet.setColumnWidth(3, 300);
    sheet.setColumnWidth(4, 120);
    sheet.setColumnWidth(5, 150);
    sheet.setColumnWidth(6, 300);
  });

  console.log('已將所有工作表改為新格式（6 欄）。');
}

