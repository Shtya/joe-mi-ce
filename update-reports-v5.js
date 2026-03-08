const fs = require('fs');
const path = require('path');

const reportsServicePath = path.join('/home/mostafa/Work/joe13/joe-mi-ce/src/reports/reports.service.ts');
let code = fs.readFileSync(reportsServicePath, 'utf8');

// 1. Remove tab1Sheet definition
code = code.replace(/const tab1Sheet = workbook\.addWorksheet\(\`Daily Values and Total\`\);\n/, "");

// 2. Change daysInMonth to respect "until the day we are"
code = code.replace(
    /let endOfReportingPeriod = now\.subtract\(1, \'day\'\)\.endOf\(\'day\'\);/g,
    "let endOfReportingPeriod = now.endOf('day'); // Up to today"
);
code = code.replace(
    /const daysInMonth = now\.daysInMonth\(\);/g,
    "const daysInMonth = (now.month() === dayjs().month() && now.year() === dayjs().year()) ? now.date() : now.daysInMonth();"
);

// 3. Columns Logic
code = code.replace(
    /tab1Sheet\.columns = \[.*?\];\n    /g,
    "" 
);

// 4. Filter users by role 'promoter'
const usersQueryOld = `    const users = await this.userRepository.find({
      where: { 
        is_active: true,
        ...(projectId && { project_id: projectId })
      },
      relations: ['role', 'branch', 'branch.city', 'branch.chain'],
    });`;
const usersQueryNew = `    let users = await this.userRepository.find({
      where: { 
        is_active: true,
        ...(projectId && { project_id: projectId })
      },
      relations: ['role', 'branch', 'branch.city', 'branch.chain'],
    });
    // Post-filter to ensure only promoters are included
    users = users.filter(u => u.role?.name?.toLowerCase() === 'promoter');`;
code = code.replace(usersQueryOld, usersQueryNew);

// 5. Build Attendance Sheet Row 1 and Row 2 logic
const loopBodyOldRegex = /const attendanceRowData = \{ \.\.\.baseRowData \};\s*const tab1RowData = \{ \.\.\.baseRowData \};[\s\S]*?(?=attendanceSheet\.addRow\(attendanceRowData\);[\s\S]*?tab3Sheet\.addRow\(tab3RowData\);)/;

const newLoopBody = `      const attendanceRow1 = { ...baseRowData }; // For Attendance (1/0)
      const attendanceRow2 = { ...baseRowData }; // For Daily Values (Quantity)
      const tab2RowData = { ...baseRowData };
      const tab3RowData = { ...baseRowData };

      let ttlDays = 0; // Checkin
      let ttlAttendance = 0; // Attendance sum
      let totalSales = 0; // SAR sales
      let totalQuantity = 0; // Daily quantities

      for (let i = 1; i <= daysInMonth; i++) {
        const currentDateStr = \`\${currentMonthPrefix}-\${String(i).padStart(2, '0')}\`;
        const dayKey = \`day_\${i}\`;
        const dayInKey = \`day_in_\${i}\`;
        const dayOutKey = \`day_out_\${i}\`;
        
        // Only process data up to the reporting end date
        if (dayjs(currentDateStr).isAfter(endOfReportingPeriod, 'day')) {
           attendanceRow1[dayKey] = '';
           attendanceRow2[dayKey] = 0;
           tab2RowData[dayKey] = 'SAR -';
           tab3RowData[dayInKey] = '';
           tab3RowData[dayOutKey] = '';
           continue;
        }

        const dayJourney = userJourneys.find(j => j.date === currentDateStr);
        
        // Attendance Logic (Row 1)
        if (dayJourney) {
            if ([JourneyStatus.PRESENT, JourneyStatus.CLOSED, JourneyStatus.UNPLANNED_PRESENT, JourneyStatus.UNPLANNED_CLOSED].includes(dayJourney.status as any)) {
                attendanceRow1[dayKey] = 1;
                ttlAttendance += 1;
                ttlDays += 1;
            } else if ([JourneyStatus.ABSENT, JourneyStatus.UNPLANNED_ABSENT].includes(dayJourney.status as any)) {
                attendanceRow1[dayKey] = 0;
            } else {
                attendanceRow1[dayKey] = ''; 
            }
        } else {
            attendanceRow1[dayKey] = '';
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
        
        // Attendance Logic (Row 2 - Daily Values)
        attendanceRow2[dayKey] = dailyQuantityTotal > 0 ? dailyQuantityTotal : 0;
        
        // SAR Entries
        tab2RowData[dayKey] = dailySalesTotal > 0 ? \`SAR \${dailySalesTotal}\` : 'SAR -';
        
        totalSales += dailySalesTotal;
        totalQuantity += dailyQuantityTotal;
      }

      attendanceRow1['ttl_attendance'] = ttlAttendance;
      attendanceRow2['ttl_attendance'] = totalQuantity; // Second row gets the total quantity
      
      tab2RowData['tll_days_tab2'] = totalSales > 0 ? \`SAR \${totalSales}\` : 'SAR -';
      tab3RowData['tll_days_tab3'] = ttlDays; 

`;
code = code.replace(loopBodyOldRegex, newLoopBody);

code = code.replace(/attendanceSheet\.addRow\(attendanceRowData\);\s*tab1Sheet\.addRow\(tab1RowData\);\s*tab2Sheet\.addRow\(tab2RowData\);\s*tab3Sheet\.addRow\(tab3RowData\);/, 
`      attendanceSheet.addRow(attendanceRow1);
      attendanceSheet.addRow(attendanceRow2);
      tab2Sheet.addRow(tab2RowData);
      tab3Sheet.addRow(tab3RowData);`);

// 6. Delete styling mentions of tab1Sheet
code = code.replace(/\[attendanceSheet, tab1Sheet, tab2Sheet, tab3Sheet\]\.forEach/, "[attendanceSheet, tab2Sheet, tab3Sheet].forEach");

// 7. Add advanced styling (Filters, Borders, Colors)
const newStylingLogic = `    // Styling (Advanced Design & Filters)
    const headerStyle = {
      font: { bold: true, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      }
    };

    const cellBorder = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
        color: { argb: 'FFBFBFBF' } 
    };

    [attendanceSheet, tab2Sheet, tab3Sheet].forEach(sheet => {
      // Auto-filter
      const rowCount = sheet.rowCount;
      const colCount = sheet.columnCount;
      if (rowCount > 0 && colCount > 0) {
        // Tab 3 uses a 2 row header, others use 1 row header
        const isTab3 = sheet.name === 'Check-in - Check-out';
        const startRow = isTab3 ? 2 : 1; 
        sheet.autoFilter = {
             from: { row: startRow, column: 1 },
             to: { row: rowCount, column: colCount }
        };
      }

      sheet.eachRow((row, rowNumber) => {
        // Apply header styling to row 1 (and 2 for tab 3)
        const isTab3 = sheet.name === 'Check-in - Check-out';
        const isHeader = isTab3 ? (rowNumber <= 2) : (rowNumber === 1);

        row.eachCell((cell) => {
          if (isHeader) {
            cell.font = headerStyle.font;
            cell.fill = headerStyle.fill as exceljs.Fill;
            cell.alignment = headerStyle.alignment as any;
          }
          cell.border = cellBorder as Partial<exceljs.Borders>;
        });
      });
    });`;

code = code.replace(/\/\/ Styling\n\s*\[attendanceSheet, tab2Sheet, tab3Sheet\]\.forEach\([\s\S]*?\}\);/g, newStylingLogic);

// Add missing specific fixes
// Replace End of file
fs.writeFileSync(reportsServicePath, code);

