const express = require('express');
const cors = require('cors'); // Add CORS
const winston = require('winston');
const apiRoutes = require('./routes/api');

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
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

const app = express();

// Add CORS middleware
app.use(cors({
  origin: ['http://localhost:3000', 'https://your-app.netlify.app'], // Replace with your Netlify URL after deployment
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Global error handler
app.use((err, req, res, next) => {
  // Enhanced error logging for axios errors
  const errorDetails = {
    message: err.message,
    stack: err.stack,
    method: req.method,
    path: req.path
  };

  // Check if the error is from an axios request
  if (err.isAxiosError) {
    errorDetails.axiosDetails = {
      url: err.config?.url,
      method: err.config?.method,
      status: err.response?.status,
      statusText: err.response?.statusText,
      data: err.response?.data
    };
  }

  logger.error(errorDetails);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.use('/api', apiRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

module.exports = { logger };