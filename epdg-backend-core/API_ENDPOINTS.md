# API Endpoints — What the Frontend Needs, and Why

Complete index of every real (non-dead-code) endpoint this backend exposes, grouped by area, with the reasoning behind each group. For full request/response bodies, error shapes, JWT usage, rate limits, and CORS for the auth endpoints specifically, see **`FRONTEND_CONTRACT.md`** — this document is the map of *what exists and why*; that one is the detailed *how to call it*.

All paths below are relative to `{API_BASE}/api`. Auth requirement is noted per section; `Bearer <token>` header required unless marked **public**.

---

## 1. Auth — `/api/auth/*` (public + authenticated mix)

Covered in full in `FRONTEND_CONTRACT.md`. Summary: `register`, `login`, `refresh`, `verify-email`, `resend-verification`, `forgot-password`, `reset-password`, `me`, `change-password`, `logout`. **Why**: every other endpoint in this document depends on the JWT this group issues — nothing else works without it.

---

## 2. Admin — `/api/admin/*` (requires `role=admin`; routes marked ⚡ additionally require `admin_role=super_admin`)

This is the operator console for the whole program — companies, schools, and interns all pass through admin approval and oversight at some point, and admins run the day-to-day of the internship pipeline.

### 2.1 Dashboard
| Method | Path | Why |
|---|---|---|
| GET | `/stats` | Landing dashboard numbers (counts of companies/schools/interns, active placements, pending approvals) — what an admin sees first on login. |

### 2.2 User management
| Method | Path | Why |
|---|---|---|
| GET | `/users` | List/search all platform users for approval or account management screens. |
| POST | `/users` | Admin creates an account directly (any role) — used when onboarding someone outside the public self-registration flow (e.g. a company added manually). Temp password emailed to them. |
| PATCH | `/users/:id` | Edit a user's core fields, and the approve/reject workflow for pending company/school/intern applications lives here. |
| DELETE ⚡ | `/users/:id` | Remove a user — gated to super_admin since it's destructive. |
| PATCH ⚡ | `/users/:id/role` | Promote/demote an admin's `admin_role` (admin ⇄ super_admin). This is the endpoint behind the promote/demote flow we verified end-to-end. |
| GET | `/users/:id/cv-analysis` | Pulls the extracted-skills/CV-parse result for a given intern applicant — feeds an admin's "why did this applicant match" view. |

### 2.3 Mentors
| Method | Path | Why |
|---|---|---|
| GET | `/mentors` | List mentors and their current intern load, for assigning interns to a mentor with capacity. |
| POST | `/mentors` | Create a mentor account directly (separate flow from generic user creation — sets department/capacity/mentor flags in one step). |
| PATCH | `/mentors/:id/reset-password` | Admin-initiated password reset for a mentor who's locked out. |
| DELETE ⚡ | `/mentors/:id` | Deactivate a mentor. |

### 2.4 Internship slots
| Method | Path | Why |
|---|---|---|
| GET | `/slots` | List all posted internship slots across all companies, for admin oversight/moderation. |
| POST | `/slots` | Admin can post a slot on a company's behalf (companies aren't required to self-post). |
| PATCH | `/slots/:id` | Edit/close a slot. |
| DELETE ⚡ | `/slots/:id` | Remove a slot. |

### 2.5 Applications
| Method | Path | Why |
|---|---|---|
| GET | `/applications` | All applications across all slots — the review queue admins work through to shortlist/accept/reject interns into placements. |

### 2.6 Certificates
| Method | Path | Why |
|---|---|---|
| GET | `/certificates` | List issued certificates. |
| POST | `/certificates` | Issue a certificate to a completing intern — generates the PDF + QR code and stores it. |
| PATCH ⚡ | `/certificates/:id/revoke` | Revoke a previously issued certificate. |
| GET | `/certificate-templates` | List available certificate templates (background/field layout) to choose from when issuing. |

