const express = require('express');
const router = express.Router();
const { createInvoice, checkPaymentStatus, pool } = require('../services/paymentService');
const { sendPdfEmail } = require('../services/emailService');
const winston = require('winston');
const multer = require('multer');

// Configure multer to store files temporarily in /tmp
const upload = multer({ dest: '/tmp' });

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

router.post('/send-pdf', upload.fields([{ name: 'pdf', maxCount: 1 }]), async (req, res) => {
  try {
    const { email } = req.body;
    logger.info({ message: 'Received send-pdf request', email });

    if (!email) {
      logger.warn({ message: 'Email is required for sending PDF', method: req.method, path: req.path });
      return res.status(400).json({ error: 'Email is required' });
    }

    const pdfFile = req.files?.pdf?.[0];
    if (!pdfFile) {
      logger.warn({ message: 'PDF file is required for sending', method: req.method, path: req.path });
      return res.status(400).json({ error: 'PDF file is required' });
    }

    const pdfPath = pdfFile.path;

    const result = await sendPdfEmail(email, pdfPath);
    logger.info({ message: 'PDF email sent successfully', email, result });

    res.status(200).json({ message: 'PDF email sent successfully', result });
  } catch (err) {
    logger.error({
      message: 'Failed to send PDF email',
      error: err.message,
      stack: err.stack,
      method: req.method,
      path: req.path
    });
    res.status(500).json({ error: 'Failed to send PDF email', details: err.message });
  }
});

module.exports = router;
