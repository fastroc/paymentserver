# API Documentation
## POST /api/create-invoice
- Body: { "promoCode": "string", "email": "string" }
- Response: { invoice_id, qr_image, qPay_shortUrl, originalAmount, discountApplied, finalAmount }