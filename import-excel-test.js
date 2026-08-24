const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

async function importExcel() {
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream('Book1 (003) (1).xlsx'));

    // Replace with your actual auth token
    const token = 'YOUR_BEARER_TOKEN_HERE';

    console.log('Uploading Book1 (003) (1).xlsx with dryRun=true...');
    const response = await axios.post('http://localhost:8081/user/import-users?dryRun=true', form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${token}`
      }
    });

    console.log('Import successful!');
    console.log(response.data);
  } catch (error) {
    console.error('Import failed:');
    if (error.response) {
      console.error(error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

importExcel();
