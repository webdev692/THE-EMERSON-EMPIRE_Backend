import { Router } from 'express';
import { submitContact } from '../controllers/ContactController';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     ContactRequest:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: Auto-generated UUID
 *         first_name:
 *           type: string
 *           description: Contact's first name
 *         last_name:
 *           type: string
 *           description: Contact's last name
 *         email:
 *           type: string
 *           format: email
 *           description: Contact's email address
 *         service_interest:
 *           type: string
 *           description: Service the contact is interested in
 *         urgency:
 *           type: integer
 *           description: Urgency level (1-5)
 *         message:
 *           type: string
 *           description: Contact message
 *         source:
 *           type: string
 *           description: Source of the contact request
 *         status:
 *           type: string
 *           description: Current status of the request
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: Auto-generated timestamp
 *       example:
 *         id: "d290f1ee-6c54-4b01-90e6-d701748f0851"
 *         first_name: John
 *         last_name: Doe
 *         email: john@example.com
 *         service_interest: Web Development
 *         urgency: 3
 *         message: I'd like to discuss a new project
 *         source: EA
 *         status: new
 *         created_at: 2024-01-01T00:00:00.000Z
 */

/**
 * @swagger
 * tags:
 *   name: Contact
 *   description: Contact form submission endpoint
 */

/**
 * @swagger
 * /api/contact:
 *   post:
 *     summary: Submit a contact request
 *     tags: [Contact]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - first_name
 *               - last_name
 *               - email
 *               - service_interest
 *               - urgency
 *               - message
 *             properties:
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               service_interest:
 *                 type: string
 *               urgency:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               message:
 *                 type: string
 *           example:
 *             first_name: John
 *             last_name: Doe
 *             email: john@example.com
 *             service_interest: Web Development
 *             urgency: 3
 *             message: I'd like to discuss a new project
 *     responses:
 *       201:
 *         description: Contact request created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ContactRequest'
 *       400:
 *         description: All fields are required
 *       409:
 *         description: A contact request with this email already exists
 *       500:
 *         description: Server error
 */

router.post('/', submitContact);

export default router;
