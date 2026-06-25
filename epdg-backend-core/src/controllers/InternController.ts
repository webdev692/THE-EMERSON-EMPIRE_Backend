import { Request, Response } from 'express';
import path from 'path';
import { AuthRequest } from '../middlewares/auth';
import { InternService } from '../services/InternService';
import { OpportunityService } from '../services/OpportunityService';
import { RoadmapService } from '../services/RoadmapService';
import { getSupabase } from '../utils/supabaseClient';

const SUBMISSION_BUCKET = 'submissions';

const internService      = new InternService();
const opportunityService = new OpportunityService();
const roadmapService     = new RoadmapService();

// GET /api/intern/dashboard
export const getDashboard = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const data   = await internService.getDashboard(userId);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// GET /api/intern/profile
export const getProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const data   = await internService.getProfile(userId);
    res.json({ success: true, data });
  } catch (err: any) {
    const code = err.message === 'Profile not found' ? 404 : 500;
    res.status(code).json({ success: false, message: err.message, errors: [] });
  }
};

// PATCH /api/intern/profile
export const updateProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const data   = await internService.updateProfile(userId, req.body);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// GET /api/onboarding  (accessible from Dashboard route)
export const getOnboarding = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const steps  = await internService.getOnboardingSteps(userId);
    res.json(steps);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// PATCH /api/onboarding/:stepId/complete
export const completeOnboardingStep = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const stepId = Number(req.params.stepId);

    if (isNaN(stepId) || stepId < 1 || stepId > 6) {
      res.status(400).json({ success: false, message: 'Invalid step ID (1–6).', errors: [] });
      return;
    }

    const steps = await internService.completeOnboardingStep(userId, stepId);
    res.json(steps);
  } catch (err: any) {
    const code = err.message?.includes('not the current step') ? 400 : 500;
    res.status(code).json({ success: false, message: err.message, errors: [] });
  }
};

// ── Onboarding flow (new) ─────────────────────────────────────────────────

// GET /api/intern/onboarding/status
export const getOnboardingStatus = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const data   = await internService.getOnboardingStatus(userId);
    res.json({ success: true, data });
  } catch (err: any) {
    const code = err.message === 'Profile not found' ? 404 : 500;
    res.status(code).json({ success: false, message: err.message, errors: [] });
  }
};

// POST /api/intern/onboarding/sign-agreement
export const signAgreement = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const { type, agreement_text } = req.body;
    if (!type || !agreement_text) {
      res.status(400).json({ success: false, message: 'type and agreement_text are required', errors: [] });
      return;
    }
    if (!['nda', 'disclaimer'].includes(type)) {
      res.status(400).json({ success: false, message: 'type must be nda or disclaimer', errors: [] });
      return;
    }
    const data = await internService.signAgreement(userId, {
      type,
      agreementText: agreement_text,
      ipAddress:     req.ip,
      userAgent:     req.headers['user-agent'],
    });
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// POST /api/intern/onboarding/confirm-track
export const confirmTrack = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const { track } = req.body;
    if (!track) {
      res.status(400).json({ success: false, message: 'track is required', errors: [] });
      return;
    }
    const VALID_TRACKS = ['Web Design', 'Sales', 'Social Media', 'Digital Marketing'];
    if (!VALID_TRACKS.includes(track)) {
      res.status(400).json({ success: false, message: 'Invalid track. Choose: Web Design, Sales, Social Media, or Digital Marketing', errors: [] });
      return;
    }
    const data = await internService.confirmTrack(userId, track);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// POST /api/intern/onboarding/submit-discovery
export const submitDiscovery = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const { problem } = req.body;
    if (!problem || String(problem).trim().length < 20) {
      res.status(400).json({ success: false, message: 'A problem description of at least 20 characters is required', errors: [] });
      return;
    }
    const data = await internService.submitDiscovery(userId, String(problem).trim());
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// ── Tasks ──────────────────────────────────────────────────────────────────

export const getTasks = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const data = await internService.getTasks(userId);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

