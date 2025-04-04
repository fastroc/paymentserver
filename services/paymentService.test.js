const { createInvoice } = require('./paymentService');
jest.mock('axios');

describe('Payment Service', () => {
    it('creates an invoice without promo code', async () => {
        const axios = require('axios');
        axios.post.mockResolvedValue({
            data: { invoice_id: '123', qr_image: 'base64data', qPay_shortUrl: 'url' },
        });

        const result = await createInvoice(null, 'test@example.com');
        expect(result.invoice_id).toBe('123');
        expect(result.finalAmount).toBe(1500);
    });
});