const fs = require('fs');
const dotenv = require('dotenv');

// Check if .env file exists
if (!fs.existsSync('.env')) {
  console.error('Error: .env file not found. Please create it based on .env.example.');
  process.exit(1);
}

// Load .env file
dotenv.config();

// List of required environment variables
const requiredVars = [
  'QPAY_USER',
  'QPAY_PASS',
  'PORT',
  'SERVER_URL',
  'BREVO_API_KEY',
  'BREVO_API_URL',
  'RECAPTCHA_SECRET_KEY',
  'DB_HOST',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME'
];

// Check for missing variables
const missingVars = requiredVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error(`Error: Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

console.log('Environment variables check passed.');
