const express = require('express');
const router = express.Router();
const { createInvoice } = require('../services/paymentService');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/payment-errors.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/payment-combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({ format: winston.format.simple() }));
}

router.post('/create-invoice', async (req, res) => {
  try {
    const { promoCode, email } = req.body;
    if (!email) {
      logger.warn({ message: 'Email is required for invoice creation', method: req.method, path: req.path });
      return res.status(400).json({ error: 'Email is required' });
    }

    logger.info({ message: 'Starting invoice creation', promoCode, email });
    const invoice = await createInvoice(promoCode, email);
    logger.info({ message: 'Invoice created', invoiceId: invoice.invoice_id });

    res.json(invoice);
  } catch (err) {
    logger.error({
      message: 'Invoice creation failed',
      error: err.message,
      stack: err.stack,
      method: req.method,
      path: req.path,
      axiosDetails: err.isAxiosError ? {
        url: err.config?.url,
        method: err.config?.method,
        status: err.response?.status,
        statusText: err.response?.statusText,
        data: err.response?.data
      } : undefined
    });
    res.status(500).json({ error: 'Failed to create invoice', details: err.message });
  }
});
const { pool } = require('../services/paymentService');

router.get('/health', async (req, res) => {
  try {
    // Test database connection
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'OK', message: 'Server and database are healthy' });
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(500).json({ status: 'ERROR', message: 'Server or database issue' });
  }
});

router.get('/payment-status/:invoiceId', async (req, res) => {
  try {
    const { invoiceId } = req.params;
    logger.info({ message: 'Checking payment status', invoiceId });
    const payment = await checkPaymentStatus(invoiceId);
    logger.info({ message: 'Payment status retrieved', invoiceId, status: payment.status });
    res.json(payment);
  } catch (err) {
    logger.error({
      message: 'Payment status check failed',
      error: err.message,
      stack: err.stack,
      method: req.method,
      path: req.path,
      axiosDetails: err.isAxiosError ? {
        url: err.config?.url,
        method: err.config?.method,
        status: err.response?.status,
        statusText: err.response?.statusText,
        data: err.response?.data
      } : undefined
    });
    res.status(500).json({ error: 'Payment verification failed', details: err.message });
  }
});

module.exports = router;
