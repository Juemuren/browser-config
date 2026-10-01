// ==UserScript==
// @name         export-indexed-db
// @namespace    https://github.com/Juemuren
// @version      1.2
// @description  将当前页面的 IndexedDB 导出为 JSON
// @author       Raind
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    // 注册油猴菜单
    GM_registerMenuCommand("打开导出面板", createUI);

    // 注入样式
    GM_addStyle(`
        #idb-export-panel {
            --bg-color: White;
            --text-color: Black;
            --border-color: Gainsboro;
            --item-bg: GhostWhite;
            --primary-btn: SteelBlue;
            --secondary-btn: ForestGreen;

            position: fixed; bottom: 15px; right: 15px; width: 360px;
            background-color: var(--bg-color); color: var(--text-color);
            border: 2px solid var(--border-color); border-radius: 12px;
            z-index: 999999;
            font-family: system-ui, sans-serif; padding: 15px;
        }
        /* 自动切换黑暗模式 */
        @media (prefers-color-scheme: dark) {
            #idb-export-panel {
                --bg-color: Black;
                --text-color: WhiteSmoke;
                --border-color: DimGray;
                --item-bg: DarkSlateGray;
                --primary-btn: LightSkyBlue;
                --secondary-btn: MediumSeaGreen;
            }
        }

        #idb-export-panel h3 { margin: 0 0 15px 0; font-size: 1.1rem; border-bottom: 1px solid var(--border-color); }
        #idb-list-container { max-height: 400px; overflow-y: auto; }

        .idb-title-row {
            display: flex; justify-content: space-between; align-items: center;
        }
        .idb-db-item {
            display: flex; justify-content: space-between; align-items: center;
            padding: 10px; margin-bottom: 8px;
            background-color: var(--item-bg); border-radius: 6px;
        }
        .idb-export-btn {
            background-color: var(--primary-btn); color: White;
            border: none; padding: 5px 12px; border-radius: 4px; cursor: pointer;
        }
        .idb-refresh-btn {
            width: 100%; padding: 8px; border: none; border-radius: 4px;
            background-color: var(--secondary-btn); color: White;
            margin-top: 10px; cursor: pointer; font-weight: bold;
        }
        .idb-close-btn {
            float: right; cursor: pointer; color: Crimson; font-weight: bold; font-size: 1.2rem;
        }
    `);

    // 导出数据库
    async function exportDatabase(dbName) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(dbName);
            request.onerror = () => reject(`无法打开数据库: ${dbName}`);
            request.onsuccess = async (event) => {
                const db = event.target.result;
                const exportData = {
                    database: dbName,
                    version: db.version,
                    tables: {}
                };

                const storeNames = Array.from(db.objectStoreNames);
                if (storeNames.length === 0) {
                    resolve(exportData);
                    return;
                }

                const transaction = db.transaction(storeNames, "readonly");

                for (const storeName of storeNames) {
                    exportData.tables[storeName] = await new Promise((res) => {
                        const store = transaction.objectStore(storeName);
                        const getAllRequest = store.getAll();
                        getAllRequest.onsuccess = () => res(getAllRequest.result);
                        getAllRequest.onerror = () => res([]);
                    });
                }

                db.close();
                downloadJSON(dbName, exportData);
                resolve();
            };
        });
    }

    // 触发文件下载
    function downloadJSON(name, data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${window.location.hostname}@${name}_export.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // 界面构建
    function createUI() {
        if (document.getElementById('idb-export-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'idb-export-panel';

        // 标题栏
        const titleRow = document.createElement('div');
        titleRow.className = 'idb-title-row';
        const title = document.createElement('h3');
        title.textContent = 'indexedDB 导出面版';
        const closeBtn = document.createElement('span');
        closeBtn.className = 'idb-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.onclick = () => panel.remove();
        titleRow.append(title, closeBtn);

        // 列表容器
        const listContainer = document.createElement('div');
        listContainer.id = 'idb-list-container';
        listContainer.textContent = '扫描中';

        // 刷新按钮
        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'idb-refresh-btn';
        refreshBtn.textContent = '刷新';
        refreshBtn.onclick = () => updateList(listContainer);

        panel.append(titleRow, listContainer, refreshBtn);
        document.body.appendChild(panel);

        updateList(listContainer);
    }

    async function updateList(container) {
        container.textContent = "扫描中";
        const dbs = indexedDB.databases ? await indexedDB.databases() : [];

        // 清空容器
        while (container.firstChild) container.removeChild(container.firstChild);

        if (dbs.length === 0) {
            container.textContent = "未发现数据库";
            return;
        }

        dbs.forEach(db => {
            const item = document.createElement('div');
            item.className = 'idb-db-item';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = db.name;

            const exportBtn = document.createElement('button');
            exportBtn.className = 'idb-export-btn';
            exportBtn.textContent = '导出';
            exportBtn.onclick = () => {
                exportBtn.textContent = "导出中";
                exportDatabase(db.name).then(() => { exportBtn.textContent = "导出完成" });
            };

            item.append(nameSpan, exportBtn);
            container.appendChild(item);
        });
    }
})();