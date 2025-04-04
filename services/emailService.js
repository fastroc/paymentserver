const fetch = require('node-fetch');
const fs = require('fs').promises;
const winston = require('winston');
require('dotenv').config();

const emailLogger = winston.createLogger({
  level: 'error',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.File({ filename: 'logs/email-errors.log' }),
    new winston.transports.Console() // Add console for real-time output
  ],
});

const sendPdfEmail = async (email, pdfPath) => {
  try {
    const pdfContent = (await fs.readFile(pdfPath)).toString('base64');
    const payload = {
      sender: { name: 'academia.mn', email: 'no-reply@academia.mn' },
      to: [{ email }],
      subject: 'Таны Мэргэжил сонголтын репорт',
      textContent: 'Хавсаргасан PDF document -ийг татаж авна уу!',
      attachment: [{ name: 'document.pdf', content: pdfContent }],
    };

    const response = await fetch(process.env.BREVO_API_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!response.ok) {
      const errorDetails = {
        message: 'Failed to send PDF email via Brevo',
        status: response.status,
        statusText: response.statusText,
        data: result
      };
      emailLogger.error(errorDetails);
      throw new Error(`Failed to send email: ${result.message || 'Unknown error'}`, { cause: errorDetails });
    }

    await fs.unlink(pdfPath);
    return 'Email sent: ' + result.messageId;
  } catch (error) {
    emailLogger.error('Error sending PDF email', { error: error.message, cause: error.cause });
    throw error;
  }
};

const sendContactEmail = async (name, email, message, recaptchaResponse) => {
  try {
    const verificationURL = `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${recaptchaResponse}`;
    const recaptchaResponseData = await fetch(verificationURL, { method: 'POST' });
    const recaptchaResult = await recaptchaResponseData.json();

    if (!recaptchaResult.success || recaptchaResult.score < 0.5) {
      const errorDetails = {
        message: 'reCAPTCHA verification failed',
        score: recaptchaResult.score || 'N/A',
        errors: recaptchaResult['error-codes']
      };
      emailLogger.error(errorDetails);
      throw new Error(`reCAPTCHA verification failed. Score: ${recaptchaResult.score || 'N/A'}`, { cause: errorDetails });
    }

    const payload = {
      sender: { name: 'academia.mn', email: 'no-reply@academia.mn' },
      to: [{ email: 'academia@aurag.mn' }],
      subject: `Шинэ мессеж: ${name}`,
      textContent: `Нэр: ${name}\nИ-мэйл: ${email}\nМессеж: ${message}\nreCAPTCHA Score: ${recaptchaResult.score}`,
    };

    const response = await fetch(process.env.BREVO_API_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!response.ok) {
      const errorDetails = {
        message: 'Failed to send contact email via Brevo',
        status: response.status,
        statusText: response.statusText,
        data: result
      };
      emailLogger.error(errorDetails);
      throw new Error(`Failed to send email: ${result.message || 'Unknown error'}`, { cause: errorDetails });
    }

    return 'Contact message sent: ' + result.messageId;
  } catch (error) {
    emailLogger.error('Error sending contact email', { error: error.message, cause: error.cause });
    throw error;
  }
};

module.exports = { sendPdfEmail, sendContactEmail };