const axios = require('axios');
const mysql = require('mysql2/promise');
const { getAuthToken } = require('./utils');
const winston = require('winston');

const paymentLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.File({ filename: 'logs/payment-errors.log' }),
    new winston.transports.Console() // Add console for real-time output
  ],
});

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 10,
});

const payments = new Map();
const invoiceToPaymentMap = new Map();

const createInvoice = async (promoCode, email) => {
  try {
    paymentLogger.info('Starting invoice creation', { promoCode, email });
    const token = await getAuthToken();
    const baseAmount = 1500;
    let discount = 0;

    if (promoCode) {
      discount = await validatePromoCode(promoCode);
    }

    const finalAmount = baseAmount - (baseAmount * discount / 100);
    paymentLogger.info('Calculated final amount', { baseAmount, discount, finalAmount });

    const invoiceResponse = await axios.post(
      'https://merchant.qpay.mn/v2/invoice',
      {
        invoice_code: 'ACADEMIA_MN_INVOICE',
        sender_invoice_no: Date.now().toString(),
        invoice_receiver_code: 'terminal',
        invoice_description: `academiacareer${promoCode ? ` (Promo: ${promoCode})` : ''}`,
        sender_branch_code: 'SALBARACADEMIA',
        amount: finalAmount,
        callback_url: `${process.env.SERVER_URL}/api/payment-callback`,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    ).catch(err => {
      // Enhanced axios error handling
      const errorDetails = {
        message: 'Failed to create invoice with QPay',
        error: err.message,
        axiosDetails: {
          url: err.config?.url,
          method: err.config?.method,
          status: err.response?.status,
          statusText: err.response?.statusText,
          data: err.response?.data
        }
      };
      paymentLogger.error(errorDetails);
      throw new Error(`Invoice creation failed: ${err.response?.data?.error || err.message}`);
    });

    const invoiceId = invoiceResponse.data.invoice_id;
    payments.set(invoiceId, { status: 'PENDING', details: null, verified: false, promoCode, email });
    paymentLogger.info('Invoice created', { invoiceId });
    return {
      ...invoiceResponse.data,
      originalAmount: baseAmount,
      discountApplied: baseAmount * discount / 100,
      finalAmount,
    };
  } catch (error) {
    paymentLogger.error('Invoice creation failed', { error: error.message });
    throw error; // Let the router handle the response
  }
};

const handlePaymentCallback = async (qpayPaymentId) => {
  try {
    const token = await getAuthToken();
    const paymentInfo = await axios.get(
      `https://merchant.qpay.mn/v2/payment/${qpayPaymentId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    ).catch(err => {
      const errorDetails = {
        message: 'Failed to fetch payment info from QPay',
        error: err.message,
        axiosDetails: {
          url: err.config?.url,
          method: err.config?.method,
          status: err.response?.status,
          statusText: err.response?.statusText,
          data: err.response?.data
        }
      };
      paymentLogger.error(errorDetails);
      throw new Error(`Payment info fetch failed: ${err.response?.data?.error || err.message}`);
    });

    const invoiceId = paymentInfo.data.object_id;
    payments.set(qpayPaymentId, {
      status: paymentInfo.data.payment_status,
      details: paymentInfo.data,
      verified: true,
    });
    invoiceToPaymentMap.set(invoiceId, qpayPaymentId);
    return paymentInfo.data;
  } catch (error) {
    paymentLogger.error('Callback processing failed', { error: error.message });
    throw error;
  }
};

const checkPaymentStatus = async (id) => {
  try {
    let payment = payments.get(id);
    let paymentId = id;

    if (invoiceToPaymentMap.has(id)) {
      paymentId = invoiceToPaymentMap.get(id);
      payment = payments.get(paymentId);
    }

    if (!payment || !payment.verified) {
      const token = await getAuthToken();
      const checkResponse = await axios.post(
        'https://merchant.qpay.mn/v2/payment/check',
        {
          object_type: 'INVOICE',
          object_id: id,
          offset: { page_number: 1, page_limit: 100 },
        },
        {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        }
      ).catch(err => {
        const errorDetails = {
          message: 'Failed to check payment status with QPay',
          error: err.message,
          axiosDetails: {
            url: err.config?.url,
            method: err.config?.method,
            status: err.response?.status,
            statusText: err.response?.statusText,
            data: err.response?.data
          }
        };
        paymentLogger.error(errorDetails);
        throw new Error(`Payment status check failed: ${err.response?.data?.error || err.message}`);
      });

      if (checkResponse.data.count > 0) {
        const paymentInfo = checkResponse.data.rows[0];
        paymentId = paymentInfo.payment_id;
        payments.set(paymentId, {
          status: paymentInfo.payment_status,
          details: paymentInfo,
          verified: true,
        });
        invoiceToPaymentMap.set(id, paymentId);
        payment = payments.get(paymentId);
      } else {
        payment = { status: 'PENDING', details: null };
      }
    }

    return payment || { status: 'PENDING', details: null };
  } catch (error) {
    paymentLogger.error('Payment status check failed', { error: error.message });
    throw error;
  }
};

const validatePromoCode = async (promoCode) => {
  try {
    paymentLogger.info('Validating promo code', { promoCode });
    const [rows] = await pool.execute(
      'SELECT discount_percentage FROM promo_codes WHERE promo_code = ? AND is_active = 1',
      [promoCode.toUpperCase()]
    );
    paymentLogger.info('Promo code query result', { rows });
    return rows.length > 0 ? rows[0].discount_percentage : 0;
  } catch (error) {
    paymentLogger.error('Promo code validation failed', { error: error.message });
    return 0;
  }
};

module.exports = { createInvoice, handlePaymentCallback, checkPaymentStatus, pool };