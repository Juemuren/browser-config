// ==UserScript==
// @name         export-html-table
// @namespace    https://github.com/Juemuren
// @version      1.0.0
// @description  将网页中的 HTML table 导出为 CSV
// @author       Raind
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // 创建导出按钮
    const button = document.createElement('button');
    button.textContent = '导出 Table CSV';

    Object.assign(button.style, {
        position: 'fixed',
        right: '20px',
        bottom: '20px',
        zIndex: '999999',
        padding: '10px 16px',
        border: 'none',
        borderRadius: '6px',
        background: '#1677ff',
        color: '#fff',
        fontSize: '14px',
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(0,0,0,.2)'
    });

    document.body.appendChild(button);

    button.addEventListener('click', () => {
        const tables = Array.from(document.querySelectorAll('table'));

        if (tables.length === 0) {
            alert('当前页面没有找到 HTML table');
            return;
        }

        let table;

        if (tables.length === 1) {
            table = tables[0];
        } else {
            const message = tables
                .map((t, index) => {
                    const rows = t.querySelectorAll('tr').length;
                    const cols = t.querySelector('tr')
                        ?.querySelectorAll('th, td').length || 0;

                    return `${index + 1}: ${rows} 行 × ${cols} 列`;
                })
                .join('\n');

            const input = prompt(
                `页面中找到 ${tables.length} 个 table：\n\n${message}\n\n请输入要导出的表格编号：`,
                '1'
            );

            if (input === null) return;

            const index = Number(input) - 1;

            if (
                !Number.isInteger(index) ||
                index < 0 ||
                index >= tables.length
            ) {
                alert('表格编号无效');
                return;
            }

            table = tables[index];
        }

        exportTableToCSV(table);
    });

    function exportTableToCSV(table) {
        const rows = Array.from(table.querySelectorAll('tr'));

        const csvRows = rows.map(row => {
            const cells = Array.from(
                row.querySelectorAll(':scope > th, :scope > td')
            );

            return cells
                .map(cell => escapeCSV(cell.innerText.trim()))
                .join(',');
        });

        const csv = csvRows.join('\r\n');

        // 加 BOM，方便 Excel 正确识别 UTF-8 中文
        const blob = new Blob(
            ['\uFEFF' + csv],
            {
                type: 'text/csv;charset=utf-8;'
            }
        );

        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = getFilename();

        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(url);
    }

    function escapeCSV(value) {
        value = String(value)
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n');

        // CSV 中含有逗号、引号或换行时必须用双引号包围
        if (
            value.includes(',') ||
            value.includes('"') ||
            value.includes('\n')
        ) {
            value = '"' + value.replace(/"/g, '""') + '"';
        }

        return value;
    }

    function getFilename() {
        const title = document.title
            .trim()
            .replace(/[\\/:*?"<>|]/g, '_')
            .slice(0, 100);

        return `${title || 'table'}.csv`;
    }
})();