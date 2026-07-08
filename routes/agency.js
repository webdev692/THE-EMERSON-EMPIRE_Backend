const express = require('express');
const db = require('../db');
const { cleanString, requireFields, isValidEmail, moduleEnabled } = require('./utils');

const router = express.Router();

router.post('/booking-inquiries', async (req, res, next) => {
  if (!moduleEnabled('AGENCY_MODULE_ENABLED')) {
    return res.status(503).json({ success: false, error: 'Agency module is currently disabled.' });
  }

  try {
    const errors = requireFields(req.body, ['firstName', 'lastName', 'email', 'requestedService']);

    if (!isValidEmail(req.body.email)) {
      errors.push('email must be a valid email address');
    }

    if (req.body.acknowledgementAccepted !== true) {
      errors.push('acknowledgementAccepted must be true');
    }

    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const firstName = cleanString(req.body.firstName);
    const lastName = cleanString(req.body.lastName);
    const email = cleanString(req.body.email).toLowerCase();
    const phone = cleanString(req.body.phone);
    const preferredContactMethod = cleanString(req.body.preferredContactMethod) || 'email';
    const requestedService = cleanString(req.body.requestedService);
    const preferredDate = cleanString(req.body.preferredDate);
    const preferredTimeWindow = cleanString(req.body.preferredTimeWindow);
    const message = cleanString(req.body.message);

    const clientResult = await db.query(
      `insert into agency.clients
        (first_name, last_name, email, phone, preferred_contact_method, client_type, status)
       values ($1, $2, $3, $4, $5, 'individual', 'prospect')
       returning id`,
      [firstName, lastName, email, phone, preferredContactMethod]
    );

    const clientId = clientResult.rows[0].id;

    const inquiryResult = await db.query(
      `insert into agency.booking_inquiries
        (client_id, inquiry_source, requested_service, preferred_date, preferred_time_window, message, status)
       values ($1, 'website', $2, $3, $4, $5, 'new')
       returning id, status, created_at`,
      [clientId, requestedService, preferredDate || null, preferredTimeWindow || null, message || null]
    );

    await db.query(
      `insert into agency.compliance_acknowledgements
        (client_id, acknowledgement_type, version, accepted, accepted_at, ip_address, user_agent)
       values ($1, 'agency_booking_disclaimer', 'v1', true, now(), $2, $3)`,
      [clientId, req.ip || null, req.headers['user-agent'] || null]
    );

    return res.status(201).json({
      success: true,
      inquiry: inquiryResult.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
