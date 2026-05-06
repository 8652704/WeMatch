const express = require('express');
const Stripe  = require('stripe');
const { getDb } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const PLANS = {
  premium: { priceId: process.env.STRIPE_PREMIUM_PRICE_ID },
  elite:   { priceId: process.env.STRIPE_ELITE_PRICE_ID },
};
router.get('/status', requireAuth, (req, res) => {
  const user = getDb().prepare('SELECT plan, subscription_status, plan_expires_at FROM users WHERE id = ?').get(req.user.id);
  res.json({ plan: user.plan||'free', status: user.subscription_status||'inactive', expires_at: user.plan_expires_at });
});
router.post('/create-checkout', requireAuth, async (req, res) => {
  const { plan } = req.body;
  if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan.' });
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  let customerId = user.stripe_customer_id;
  if (!customerId) {
    const c = await stripe.customers.create({ email: user.email, name: user.name, metadata: { wematch_user_id: user.id } });
    customerId = c.id;
    db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?').run(customerId, user.id);
  }
  const appUrl = process.env.APP_URL || 'https://wematch.dating';
  const session = await stripe.checkout.sessions.create({
    customer: customerId, mode: 'subscription', payment_method_types: ['card'],
    line_items: [{ price: PLANS[plan].priceId, quantity: 1 }],
    success_url: appUrl+'/?checkout=success&plan='+plan,
    cancel_url: appUrl+'/?checkout=cancelled',
    metadata: { wematch_user_id: user.id, plan },
    subscription_data: { metadata: { wematch_user_id: user.id, plan } },
  });
  res.json({ url: session.url });
});
router.post('/portal', requireAuth, async (req, res) => {
  const user = getDb().prepare('SELECT stripe_customer_id FROM users WHERE id = ?').get(req.user.id);
  if (!user.stripe_customer_id) return res.status(400).json({ error: 'No active subscription found.' });
  const session = await stripe.billingPortal.sessions.create({ customer: user.stripe_customer_id, return_url: process.env.APP_URL||'https://wematch.dating' });
  res.json({ url: session.url });
});
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  let event;
  try { event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET); }
  catch (err) { return res.status(400).json({ error: 'Webhook error: '+err.message }); }
  const db = getDb();
  const set = (cid,plan,sid,status,exp=null) => db.prepare("UPDATE users SET plan=?,subscription_id=?,subscription_status=?,plan_expires_at=?,updated_at=datetime('now') WHERE stripe_customer_id=?").run(plan,sid,status,exp,cid);
  if (event.type==='checkout.session.completed'&&event.data.object.mode==='subscription') set(event.data.object.customer,event.data.object.metadata?.plan||'premium',event.data.object.subscription,'active');
  else if (event.type==='customer.subscription.updated') { const s=event.data.object; set(s.customer,s.metadata?.plan||'premium',s.id,s.status==='active'?'active':s.status,s.current_period_end?new Date(s.current_period_end*1000).toISOString():null); }
  else if (event.type==='customer.subscription.deleted') set(event.data.object.customer,'free',null,'inactive');
  else if (event.type==='invoice.payment_failed') db.prepare("UPDATE users SET subscription_status='past_due' WHERE stripe_customer_id=?").run(event.data.object.customer);
  res.json({ received: true });
});
module.exports = router;
