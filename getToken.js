const axios = require('axios');
const crypto = require('crypto');

// Ganti sesuai akunmu
const APP_ID = 'taufanmaulana1998';
const SECRET_KEY = '3enderayj4il1or3e93woezz1goqxhry';

const timestamp = Math.floor(Date.now() / 1000);

function generateSignature(secretKey, time) {
  const md5Secret = crypto.createHash('md5').update(secretKey).digest('hex');
  const signature = crypto
    .createHash('md5')
    .update(md5Secret + time)
    .digest('hex');
  return signature;
}

const signature = generateSignature(SECRET_KEY, timestamp);

const payload = {
  appid: APP_ID,
  time: timestamp,
  signature: signature,
};

async function getAccessToken() {
  try {
    console.log('Sending request with payload:', payload);
    const response = await axios.post(
      'https://open.iopgps.com/api/auth',
      payload,
      {
        headers: { 'Content-Type': 'application/json' },
      },
    );
    console.log('Raw response:', response.data);

    if (response.data.code === 0) {
      console.log('Access Token:', response.data.accessToken);
      console.log('Expires In (ms):', response.data.expiresIn);
    } else {
      console.error('Error from server:', response.data.result);
    }
  } catch (error) {
    console.error('Request failed:', error.message);
  }
}

getAccessToken();
