const axios = require('axios');
require('dotenv').config();

let authToken = null;
let tokenExpiration = 0;

const getAuthToken = async () => {
  const now = Math.floor(Date.now() / 1000);
  if (authToken && now < tokenExpiration) return authToken;

  try {
    const response = await axios.post(
      'https://merchant.qpay.mn/v2/auth/token',
      {},
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${process.env.QPAY_USER}:${process.env.QPAY_PASS}`).toString('base64')}`,
        },
      }
    ).catch(err => {
      const errorDetails = {
        message: 'Failed to authenticate with QPay',
        error: err.message,
        axiosDetails: {
          url: err.config?.url,
          method: err.config?.method,
          status: err.response?.status,
          statusText: err.response?.statusText,
          data: err.response?.data
        }
      };
      throw new Error(`Authentication failed: ${err.response?.data?.error || err.message}`, { cause: errorDetails });
    });

    authToken = response.data.access_token;
    tokenExpiration = now + response.data.expires_in - 60;
    return authToken;
  } catch (error) {
    throw error; // Let the caller handle the error
  }
};

module.exports = { getAuthToken };