### 2.7 Placements
| Method | Path | Why |
|---|---|---|
| GET | `/placements` | List active/past placements — the actual "who's interning where" record. |
| GET | `/placements/placeable-interns` | Interns who are approved and slot-matched but not yet placed — the pool an admin picks from. |
| POST | `/placements` | Formally place an accepted intern into a slot, starting their placement. |
| PATCH | `/placements/:id/end` | End a placement (completion or early termination). |

### 2.8 Announcements
| Method | Path | Why |
|---|---|---|
| GET | `/announcements` | List announcements sent to users (see the announcements screen). |
| POST | `/announcements` | Broadcast an announcement to a role segment (all/intern/company/school/admin). |

### 2.9 Gamification
| Method | Path | Why |
|---|---|---|
| GET | `/gamification/leaderboard` | Admin view of the points leaderboard (same data interns see, admin lens). |
| GET | `/gamification/audit` | Audit trail of every point/badge adjustment — accountability for manual point grants. |
| GET | `/gamification/badges` | List available badges to award. |
| POST | `/gamification/adjust` | Manually grant/deduct points for an intern (e.g. for something outside the automated point rules). |
| POST | `/gamification/badges/:id/award` | Award a specific badge to an intern. |

### 2.10 Cohort analytics
| Method | Path | Why |
|---|---|---|
| GET | `/cohort-analytics` | Aggregate stats across an intern cohort (completion rates, average points, etc.) — program-health reporting, not per-intern detail. |

### 2.11 Resources
| Method | Path | Why |
|---|---|---|
| GET | `/resources` | List the resource library (guides/links) shown to interns. |
| POST | `/resources` | Publish a new resource. |
| PATCH | `/resources/:id` | Edit/unpublish a resource. |
| DELETE ⚡ | `/resources/:id` | Remove a resource. |

### 2.12 Feedback
| Method | Path | Why |
|---|---|---|
| GET | `/feedback` | Admin inbox of feedback submitted by interns (and others). |
| POST | `/feedback` | Admin can also submit feedback (e.g. logging feedback given verbally). |
| PATCH | `/feedback/:id` | Update feedback status (new → reviewed, etc.). |

### 2.13 Platform settings
| Method | Path | Why |
|---|---|---|
| GET | `/settings` | Read platform-wide toggles (notifications enabled, open registration, etc.) for a settings screen. |
| PATCH ⚡ | `/settings` | Change those toggles — super_admin only since it affects the whole platform. |

### 2.14 Audit log
| Method | Path | Why |
|---|---|---|
| GET | `/audit-log` | Read-only trail of admin actions (who approved/rejected/promoted whom, when) — compliance/accountability view. |

### 2.15 Opportunities (gigs/jobs marketplace, separate from the core internship pipeline)
| Method | Path | Why |
|---|---|---|
| GET | `/opportunities` | Admin list/moderation of posted opportunities. |
| POST | `/opportunities` | Post a new opportunity. |
| PATCH | `/opportunities/:id` | Edit/close an opportunity. |
| GET | `/opportunities/applications` | Review applications submitted to opportunities. |
| PATCH | `/opportunities/applications/:id` | Approve/reject an opportunity application. |

### 2.16 Roadmap admin
| Method | Path | Why |
|---|---|---|
| GET | `/roadmap/pending-level-ups` | Queue of interns who've requested to level up on their learning track, awaiting admin approval (after mentor sign-off). |
| PATCH | `/roadmap/level-up` | Approve/reject a level-up request. |
| PATCH | `/roadmap/modules/:moduleId/sign-off` | Admin-side module sign-off (distinct from mentor sign-off — both gate progression). |

### 2.17 Career file admin
| Method | Path | Why |
|---|---|---|
| GET | `/career-analytics` | Cohort-wide career-file/readiness-score analytics. |
| GET | `/intern-search` | Search interns by skill/readiness for admin-side matching (e.g. "who's ready to be placed"). |

---

## 3. Mentor — `/api/mentor/*` (requires `role=admin`; mentors are admins with `admin_type=mentor` on their profile)

