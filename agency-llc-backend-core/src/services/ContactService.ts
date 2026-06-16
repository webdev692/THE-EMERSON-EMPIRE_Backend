import getPool from '../config/database';
import { ContactRequest, ContactRequestInput } from '../models/ContactRequest';

const pool = getPool();

export class ContactService {
  async create(data: ContactRequestInput): Promise<ContactRequest> {
    const result = await pool.query<ContactRequest>(
      `INSERT INTO public.contact_requests
        (first_name, last_name, email, service_interest, urgency, message, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        data.first_name,
        data.last_name,
        data.email,
        data.service_interest,
        data.urgency,
        data.message,
        'EA',
      ],
    );
    return result.rows[0];
  }
}
