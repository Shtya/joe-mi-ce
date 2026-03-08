const fs = require('fs');
const path = require('path');

const reportsServicePath = path.join('/home/mostafa/Work/joe13/joe-mi-ce/src/reports/reports.service.ts');
let code = fs.readFileSync(reportsServicePath, 'utf8');

// 1. Add attendanceSheet definition
code = code.replace(
    /const tab1Sheet = workbook\.addWorksheet\(\`Daily Values and Total\`\);/,
    "const attendanceSheet = workbook.addWorksheet(`Attendance`);\n    const tab1Sheet = workbook.addWorksheet(`Daily Values and Total`);"
);

// 2. Set columns for attendanceSheet
code = code.replace(
    /tab1Sheet\.columns = \[\.\.\.baseColumns, \.\.\.dateColumns, \{ header: \'TLL DAYS\', key: \'tll_days_tab1\', width: 15 \}\];/,
    "attendanceSheet.columns = [...baseColumns, ...dateColumns, { header: 'TLL DAYS', key: 'ttl_attendance', width: 15 }];\n    tab1Sheet.columns = [...baseColumns, ...dateColumns, { header: 'TLL DAYS', key: 'tll_days_tab1', width: 15 }];"
);

// 3. Update result data structure to include attendanceRowData
code = code.replace(
    /const tab1RowData = \{ \.\.\.baseRowData \};/,
    "const attendanceRowData = { ...baseRowData };\n      const tab1RowData = { ...baseRowData };"
);

// 4. Update ttl variables
code = code.replace(
    /let ttlDays = 0;/,
    "let ttlDays = 0; // Present/Closed count for Tab 3 and Attendance tab\n      let ttlAttendance = 0; // Specifically for Attendance tab"
);

// 5. Update effective branch logic (Dynamic Store)
const baseRowDataOld = `      const baseRowData = {
        joe_user_1: user.username,
        no: rowNo++,
        name: user.name,
        joe_user_2: user.username,
        id: user.national_id || user.id.substring(0, 8),
        city: user.branch?.city?.name || 'N/A',
        channel: user.branch?.chain?.name || 'N/A',
        store: user.branch?.name || 'N/A',
        brand: projectName,
      };`;

const baseRowDataNew = `      // Dynamic Store Lookup Logic
      let effectiveBranch = user.branch;
      if (!effectiveBranch && userJourneys.length > 0) {
          const sorted = [...userJourneys].sort((a, b) => b.date.localeCompare(a.date));
          const lastWithBranch = sorted.find(j => j.branch);
          if (lastWithBranch) {
              effectiveBranch = lastWithBranch.branch;
          }
      }

      const baseRowData = {
        joe_user_1: user.username,
        no: rowNo++,
        name: user.name,
        joe_user_2: user.username,
        id: user.national_id || user.id.substring(0, 8),
        city: effectiveBranch?.city?.name || 'N/A',
        channel: effectiveBranch?.chain?.name || 'N/A',
        store: effectiveBranch?.name || 'N/A',
        brand: projectName,
      };`;

code = code.replace(baseRowDataOld, baseRowDataNew);

// 6. Update inner loop to populate attendanceRowData (1/0)
const oldLoop = `        const dayJourney = userJourneys.find(j => j.date === currentDateStr);
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

const newLoop = `        const dayJourney = userJourneys.find(j => j.date === currentDateStr);
        
        // Attendance Logic (Tab 1)
        if (dayJourney) {
            if ([JourneyStatus.PRESENT, JourneyStatus.CLOSED, JourneyStatus.UNPLANNED_PRESENT, JourneyStatus.UNPLANNED_CLOSED].includes(dayJourney.status as any)) {
                attendanceRowData[dayKey] = 1;
                ttlAttendance += 1;
                ttlDays += 1;
            } else if ([JourneyStatus.ABSENT, JourneyStatus.UNPLANNED_ABSENT].includes(dayJourney.status as any)) {
                attendanceRowData[dayKey] = 0;
            } else {
                attendanceRowData[dayKey] = ''; 
            }
        } else {
            attendanceRowData[dayKey] = '';
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
        const daySales = userSales.filter(s => dayjs(s.sale_date).format('YYYY-MM-DD') === currentDateStr);
        const dailyQuantityTotal = daySales.reduce((sum, sale) => sum + Number(sale.quantity || 0), 0);
        const dailySalesTotal = daySales.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0);
        
        tab1RowData[dayKey] = dailyQuantityTotal > 0 ? dailyQuantityTotal : 0;
        tab2RowData[dayKey] = dailySalesTotal > 0 ? \`SAR \${dailySalesTotal}\` : 'SAR -';
        
        totalSales += dailySalesTotal;
        totalQuantity += dailyQuantityTotal;`;

code = code.replace(oldLoop, newLoop);

// 7. Update TTLs and add row to attendanceSheet
code = code.replace(
    /tab1RowData\[\'tll_days_tab1\'\] = totalQuantity;/,
    "attendanceRowData['ttl_attendance'] = ttlAttendance;\n      tab1RowData['tll_days_tab1'] = totalQuantity;"
);

code = code.replace(
    /tab1Sheet\.addRow\(tab1RowData\);/,
    "attendanceSheet.addRow(attendanceRowData);\n      tab1Sheet.addRow(tab1RowData);"
);

// 8. Add attendanceSheet to styling & merging logic? No, merging is only for Tab 3.
code = code.replace(
    /\[tab1Sheet, tab2Sheet, tab3Sheet\]\.forEach/,
    "[attendanceSheet, tab1Sheet, tab2Sheet, tab3Sheet].forEach"
);

fs.writeFileSync(reportsServicePath, code);
