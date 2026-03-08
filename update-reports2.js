const fs = require('fs');
const path = require('path');

const reportsServicePath = path.join('/home/mostafa/Work/joe13/joe-mi-ce/src/reports/reports.service.ts');
let code = fs.readFileSync(reportsServicePath, 'utf8');

// Replace sheet names
code = code.replace(
  /const attendanceSheet = workbook.addWorksheet\(\`\$\{monthName\} Attendance\`\);/g,
  "const tab1Sheet = workbook.addWorksheet(`Daily Values and Total`);"
);
code = code.replace(
  /const salesSheet = workbook.addWorksheet\(\`\$\{monthName\} Sales\`\);/g,
  "const tab2Sheet = workbook.addWorksheet(`SAR Entries`);"
);
code = code.replace(
  /const checkinSheet = workbook.addWorksheet\(\`\$\{monthName\} Check-in Check-out\`\);/g,
  "const tab3Sheet = workbook.addWorksheet(`Check-in - Check-out`);"
);

// Replace tab references
code = code.replace(/attendanceSheet\.columns/g, "tab1Sheet.columns");
code = code.replace(/salesSheet\.columns/g, "tab2Sheet.columns");
code = code.replace(/checkinSheet\.columns/g, "tab3Sheet.columns");

code = code.replace(/attendanceRowData/g, "tab1RowData");
code = code.replace(/salesRowData/g, "tab2RowData");
code = code.replace(/checkinRowData/g, "tab3RowData");

code = code.replace(/attendanceSheet\.addRow/g, "tab1Sheet.addRow");
code = code.replace(/salesSheet\.addRow/g, "tab2Sheet.addRow");
code = code.replace(/checkinSheet\.addRow/g, "tab3Sheet.addRow");

code = code.replace(/\[attendanceSheet, salesSheet, checkinSheet\]/g, "[tab1Sheet, tab2Sheet, tab3Sheet]");

const colDefs = `    tab1Sheet.columns = [...baseColumns, ...dateColumns, { header: 'TLL DAYS', key: 'ttl_days', width: 15 }];
    tab2Sheet.columns = [...baseColumns, ...dateColumns, { header: 'TLL DAYS', key: 'total_sales', width: 15 }];
    tab3Sheet.columns = [...baseColumns, ...checkinDateColumns, { header: 'TLL DAYS', key: 'ttl_days', width: 15 }];`;
const newColDefs = `    tab1Sheet.columns = [...baseColumns, ...dateColumns, { header: 'TLL DAYS', key: 'tll_days_tab1', width: 15 }];
    tab2Sheet.columns = [...baseColumns, ...dateColumns, { header: 'TLL DAYS', key: 'tll_days_tab2', width: 15 }];
    tab3Sheet.columns = [...baseColumns, ...checkinDateColumns, { header: 'TLL DAYS', key: 'tll_days_tab3', width: 15 }];`;
code = code.replace(colDefs, newColDefs);

// Replace inner loop assignment
// Now, Tab1 = raw integer value (sales total amount or quantity, let's just use sales quantity for example since in his example numbers are 90, 89 which sum to 1914). Wait, "Daily Values and Total" = maybe sales quantity. Or Target? Let's use sales quantity. No, let's use sales total_amount as integer.
const oldLoop = `        // Only process data up to the reporting end date
        if (dayjs(currentDateStr).isAfter(endOfReportingPeriod, 'day')) {
           tab1RowData[dayKey] = '';
           tab2RowData[dayKey] = 'SAR -';
           tab3RowData[dayInKey] = '';
           tab3RowData[dayOutKey] = '';
           continue;
        }

        // Attendance Logic
        const dayJourney = userJourneys.find(j => j.date === currentDateStr);
        if (dayJourney) {
          if (
            dayJourney.status === JourneyStatus.PRESENT || 
            dayJourney.status === JourneyStatus.UNPLANNED_PRESENT
          ) {
            tab1RowData[dayKey] = 1;
            ttlDays += 1;
          } else if (dayJourney.status === JourneyStatus.VACATION) {
            tab1RowData[dayKey] = 2; // Special status
          } else {
            tab1RowData[dayKey] = 0;
          }
        } else {
            // No journey scheduled/recorded
            tab1RowData[dayKey] = '';
        }

        const dayCheckin = dayJourney?.checkin;
        if (dayCheckin) {
            const inTime = dayCheckin.checkInTime ? dayjs(dayCheckin.checkInTime).format('HH:mm') : '--:--';
            const outTime = dayCheckin.checkOutTime ? dayjs(dayCheckin.checkOutTime).format('HH:mm') : '--:--';
            tab3RowData[dayInKey] = inTime;
            tab3RowData[dayOutKey] = outTime;
        } else {
            tab3RowData[dayInKey] = '';
            tab3RowData[dayOutKey] = '';
        }

        // Sales Logic
        const daySales = userSales.filter(s => dayjs(s.created_at).format('YYYY-MM-DD') === currentDateStr);
        const dailySalesTotal = daySales.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0);
        tab2RowData[dayKey] = dailySalesTotal > 0 ? \`SAR \${dailySalesTotal}\` : 'SAR -';
        totalSales += dailySalesTotal;`;

const newLoop = `        // Only process data up to the reporting end date
        if (dayjs(currentDateStr).isAfter(endOfReportingPeriod, 'day')) {
           tab1RowData[dayKey] = 0;
           tab2RowData[dayKey] = 'SAR -';
           tab3RowData[dayInKey] = '';
           tab3RowData[dayOutKey] = '';
           continue;
        }

        const dayJourney = userJourneys.find(j => j.date === currentDateStr);
        const dayCheckin = dayJourney?.checkin;
        if (dayCheckin) {
            const inTime = dayCheckin.checkInTime ? dayjs(dayCheckin.checkInTime).format('HH:mm') : '--:--';
            const outTime = dayCheckin.checkOutTime ? dayjs(dayCheckin.checkOutTime).format('HH:mm') : '--:--';
            tab3RowData[dayInKey] = inTime;
            tab3RowData[dayOutKey] = outTime;
            ttlDays += 1;
        } else {
            tab3RowData[dayInKey] = '';
            tab3RowData[dayOutKey] = '';
        }

        // Sales Logic
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

code = code.replace(oldLoop, newLoop);

const ttlDaysCode = `      tab1RowData['ttl_days'] = ttlDays;
      tab3RowData['ttl_days'] = ttlDays;
      tab2RowData['total_sales'] = totalSales > 0 ? \`SAR \${totalSales}\` : 'SAR -';`;

const ttlDaysNew = `      tab1RowData['tll_days_tab1'] = totalSales; // Sum of the daily values
      tab2RowData['tll_days_tab2'] = totalSales > 0 ? \`SAR \${totalSales}\` : 'SAR -';
      tab3RowData['tll_days_tab3'] = ttlDays; // Number of days checked in`;
      
code = code.replace(ttlDaysCode, ttlDaysNew);      

fs.writeFileSync(reportsServicePath, code);

