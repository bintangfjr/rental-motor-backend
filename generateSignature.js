const axios = require('axios');
const crypto = require('crypto');

// Ganti dengan AppID dan SecretKey akun IOPGPS kamu
const APPID = 'taufanmaulana1998';
const SECRET_KEY = '3enderayj4il1or3e93woezz1goqxhry';

function generateSignature(secretKey, time) {
  const firstHash = crypto.createHash('md5').update(secretKey).digest('hex');
  return crypto
    .createHash('md5')
    .update(firstHash + time)
    .digest('hex');
}

async function getAccessToken() {
  try {
    const time = Math.floor(Date.now() / 1000);
    const signature = generateSignature(SECRET_KEY, time);

    const response = await axios.post(
      'https://open.iopgps.com/api/auth',
      {
        appid: APPID,
        time: time,
        signature: signature,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    console.log('Response:', response.data);

    if (response.data.code === 0 && response.data.accessToken) {
      console.log('Access Token:', response.data.accessToken);
    } else {
      console.error(
        'Authentication failed:',
        response.data.message || response.data.result,
      );
    }
  } catch (error) {
    console.error(
      'Error requesting token:',
      error.response?.data || error.message,
    );
  }
}

getAccessToken();
