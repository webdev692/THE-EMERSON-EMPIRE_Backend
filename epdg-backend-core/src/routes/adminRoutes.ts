import { Router } from 'express';
import { authMiddleware, roleGuard, superAdminGuard } from '../middlewares/auth';
import * as AdminController from '../controllers/AdminController';
import * as ApplicationController from '../controllers/ApplicationController';
import * as CertificateController from '../controllers/CertificateController';

const router = Router();

// All admin routes require a valid JWT + admin role
router.use(authMiddleware);
router.use(roleGuard('admin'));

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Admin management endpoints
 */

/**
 * @swagger
 * /api/admin/stats:
 *   get:
 *     summary: Get platform statistics for admin dashboard
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Stats object
 */
router.get('/stats', AdminController.getStats);

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: List all users with optional filters
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [admin, company, intern, school] }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, approved, rejected, unverified] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Array of users
 */
router.get('/users', AdminController.getUsers);

/**
 * @swagger
 * /api/admin/users:
 *   post:
 *     summary: Manually create a user
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.post('/users', AdminController.createUser);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   patch:
 *     summary: Approve or reject a user
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [approved, rejected]
 *               rejection_reason:
 *                 type: string
 *               department:
 *                 type: string
 *               mentor:
 *                 type: string
 */
router.patch('/users/:id', AdminController.updateUser);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   delete:
 *     summary: Soft-delete a user
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/users/:id', superAdminGuard, AdminController.deleteUser);
router.patch('/users/:id/role', superAdminGuard, AdminController.promoteUser);

// CV analysis + internship recommendations for a specific intern
router.get('/users/:id/cv-analysis', AdminController.getCvAnalysis);

// Mentors — admins with is_mentor = true
router.get('/mentors',                          AdminController.getMentors);
router.post('/mentors',                         AdminController.createMentor);
router.patch('/mentors/:id/reset-password',     AdminController.resetMentorPassword);
router.delete('/mentors/:id', superAdminGuard,  AdminController.deactivateMentor);

// Internship slots — admin CRUD
router.get('/slots',        AdminController.getSlots);
router.post('/slots',       AdminController.createSlot);
router.patch('/slots/:id',  AdminController.updateSlot);
router.delete('/slots/:id', superAdminGuard, AdminController.deleteSlot);

// Applications — view all with extracted CV skills
router.get('/applications', ApplicationController.getAllApplications);

// Certificates
router.get('/certificates',                   CertificateController.list);
router.post('/certificates',                  CertificateController.issue);
router.patch('/certificates/:id/revoke', superAdminGuard, CertificateController.revoke);
router.get('/certificate-templates',          CertificateController.listTemplates);

// Placements
router.get('/placements',                   AdminController.listPlacements);
router.get('/placements/placeable-interns', AdminController.getPlaceableInterns);
router.post('/placements',                  AdminController.createPlacement);
router.patch('/placements/:id/end',         AdminController.endPlacement);

// Announcements
router.get('/announcements',  AdminController.listAnnouncements);
router.post('/announcements', AdminController.createAnnouncement);

// Gamification
router.get('/gamification/leaderboard',         AdminController.getLeaderboard);
router.get('/gamification/audit',               AdminController.getGamificationAudit);
router.get('/gamification/badges',              AdminController.listBadges);
router.post('/gamification/adjust',             AdminController.adjustPoints);
router.post('/gamification/badges/:id/award',   AdminController.awardBadge);

// Cohort analytics
router.get('/cohort-analytics', AdminController.getCohortAnalytics);

// Resources
router.get('/resources',          AdminController.listResources);
router.post('/resources',         AdminController.createResource);
router.patch('/resources/:id',    AdminController.updateResource);
router.delete('/resources/:id', superAdminGuard, AdminController.deleteResource);

// Feedback
router.get('/feedback',        AdminController.listFeedback);
router.post('/feedback',       AdminController.createFeedback);
router.patch('/feedback/:id',  AdminController.updateFeedback);

// Platform settings — read open to all admins, write requires super admin
router.get('/settings',   AdminController.getSettings);
router.patch('/settings', superAdminGuard, AdminController.updateSettings);

// Audit log
router.get('/audit-log', AdminController.getAuditLog);

// Opportunities (gigs / jobs)
router.get('/opportunities',                         AdminController.listOpportunities);
router.post('/opportunities',                        AdminController.createOpportunity);
router.patch('/opportunities/:id',                   AdminController.updateOpportunity);
router.get('/opportunities/applications',            AdminController.listOpportunityApplications);
router.patch('/opportunities/applications/:id',      AdminController.reviewOpportunityApplication);

// Roadmap admin — sign-off and level-up approval
router.get('/roadmap/pending-level-ups',             AdminController.listPendingLevelUps);
router.patch('/roadmap/level-up',                    AdminController.approveInternLevelUp);
router.patch('/roadmap/modules/:moduleId/sign-off',  AdminController.signOffModule);

export default router;