export const updateTaskStatus = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const taskId = Number(req.params.id);
    const { status } = req.body;
    if (!status) {
      res.status(400).json({ success: false, message: 'status is required', errors: [] });
      return;
    }
    const data = await internService.updateTaskStatus(userId, taskId, status);
    res.json({ success: true, data });
  } catch (err: any) {
    const code = err.message.includes('not found') ? 404 : err.message.includes('Invalid') ? 400 : 500;
    res.status(code).json({ success: false, message: err.message, errors: [] });
  }
};

// ── Submissions ────────────────────────────────────────────────────────────

export const getSubmissions = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const data = await internService.getSubmissions(userId);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

export const createSubmission = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const { task_id, file_url, file_name, file_size_kb, notes } = req.body;
    if (!task_id || !file_url) {
      res.status(400).json({ success: false, message: 'task_id and file_url are required', errors: [] });
      return;
    }
    const data = await internService.createSubmission(userId, {
      taskId:     Number(task_id),
      fileUrl:    file_url,
      fileName:   file_name,
      fileSizeKb: file_size_kb ? Number(file_size_kb) : undefined,
      notes,
    });
    res.status(201).json({ success: true, data });
  } catch (err: any) {
    const code = err.message.includes('not found') ? 404 : 500;
    res.status(code).json({ success: false, message: err.message, errors: [] });
  }
};

export const resubmit = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const submissionId = Number(req.params.id);
    const { file_url, file_name, file_size_kb, notes } = req.body;
    if (!file_url) {
      res.status(400).json({ success: false, message: 'file_url is required', errors: [] });
      return;
    }
    const data = await internService.resubmit(userId, submissionId, {
      fileUrl: file_url, fileName: file_name, fileSizeKb: file_size_kb, notes,
    });
    res.json({ success: true, data });
  } catch (err: any) {
    const code = err.message.includes('not found') ? 404 : 500;
    res.status(code).json({ success: false, message: err.message, errors: [] });
  }
};

// ── Leaderboard ────────────────────────────────────────────────────────────

export const getLeaderboard = async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as 'week' | 'alltime') || 'alltime';
    const data = await internService.getLeaderboard(period);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

export const getMyRank = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const period = (req.query.period as 'week' | 'alltime') || 'alltime';
    const data = await internService.getMyRank(userId, period);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

export const getBadges = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const data = await internService.getBadges(userId);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// ── Feedback ───────────────────────────────────────────────────────────────

export const submitFeedback = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const { type, rating, comment, name } = req.body;
    if (!type || !comment) {
      res.status(400).json({ success: false, message: 'type and comment are required', errors: [] });
      return;
    }
    const data = await internService.submitFeedback(userId, { type, rating: Number(rating) || 5, comment, name: name || 'Intern' });
    res.status(201).json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

export const getReceivedFeedback = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const data = await internService.getReceivedFeedback(userId);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// ── Roadmap ────────────────────────────────────────────────────────────────

export const getRoadmap = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const data   = await roadmapService.getRoadmap(userId);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// POST /api/intern/roadmap/modules/:id/complete
export const completeModule = async (req: Request, res: Response) => {
  try {
    const userId     = (req as AuthRequest).user.id;
    const moduleId   = Number(req.params.id);
    const { artifact_url } = req.body;

    if (!moduleId) {
      res.status(400).json({ success: false, message: 'module id is required', errors: [] });
      return;
    }
    const data = await roadmapService.completeModule(userId, moduleId, artifact_url);
    res.status(201).json({ success: true, data });
  } catch (err: any) {
    const code = err.message.includes('not found') ? 404
               : err.message.includes('not enrolled') ? 403
               : err.message.includes('previous module') ? 400
               : err.message.includes('belongs to the') ? 400
               : 500;
    res.status(code).json({ success: false, message: err.message, errors: [] });
  }
};

// POST /api/intern/roadmap/request-level-up
export const requestLevelUp = async (req: Request, res: Response) => {
  try {
    const userId  = (req as AuthRequest).user.id;
    const { track_id } = req.body;

    if (!track_id) {
      res.status(400).json({ success: false, message: 'track_id is required', errors: [] });
      return;
    }
    const data = await roadmapService.requestLevelUp(userId, Number(track_id));
    res.json({ success: true, data });
  } catch (err: any) {
    const code = err.message.includes('not enrolled') ? 403
               : err.message.includes('highest level') ? 400
               : err.message.includes('already pending') ? 409
               : err.message.includes('remaining') ? 400
               : 500;
    res.status(code).json({ success: false, message: err.message, errors: [] });
  }
};

