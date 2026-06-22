import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import * as CertService from '../services/CertificateService';
import { AdminService } from '../services/AdminService';

const adminService = new AdminService();

// POST /api/admin/certificates
export const issue = async (req: Request, res: Response) => {
  try {
    const adminUserId = (req as AuthRequest).user.id;
    const { intern_id, template_id, program_name, issue_date } = req.body;

    if (!intern_id) {
      res.status(400).json({ success: false, message: 'intern_id is required', errors: [] });
      return;
    }

    const cert = await CertService.issueCertificate({
      adminUserId,
      internId:    Number(intern_id),
      templateId:  template_id ? Number(template_id) : null,
      programName: program_name,
      issueDate:   issue_date,
    });

    await adminService.logAuditEvent(adminUserId, 'certificate.issue', 'certificate', cert.id, { intern_id });
    res.status(201).json({ success: true, data: cert });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// PATCH /api/admin/certificates/:id/revoke
export const revoke = async (req: Request, res: Response) => {
  try {
    const adminId = (req as AuthRequest).user.id;
    const cert = await CertService.revokeCertificate(req.params.id);
    await adminService.logAuditEvent(adminId, 'certificate.revoke', 'certificate', req.params.id);
    res.json({ success: true, data: cert });
  } catch (err: any) {
    const status = err.message === 'Certificate not found' ? 404 : 500;
    res.status(status).json({ success: false, message: err.message, errors: [] });
  }
};

// GET /api/admin/certificates
export const list = async (req: Request, res: Response) => {
  try {
    const { department, status } = req.query as Record<string, string>;
    const certs = await CertService.listCertificates({ department, status });
    res.json({ success: true, data: certs });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// GET /api/admin/certificate-templates
export const listTemplates = async (_req: Request, res: Response) => {
  try {
    const templates = await CertService.listTemplates();
    res.json({ success: true, data: templates });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// GET /api/verify/:certificateId  (PUBLIC — in separate route file)
export const verify = async (req: Request, res: Response) => {
  try {
    const result = await CertService.verifyCertificate(req.params.certificateId);
    if (!result) {
      res.status(404).json({ success: false, message: 'Certificate not found', errors: [] });
      return;
    }
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, message: 'Verification failed', errors: [] });
  }
};
