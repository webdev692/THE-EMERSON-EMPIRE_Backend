import { Request, Response } from 'express';
import { ContactService } from '../services/ContactService';

const contactService = new ContactService();

export const submitContact = async (req: Request, res: Response) => {
  try {
    const { first_name, last_name, email, service_interest, urgency, message } = req.body;

    if (!first_name || !last_name || !email || !service_interest || !urgency || !message) {
      res.status(400).json({ message: 'All fields are required' });
      return;
    }

    const contact = await contactService.create({
      first_name,
      last_name,
      email,
      service_interest,
      urgency,
      message,
    });

    res.status(201).json(contact);
  } catch (error: any) {
    if (error?.code === '23505') {
      res.status(409).json({ message: 'A contact request with this email already exists' });
      return;
    }
    res.status(500).json({ message: 'Error submitting contact request' });
  }
};
