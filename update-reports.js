const fs = require('fs');
const path = require('path');

const reportsServicePath = path.join('/home/mostafa/Work/joe13/joe-mi-ce/src/reports/reports.service.ts');
let code = fs.readFileSync(reportsServicePath, 'utf8');

// The goal is to:
// 1. Separate Checkin and Checkout columns for Tab 3
// 2. Format Tab 2 with "SAR -" or "SAR X"

code = code.replace(/const checkinSheet = workbook.addWorksheet\(`\${monthName} Checkin & Checkout`\);/, "const checkinSheet = workbook.addWorksheet(`${monthName} Check-in Check-out`);");

// Replace column definitions
const oldColumnLoop = `    const dateColumns = [];
    for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = \`\${currentMonthPrefix}-\${String(i).padStart(2, '0')}\`;
        dateColumns.push({ header: dateStr, key: \`day_\${i}\`, width: 15 });
    }

    attendanceSheet.columns = [...baseColumns, ...dateColumns, { header: 'TTL DAYS', key: 'ttl_days', width: 15 }];
    salesSheet.columns = [...baseColumns, ...dateColumns, { header: 'Total', key: 'total_sales', width: 15 }];
    checkinSheet.columns = [...baseColumns, ...dateColumns, { header: 'TTL DAYS', key: 'ttl_days', width: 15 }];`;

const newColumnLoop = `    const dateColumns = [];
    const checkinDateColumns = [];
    for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = \`\${currentMonthPrefix}-\${String(i).padStart(2, '0')}\`;
        dateColumns.push({ header: dateStr, key: \`day_\${i}\`, width: 15 });
        checkinDateColumns.push({ header: \`\${dateStr} Check-in\`, key: \`day_in_\${i}\`, width: 15 });
        checkinDateColumns.push({ header: \`\${dateStr} Check-out\`, key: \`day_out_\${i}\`, width: 15 });
    }

    attendanceSheet.columns = [...baseColumns, ...dateColumns, { header: 'TLL DAYS', key: 'ttl_days', width: 15 }];
    salesSheet.columns = [...baseColumns, ...dateColumns, { header: 'TLL DAYS', key: 'total_sales', width: 15 }];
    checkinSheet.columns = [...baseColumns, ...checkinDateColumns, { header: 'TLL DAYS', key: 'ttl_days', width: 15 }];`;

code = code.replace(oldColumnLoop, newColumnLoop);

// Replace loop payload logic
const oldInnerLoop = `      for (let i = 1; i <= daysInMonth; i++) {
        const currentDateStr = \`\${currentMonthPrefix}-\${String(i).padStart(2, '0')}\`;
        const dayKey = \`day_\${i}\`;
        
        // Only process data up to the reporting end date
        if (dayjs(currentDateStr).isAfter(endOfReportingPeriod, 'day')) {
           attendanceRowData[dayKey] = '';
           salesRowData[dayKey] = '';
           checkinRowData[dayKey] = '';
           continue;
        }

        // Attendance Logic
        const dayJourney = userJourneys.find(j => j.date === currentDateStr);
        if (dayJourney) {
          if (
            dayJourney.status === JourneyStatus.PRESENT || 
            dayJourney.status === JourneyStatus.UNPLANNED_PRESENT
          ) {
            attendanceRowData[dayKey] = 1;
            ttlDays += 1;
          } else if (dayJourney.status === JourneyStatus.VACATION) {
            attendanceRowData[dayKey] = 2; // Special status
          } else {
            attendanceRowData[dayKey] = 0;
          }
        } else {
            // No journey scheduled/recorded
            attendanceRowData[dayKey] = '';
        }

        const dayCheckin = dayJourney?.checkin;
        if (dayCheckin) {
            const inTime = dayCheckin.checkInTime ? dayjs(dayCheckin.checkInTime).format('HH:mm') : '--:--';
            const outTime = dayCheckin.checkOutTime ? dayjs(dayCheckin.checkOutTime).format('HH:mm') : '--:--';
            const statusStr = dayJourney?.status || 'Unknown';
            checkinRowData[dayKey] = \`\${inTime} | \${outTime} | \${statusStr}\`;
        } else {
            checkinRowData[dayKey] = '';
        }

        // Sales Logic
        const daySales = userSales.filter(s => dayjs(s.created_at).format('YYYY-MM-DD') === currentDateStr);
        const dailySalesTotal = daySales.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0);
        salesRowData[dayKey] = dailySalesTotal > 0 ? dailySalesTotal : 0;
        totalSales += dailySalesTotal;
      }`;

const newInnerLoop = `      for (let i = 1; i <= daysInMonth; i++) {
        const currentDateStr = \`\${currentMonthPrefix}-\${String(i).padStart(2, '0')}\`;
        const dayKey = \`day_\${i}\`;
        const dayInKey = \`day_in_\${i}\`;
        const dayOutKey = \`day_out_\${i}\`;
        
        // Only process data up to the reporting end date
        if (dayjs(currentDateStr).isAfter(endOfReportingPeriod, 'day')) {
           attendanceRowData[dayKey] = '';
           salesRowData[dayKey] = 'SAR -';
           checkinRowData[dayInKey] = '';
           checkinRowData[dayOutKey] = '';
           continue;
        }

        // Attendance Logic
        const dayJourney = userJourneys.find(j => j.date === currentDateStr);
        if (dayJourney) {
          if (
            dayJourney.status === JourneyStatus.PRESENT || 
            dayJourney.status === JourneyStatus.UNPLANNED_PRESENT
          ) {
            attendanceRowData[dayKey] = 1;
            ttlDays += 1;
          } else if (dayJourney.status === JourneyStatus.VACATION) {
            attendanceRowData[dayKey] = 2; // Special status
          } else {
            attendanceRowData[dayKey] = 0;
          }
        } else {
            // No journey scheduled/recorded
            attendanceRowData[dayKey] = '';
        }

        const dayCheckin = dayJourney?.checkin;
        if (dayCheckin) {
            const inTime = dayCheckin.checkInTime ? dayjs(dayCheckin.checkInTime).format('HH:mm') : '--:--';
            const outTime = dayCheckin.checkOutTime ? dayjs(dayCheckin.checkOutTime).format('HH:mm') : '--:--';
            checkinRowData[dayInKey] = inTime;
            checkinRowData[dayOutKey] = outTime;
        } else {
            checkinRowData[dayInKey] = '';
            checkinRowData[dayOutKey] = '';
        }

        // Sales Logic
        const daySales = userSales.filter(s => dayjs(s.created_at).format('YYYY-MM-DD') === currentDateStr);
        const dailySalesTotal = daySales.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0);
        salesRowData[dayKey] = dailySalesTotal > 0 ? \`SAR \${dailySalesTotal}\` : 'SAR -';
        totalSales += dailySalesTotal;
      }`;

code = code.replace(oldInnerLoop, newInnerLoop);

// Need to also format Total Sales column as "SAR {TotalSales}" if there's any or SAR -
const totalSalesReplace = `salesRowData['total_sales'] = totalSales;`;
const totalSalesNew = `salesRowData['total_sales'] = totalSales > 0 ? \`SAR \${totalSales}\` : 'SAR -';`;
code = code.replace(totalSalesReplace, totalSalesNew);

fs.writeFileSync(reportsServicePath, code);
