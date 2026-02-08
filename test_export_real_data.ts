
import axios from 'axios';
import * as fs from 'fs';
import * as ExcelJS from 'exceljs';

async function testExport() {
  try {
    const baseUrl = 'http://localhost:8082';
    const relativeUrl = '/api/v1/journeys/project/86419039-94f6-42f3-a629-0f83a26a0140?module=journey';

    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI3MmM4ODRkZC02ODNlLTQwOWItYWY5ZC05YTk1MzgwMmZhZTAiLCJ1c2VybmFtZSI6InByb2plY3RhZG1pbiIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc3MDUxNDA1OCwiZXhwIjoxNzcwNjg2ODU4fQ.k5DU5LHBNlXvLSbEGv_2JdYvOvEix5FRroWR5IxT4UY';
    
    // The endpoint expects: ?url=...
    const exportUrl = `${baseUrl}/api/v1/export/by-url?url=${encodeURIComponent(relativeUrl)}`;
    console.log(`Requesting export from: ${exportUrl}`);

    const response = await axios({
      method: 'GET',
      url: exportUrl,
      responseType: 'arraybuffer',
      validateStatus: () => true, // Accept all status codes
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    console.log(`Response Status: ${response.status}`);
    
    if (response.status !== 200 && response.status !== 201) {
        console.error('Failed to download export:', response.status, response.statusText);
        if (response.data) {
             console.error('Body:', response.data.toString());
        }
        return;
    }

    // Save to file
    const filename = 'test_unplanned_export.xlsx';
    fs.writeFileSync(filename, response.data);
    console.log(`Saved export to ${filename}`);

    // Read headers
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(response.data);
    const worksheet = workbook.getWorksheet(1);
    
    if (!worksheet) {
        console.error('No worksheet found in excel file');
        return;
    }
    
    const firstRow = worksheet.getRow(1);
    const headers: string[] = [];
    firstRow.eachCell((cell, colNumber) => {
      headers.push(cell.value ? cell.value.toString() : '');
    });

    console.log('Headers found in Excel:', headers);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testExport();
