const Razorpay = require('razorpay');
const crypto = require('crypto');

class RazorpayHandler {
  constructor() {
    if (RazorpayHandler.instance !== undefined) {
      return RazorpayHandler.instance;
    }
    this.razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
    RazorpayHandler.instance = this;
    return RazorpayHandler.instance;
  }

  static getInstance() {
    return new RazorpayHandler();
  }

  /**
   * Generates a payment link
   */
  async orderSession(params) {
    const amountInPaise = Math.round(parseFloat(params.amount) * 100);

    const paymentLinkRequest = {
      amount: amountInPaise,
      currency: "INR",
      accept_partial: false,
      reference_id: params.order_id,
      description: "Booking Payment",
      customer: {
        name: params.customer_id || "Customer",
        contact: params.customer_phone === "9999999999" || params.customer_phone === "+919999999999" ? "+919876543210" : (params.customer_phone || "+919876543210"),
        email: params.customer_email || "test@example.com"
      },
      notify: {
        sms: false,
        email: false
      },
      reminder_enable: false,
      callback_url: params.return_url,
      callback_method: "get"
    };

    try {
      const response = await this.razorpay.paymentLink.create(paymentLinkRequest);
      return {
        payment_links: {
          web: response.short_url,
          mobile: response.short_url
        },
        id: response.id
      };
    } catch (error) {
      console.error("Razorpay Error:", error);
      throw error;
    }
  }

  validateSignature(razorpay_payment_id, razorpay_payment_link_id, razorpay_payment_link_reference_id, razorpay_payment_link_status, razorpay_signature) {
     const secret = process.env.RAZORPAY_KEY_SECRET;
     
     const payload = `${razorpay_payment_link_id}|${razorpay_payment_link_reference_id}|${razorpay_payment_link_status}|${razorpay_payment_id}`;
     
     const generated_signature = crypto
         .createHmac('sha256', secret)
         .update(payload)
         .digest('hex');
         
     return generated_signature === razorpay_signature;
  }
}

module.exports = {
  RazorpayHandler
};