The mentor's own working view — narrower than full admin, scoped to the interns assigned to them.

| Method | Path | Why |
|---|---|---|
| GET | `/stats` | Mentor's own dashboard (how many interns assigned, capacity used). |
| GET | `/interns` | List of interns assigned to this specific mentor. |
| PATCH | `/interns/:userId/activate-roadmap` | Mentor kicks off an assigned intern's learning roadmap. |
| GET | `/career-file/:internProfileId` | Mentor's read view of an assigned intern's career file. |
| PATCH | `/career-file/:internProfileId/skills/:skillId/endorse` | Mentor endorses a specific skill on the intern's career file — social-proof signal that feeds the intern's readiness score. |
| PATCH | `/career-file/:internProfileId/approve-tier` | Mentor approves the intern's career-file tier — required before an intern's career file/passport can advance to the next readiness level. |

---

## 4. Intern — `/api/intern/*` (also mounted at `/api/onboarding/*`, identical routes; requires `role=intern`)

The intern's self-service surface — everything they see and do day to day.

### 4.1 Dashboard & profile
| Method | Path | Why |
|---|---|---|
| GET | `/dashboard` | Home screen: profile summary, stats, days remaining, tasks, announcements — everything in one call, verified live in Step 4. |
| GET | `/profile` | Full editable profile. |
| PATCH | `/profile` | Update profile fields (phone, links, photo, etc.). |

### 4.2 Onboarding
| Method | Path | Why |
|---|---|---|
| GET | `/onboarding/status` | Where the intern is in the onboarding flow — drives which onboarding screen to show. |
| POST | `/onboarding/sign-agreement` | Sign NDA/disclaimer — required step, writes an audit trail row. |
| POST | `/onboarding/confirm-track` | Confirm which learning track the intern is on. |
| POST | `/onboarding/submit-discovery` | Submit the discovery/intake questionnaire. |
| GET | `/onboarding` *(legacy)* | Older step-based onboarding view — kept for compatibility, prefer `/onboarding/status` for new UI. |
| PATCH | `/onboarding/:stepId/complete` *(legacy)* | Mark a legacy onboarding step complete. |

### 4.3 Slots & applications (the core internship pipeline, intern side)
| Method | Path | Why |
|---|---|---|
| GET | `/slots` | Browse open internship slots to apply to. |
| POST | `/apply` | Apply to a slot (parses/attaches CV, extracts skills). |
| GET | `/applications` | Track status of the intern's own applications. |

### 4.4 Opportunities (gigs/jobs marketplace, intern side)
| Method | Path | Why |
|---|---|---|
| GET | `/opportunities` | Browse posted opportunities — separate from the internship-slot pipeline above, this is the side gig/job board. |
| POST | `/opportunities/:id/apply` | Apply to one. |
| GET | `/opportunities/applications` | Track the intern's own opportunity applications. |

### 4.5 Tasks & submissions
| Method | Path | Why |
|---|---|---|
| GET | `/tasks` | Tasks assigned to the intern by their mentor/placement. |
| PATCH | `/tasks/:id` | Update a task's status. |
| GET | `/submissions` | List the intern's work submissions and their review status. |
| POST | `/submissions/upload` | Upload a file for a submission (multipart, 20MB limit). |
| POST | `/submissions` | Create a submission record. |
| PATCH | `/submissions/:id` | Resubmit after feedback/rejection. |

### 4.6 Gamification (intern side)
| Method | Path | Why |
|---|---|---|
| GET | `/leaderboard` | Full leaderboard — engagement/competition feature. |
| GET | `/leaderboard/me` | Just this intern's own rank — cheaper call for a "your rank: #4" widget. |
| GET | `/badges` | Badges this intern has earned. |

### 4.7 Feedback
| Method | Path | Why |
|---|---|---|
| POST | `/feedback` | Intern submits feedback (about the program, a mentor, etc.). |
| GET | `/feedback/received` | Feedback given *to* this intern (e.g. from a mentor). |

