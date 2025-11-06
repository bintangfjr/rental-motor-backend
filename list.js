const axios = require('axios');

// Ganti dengan access token yang sudah didapat
const ACCESS_TOKEN = '1f72e7ee19d044de8b6e6fa981e41578';

// Parameter query
const params = {
  id: '', // bisa dikosongkan untuk default account ID
  currentPage: '1', // halaman saat ini
  pageSize: '20', // jumlah item per halaman, max 100
};

async function getDeviceList() {
  try {
    const response = await axios.get('https://open.iopgps.com/api/device', {
      headers: {
        accessToken: ACCESS_TOKEN, // gunakan ini sesuai API IOPGPS
        'Content-Type': 'application/json',
      },
      params: params,
    });

    console.log('Raw response:', response.data);

    if (response.data.code === 0) {
      console.log('Device List:', response.data.data);
      console.log('Pagination Info:', response.data.page);
    } else {
      console.error('Error:', response.data.result);
    }
  } catch (error) {
    if (error.response) {
      console.error('Request failed with status:', error.response.status);
      console.error('Response data:', error.response.data);
    } else {
      console.error('Request failed:', error.message);
    }
  }
}

getDeviceList();