// ── Mentor & Sessions ──────────────────────────────────────────────────────

export const getMentor = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const data = await internService.getMentor(userId);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

export const getMentorSessions = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const data = await internService.getMentorSessions(userId);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

export const requestMentorSession = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const { date, time, notes } = req.body;
    if (!date || !time) {
      res.status(400).json({ success: false, message: 'date and time are required', errors: [] });
      return;
    }
    const scheduledAt = `${date}T${time}:00`;
    const data = await internService.requestMentorSession(userId, { scheduledAt, notes });
    res.status(201).json({ success: true, data });
  } catch (err: any) {
    const code = err.message.includes('No active') || err.message.includes('No mentor') ? 400 : 500;
    res.status(code).json({ success: false, message: err.message, errors: [] });
  }
};

export const rateMentorSession = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const sessionId = Number(req.params.id);
    const { rating, notes } = req.body;
    if (!rating) {
      res.status(400).json({ success: false, message: 'rating is required', errors: [] });
      return;
    }
    const data = await internService.rateMentorSession(userId, sessionId, Number(rating), notes);
    res.json({ success: true, data });
  } catch (err: any) {
    const code = err.message.includes('not found') ? 404 : 500;
    res.status(code).json({ success: false, message: err.message, errors: [] });
  }
};

// ── Progress ───────────────────────────────────────────────────────────────

export const getProgressStats = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const data = await internService.getProgressStats(userId);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

export const getSkills = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const data = await internService.getSkills(userId);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// ── File Upload ────────────────────────────────────────────────────────────

export const uploadSubmissionFile = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'No file uploaded.' });
      return;
    }
    const { buffer, originalname, mimetype } = req.file;
    const ext     = path.extname(originalname).toLowerCase();
    const allowed = ['.pdf', '.zip', '.png', '.jpg', '.jpeg', '.docx'];
    if (!allowed.includes(ext)) {
      res.status(400).json({ success: false, message: 'File type not allowed.' });
      return;
    }

    const supabase = getSupabase();
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const filePath = `intern-submissions/${fileName}`;

    await supabase.storage.createBucket(SUBMISSION_BUCKET, {
      public: true,
      fileSizeLimit: 20 * 1024 * 1024,
    }).catch(() => { /* bucket already exists */ });

    const { error: uploadErr } = await supabase.storage
      .from(SUBMISSION_BUCKET)
      .upload(filePath, buffer, { contentType: mimetype, upsert: false });
    if (uploadErr) throw uploadErr;

    const { data } = supabase.storage.from(SUBMISSION_BUCKET).getPublicUrl(filePath);

    res.json({
      success: true,
      url:     data.publicUrl,
      name:    originalname,
      sizeKb:  Math.ceil(buffer.length / 1024),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Upload failed.' });
  }
};

// ─── Opportunities (gigs / jobs) ─────────────────────────────────────────────

// GET /api/intern/opportunities?type=gig|job
export const getOpportunities = async (req: Request, res: Response) => {
  try {
    const type = req.query.type as 'gig' | 'job' | undefined;
    const data = await opportunityService.getOpportunities(type);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// POST /api/intern/opportunities/:id/apply
export const applyToOpportunity = async (req: Request, res: Response) => {
  try {
    const userId        = (req as AuthRequest).user.id;
    const opportunityId = Number(req.params.id);
    const { cover_letter } = req.body;

    if (!opportunityId) {
      res.status(400).json({ success: false, message: 'opportunity id is required.', errors: [] });
      return;
    }

    const data = await opportunityService.apply(userId, opportunityId, cover_letter);
    res.status(201).json({ success: true, data });
  } catch (err: any) {
    const code = err.message?.includes('already applied') ? 409
               : err.message?.includes('not found')      ? 404
               : 500;
    res.status(code).json({ success: false, message: err.message, errors: [] });
  }
};

// GET /api/intern/opportunities/applications
export const getMyOpportunityApplications = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const data   = await opportunityService.getMyApplications(userId);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};