### 4.8 Roadmap (learning track progression)
| Method | Path | Why |
|---|---|---|
| GET | `/roadmap` | Current roadmap state — modules, level, completion. |
| POST | `/roadmap/modules/:id/complete` | Mark a module complete. |
| POST | `/roadmap/request-level-up` | Request to advance a level — enters the mentor-sign-off → admin-approval pipeline (see admin section 2.16 and mentor section 3). |

### 4.9 Mentors & sessions
| Method | Path | Why |
|---|---|---|
| GET | `/mentors-directory` | Browse all mentors (not just the assigned one) — e.g. for a "meet the mentors" page. |
| GET | `/mentor` | The intern's own assigned mentor's info. |
| GET | `/mentor/sessions` | List mentorship sessions (past/upcoming). |
| POST | `/mentor/sessions` | Request a session with the assigned mentor. |
| PATCH | `/mentor/sessions/:id/rate` | Rate a completed session. |

### 4.10 Progress
| Method | Path | Why |
|---|---|---|
| GET | `/progress/stats` | Aggregate progress numbers for a progress-tracking widget. |
| GET | `/progress/skills` | Skills the intern has logged/demonstrated — distinct from career-file skills (this is progress-tracking, career file below is the portfolio artifact). |

### 4.11 Career file (portfolio / "passport")
| Method | Path | Why |
|---|---|---|
| GET | `/career-file` | The intern's own career file — skills, experiences, projects, readiness score. This is what eventually becomes their public shareable passport (see section 5). |
| PUT | `/career-file` | Update top-level career file fields. |
| POST | `/career-file/auto-populate` | Auto-fill career file fields from the parsed CV — saves manual re-entry. |
| POST | `/career-file/skills` | Add a skill entry. |
| DELETE | `/career-file/skills/:id` | Remove a skill entry. |
| POST | `/career-file/experiences` | Add a work-experience entry. |
| DELETE | `/career-file/experiences/:id` | Remove a work-experience entry. |
| POST | `/career-file/projects` | Add a project entry. |
| DELETE | `/career-file/projects/:id` | Remove a project entry. |

---

## 5. Public, no auth

| Method | Path | Why |
|---|---|---|
| POST | `/upload/cv` | CV upload *before* an account exists — the applicant flow needs this ahead of registration, so it can't sit behind a JWT. 5MB limit, in-memory, not persisted to disk. |
| GET | `/verify/:certificateId` | Public certificate authenticity check — the whole point of issuing a certificate is that anyone (an employer) can verify it without an account. |
| GET | `/passport/:slug` | Public shareable career-file "passport" page — an intern shares this link the way they'd share a portfolio site; must work with zero auth for that to make sense. |
| GET | `/health` | Infra health check (Railway/load balancer), not an application feature. |

---

## Why the shape of this API is what it is

A few structural decisions worth the frontend knowing, so the API doesn't feel arbitrary:

- **Everything under `/api/admin` requires full admin auth, including read-only listing endpoints.** There's no "public read, admin write" split — even browsing the audit log needs a token. Don't build a public admin-data view expecting otherwise.
- **Two 403 flavors exist** (`role` mismatch vs `admin_role` mismatch) — see section 2's ⚡ markers. Worth branching your error UI on the message text if you want to say "you need to be a super admin" specifically.
- **Opportunities and internship slots are two separate systems** that happen to look similar (both are "apply to a listing" flows) — don't conflate their endpoints, they have separate applications tables and separate admin review queues.
- **Career file (`/intern/career-file`) and progress (`/intern/progress/skills`) are two different concepts** — progress is program-tracking, career file is the portfolio artifact that becomes the public passport. An intern's "skills" can exist in both places for different reasons.
- **`/api/intern` and `/api/onboarding` are the same router, mounted twice** — a known quirk (see `FRONTEND_CONTRACT.md` section 7), not two different feature sets.
