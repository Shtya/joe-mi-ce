const fs = require('fs');
const path = require('path');

const reportsServicePath = path.join('/home/mostafa/Work/joe13/joe-mi-ce/src/reports/reports.service.ts');
let code = fs.readFileSync(reportsServicePath, 'utf8');

// 1. Update Sale query to use sale_date
code = code.replace(/created_at: Between/g, "sale_date: Between");

// 2. Add totalQuantity variable
code = code.replace(/let totalSales = 0;/g, "let totalSales = 0;\n      let totalQuantity = 0;");

// 3. Update inner loop logic for Tab 1, 2, 3
const oldLoop = `        // Sales Logic
        const daySales = userSales.filter(s => dayjs(s.created_at).format('YYYY-MM-DD') === currentDateStr);
        // Using quantity or target for "Daily Values" is common. We will use total sales amount without SAR prefix for Tab 1, and with prefix for Tab 2.
        // But his screenshot has 44, 51, 75, 90. So we will use sum of quantities. 
        const dailyQuantityTotal = daySales.reduce((sum, sale) => sum + Number(sale.quantity || 0), 0);
        const dailySalesTotal = daySales.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0);
        
        // Tab 1: Daily values (e.g. integer amounts like quantites or values without SAR)
        tab1RowData[dayKey] = dailySalesTotal > 0 ? dailySalesTotal : 0;
        
        // Tab 2: SAR formatted
        tab2RowData[dayKey] = dailySalesTotal > 0 ? \`SAR \${dailySalesTotal}\` : 'SAR -';
        
        totalSales += dailySalesTotal;`;

const newLoop = `        // Sales Logic
        // Filter by sale_date
        const daySales = userSales.filter(s => dayjs(s.sale_date).format('YYYY-MM-DD') === currentDateStr);
        const dailyQuantityTotal = daySales.reduce((sum, sale) => sum + Number(sale.quantity || 0), 0);
        const dailySalesTotal = daySales.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0);
        
        // Tab 1: Daily values (Quantity as seen in user's image with value 44)
        tab1RowData[dayKey] = dailyQuantityTotal > 0 ? dailyQuantityTotal : 0;
        
        // Tab 2: SAR formatted
        tab2RowData[dayKey] = dailySalesTotal > 0 ? \`SAR \${dailySalesTotal}\` : 'SAR -';
        
        totalSales += dailySalesTotal;
        totalQuantity += dailyQuantityTotal;`;

code = code.replace(oldLoop, newLoop);

const oldTtl = `      tab1RowData['tll_days_tab1'] = totalSales; // Sum of the daily values
      tab2RowData['tll_days_tab2'] = totalSales > 0 ? \`SAR \${totalSales}\` : 'SAR -';
      tab3RowData['tll_days_tab3'] = ttlDays; // Number of days checked in`;

const newTtl = `      tab1RowData['tll_days_tab1'] = totalQuantity; // Total quantity for the month
      tab2RowData['tll_days_tab2'] = totalSales > 0 ? \`SAR \${totalSales}\` : 'SAR -';
      tab3RowData['tll_days_tab3'] = ttlDays; // Total days present`;

code = code.replace(oldTtl, newTtl);

// 4. Update Tab 3 column structure and header merging in generateMonthlyReport
// We need to change how columns are assigned and add the merging logic at the end.

// Find the column assignment part
const oldCols = `    tab1Sheet.columns = [...baseColumns, ...dateColumns, { header: 'TLL DAYS', key: 'tll_days_tab1', width: 15 }];
    tab2Sheet.columns = [...baseColumns, ...dateColumns, { header: 'TLL DAYS', key: 'tll_days_tab2', width: 15 }];
    tab3Sheet.columns = [...baseColumns, ...checkinDateColumns, { header: 'TLL DAYS', key: 'tll_days_tab3', width: 15 }];`;

const newCols = `    tab1Sheet.columns = [...baseColumns, ...dateColumns, { header: 'TLL DAYS', key: 'tll_days_tab1', width: 15 }];
    tab2Sheet.columns = [...baseColumns, ...dateColumns, { header: 'TLL DAYS', key: 'tll_days_tab2', width: 15 }];
    
    // Tab 3 will have a 2-row header for merging.
    // We override columns entirely for Tab 3 to manage the layout manually.
    const tab3ColKeys = [...baseColumns.map(c => c.key), ...checkinDateColumns.map(c => c.key), 'tll_days_tab3'];
    tab3Sheet.columns = tab3ColKeys.map(key => ({ key, width: 15 }));`;

code = code.replace(oldCols, newCols);

// Insert Merging Logic before Styling
const stylingMarker = `    // Styling
    [tab1Sheet, tab2Sheet, tab3Sheet].forEach(sheet => {`;

const mergingLogic = `    // Tab 3: Custom Header Merging (2 rows)
    tab3Sheet.insertRow(1, []); // Insert a new row at the top for Tab 3
    const headerRow1 = tab3Sheet.getRow(1);
    const headerRow2 = tab3Sheet.getRow(2);

    // Set row 2 headers for base columns
    baseColumns.forEach((col, index) => {
        const cell = headerRow1.getCell(index + 1);
        cell.value = col.header;
        tab3Sheet.mergeCells(1, index + 1, 2, index + 1); // Merge vertically
    });

    // Dates and Check-in/out
    let currentColIndex = baseColumns.length + 1;
    for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = \`\${currentMonthPrefix}-\${String(i).padStart(2, '0')}\`;
        
        // Header Row 1: Date
        const dateCell = headerRow1.getCell(currentColIndex);
        dateCell.value = dateStr;
        tab3Sheet.mergeCells(1, currentColIndex, 1, currentColIndex + 1); // Merge horizontally
        
        // Header Row 2: Check-in / Check-out
        headerRow2.getCell(currentColIndex).value = 'Check-in';
        headerRow2.getCell(currentColIndex + 1).value = 'Check-out';
        
        currentColIndex += 2;
    }

    // TLL DAYS at the end
    const tllDaysCell = headerRow1.getCell(currentColIndex);
    tllDaysCell.value = 'TLL DAYS';
    tab3Sheet.mergeCells(1, currentColIndex, 2, currentColIndex);

    // Apply styles to headers
    [headerRow1, headerRow2].forEach(row => {
        row.font = { bold: true };
        row.alignment = { vertical: 'middle', horizontal: 'center' };
    });

`;

code = code.replace(stylingMarker, mergingLogic + stylingMarker);

fs.writeFileSync(reportsServicePath, code);

