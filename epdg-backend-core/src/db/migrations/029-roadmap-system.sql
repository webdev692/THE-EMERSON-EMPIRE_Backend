-- ─── Tables ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tracks (
  id          SERIAL PRIMARY KEY,
  slug        VARCHAR(50)  UNIQUE NOT NULL,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roadmap_modules (
  id          SERIAL PRIMARY KEY,
  track_id    INTEGER      NOT NULL REFERENCES tracks(id),
  level       VARCHAR(20)  NOT NULL CHECK (level IN ('beginner','intermediate','advanced')),
  order_index INTEGER      NOT NULL,
  title       VARCHAR(200) NOT NULL,
  objective   TEXT         NOT NULL,
  artifact    TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (track_id, level, order_index)
);

CREATE TABLE IF NOT EXISTS intern_level_progress (
  id               SERIAL PRIMARY KEY,
  intern_id        INTEGER     NOT NULL REFERENCES intern_profiles(id) ON DELETE CASCADE,
  track_id         INTEGER     NOT NULL REFERENCES tracks(id),
  current_level    VARCHAR(20) NOT NULL DEFAULT 'beginner'
                     CHECK (current_level IN ('beginner','intermediate','advanced')),
  level_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (intern_id, track_id)
);

CREATE TABLE IF NOT EXISTS module_completions (
  id               SERIAL PRIMARY KEY,
  intern_id        INTEGER     NOT NULL REFERENCES intern_profiles(id) ON DELETE CASCADE,
  module_id        INTEGER     NOT NULL REFERENCES roadmap_modules(id),
  completed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mentor_signed    BOOLEAN     NOT NULL DEFAULT FALSE,
  mentor_id        INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  mentor_signed_at TIMESTAMPTZ,
  artifact_url     TEXT,
  notes            TEXT,
  UNIQUE (intern_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_roadmap_modules_track_level   ON roadmap_modules (track_id, level);
CREATE INDEX IF NOT EXISTS idx_module_completions_intern_id  ON module_completions (intern_id);
CREATE INDEX IF NOT EXISTS idx_intern_level_progress_intern  ON intern_level_progress (intern_id);

-- ─── Seed: tracks ──────────────────────────────────────────────────────────────

INSERT INTO tracks (slug, name, description) VALUES
  ('web-design',        'Web Design',        'Create beautiful, user-friendly interfaces and compelling digital experiences for clients.'),
  ('social-media',      'Social Media',      'Manage and grow brand presence across social platforms through creative content.'),
  ('digital-marketing', 'Digital Marketing', 'Drive business growth through data-driven campaigns, SEO, and marketing strategy.'),
  ('sales',             'Sales',             'Build client relationships, generate leads, and contribute to business development.')
ON CONFLICT (slug) DO NOTHING;

-- ─── Seed: Web Design modules ─────────────────────────────────────────────────

INSERT INTO roadmap_modules (track_id, level, order_index, title, objective, artifact)
SELECT t.id, 'beginner', m.ord, m.title, m.objective, m.artifact
FROM tracks t
CROSS JOIN (VALUES
  (1, 'Design Principles',     'Apply hierarchy, contrast, alignment, and proximity to evaluate and produce layouts',      'Annotated critique of 3 real websites identifying principle violations'),
  (2, 'Figma Basics',          'Create frames, shapes, and text layers; use auto-layout and constraints',                  'Wireframe of a 3-page app at mobile and desktop breakpoints'),
  (3, 'Color & Typography',    'Define a functional color palette and type scale for a brand',                             'Brand style tile with primary/secondary/accent colors and type scale'),
  (4, 'HTML/CSS from Design',  'Translate a Figma frame to a pixel-accurate coded page',                                  'Coded landing page matching provided Figma design within 95%'),
  (5, 'Responsive Wireframes', 'Design mobile and desktop breakpoints with consistent spacing and layout',                 'Figma file with mobile + desktop frames linked in a prototype flow')
) AS m(ord, title, objective, artifact)
WHERE t.slug = 'web-design'
ON CONFLICT (track_id, level, order_index) DO NOTHING;

INSERT INTO roadmap_modules (track_id, level, order_index, title, objective, artifact)
SELECT t.id, 'intermediate', m.ord, m.title, m.objective, m.artifact
FROM tracks t
CROSS JOIN (VALUES
  (1, 'Component Libraries',         'Build a Figma component library with buttons, inputs, and cards with variant states',    'Published Figma library with at least 8 components and defined variant states'),
  (2, 'High-Fidelity Prototyping',   'Create interactive prototypes with Figma flows and smart animate transitions',           'Clickable Figma prototype of a full app with 5+ connected screens'),
  (3, 'Design Systems',              'Define spacing scale, grid, and design tokens for color, radius, and shadow',            'Design system document with named token references in Figma'),
  (4, 'CSS Component Implementation','Code the Figma component library in HTML/CSS with class-based structure',               'CSS component library matching Figma components'),
  (5, 'Accessibility Basics',        'Apply WCAG AA contrast, visible focus states, and semantic HTML in designs',            'Accessibility audit of own designs using WAVE and contrast checker'),
  (6, 'Developer Handoff',           'Annotate Figma frames with specs, export assets, and write handoff notes',              'Handoff-ready Figma file and spec doc a developer can build without follow-up')
) AS m(ord, title, objective, artifact)
WHERE t.slug = 'web-design'
ON CONFLICT (track_id, level, order_index) DO NOTHING;

INSERT INTO roadmap_modules (track_id, level, order_index, title, objective, artifact)
SELECT t.id, 'advanced', m.ord, m.title, m.objective, m.artifact
FROM tracks t
CROSS JOIN (VALUES
  (1, 'User Research',            'Plan and run 3 user interviews; synthesize themes into design implications',            'Interview synthesis report with 3-5 actionable findings'),
  (2, 'Iterative Design',         'Revise designs based on user feedback and document every change with rationale',        'v1 vs v2 comparison doc showing what changed and why'),
  (3, 'Motion & Microinteractions','Design transitions and micro-animations in Figma or Framer',                          'Prototype with at least 5 meaningful microinteractions'),
  (4, 'Brand Identity',           'Create a brand guidelines document covering logo, voice, color, type, and spacing',    'Brand guidelines PDF usable by external contractors'),
  (5, 'Full Product Design',      'Design a complete product from discovery brief through developer handoff',             'End-to-end Figma project with annotated spec and handoff doc')
) AS m(ord, title, objective, artifact)
WHERE t.slug = 'web-design'
ON CONFLICT (track_id, level, order_index) DO NOTHING;

-- ─── Seed: Social Media modules ───────────────────────────────────────────────

INSERT INTO roadmap_modules (track_id, level, order_index, title, objective, artifact)
SELECT t.id, 'beginner', m.ord, m.title, m.objective, m.artifact
FROM tracks t
CROSS JOIN (VALUES
  (1, 'Platform Fundamentals',    'Study algorithm mechanics on Instagram, LinkedIn, TikTok, and X',                      '1-page platform comparison sheet covering format, algorithm signal, and best posting times'),
  (2, 'Brand Voice & Tone',       'Define and apply brand voice guidelines to written content',                           'Voice and tone guide for a real or fictional brand'),
  (3, 'Content Formats',          'Produce a static post, a carousel, and a short-form video script',                    '3 pieces of content — one static post, one carousel, one video script — reviewed against brand guidelines'),
  (4, 'Content Calendar Basics',  'Schedule 2 weeks of content with themes and posting cadence',                          'Content calendar in Notion or Buffer with captions and visual notes'),
  (5, 'Community Engagement',     'Draft response templates for 10 common interaction types',                             'Community response playbook covering comments, DMs, complaints, and questions')
) AS m(ord, title, objective, artifact)
WHERE t.slug = 'social-media'
ON CONFLICT (track_id, level, order_index) DO NOTHING;

INSERT INTO roadmap_modules (track_id, level, order_index, title, objective, artifact)
SELECT t.id, 'intermediate', m.ord, m.title, m.objective, m.artifact
FROM tracks t
CROSS JOIN (VALUES
  (1, 'Audience Segmentation',    'Define 2-3 audience personas using platform analytics data',                           'Persona doc with content implications per platform'),
  (2, 'Full Month Calendar',      'Manage a complete 30-day content calendar independently',                              'Published 30-day calendar with all content scheduled and approved'),
  (3, 'Analytics & Reporting',    'Analyze reach, engagement rate, saves, and shares; surface actionable insights',       'Monthly performance report with trend observations and next-step recommendations'),
  (4, 'Campaign Planning',        'Plan a 4-week awareness or engagement campaign with a stated measurable goal',          'Campaign brief with calendar and defined success metric'),
  (5, 'Hashtag & SEO Strategy',   'Research and apply platform-native discovery strategy across platforms',               'Platform-specific hashtag and keyword playbook'),
  (6, 'Competitor Analysis',      'Audit 3 competitor accounts and identify content gaps and strategic opportunities',    'Competitive intelligence report with content gap summary')
) AS m(ord, title, objective, artifact)
WHERE t.slug = 'social-media'
ON CONFLICT (track_id, level, order_index) DO NOTHING;

INSERT INTO roadmap_modules (track_id, level, order_index, title, objective, artifact)
SELECT t.id, 'advanced', m.ord, m.title, m.objective, m.artifact
FROM tracks t
CROSS JOIN (VALUES
  (1, 'Campaign Execution & Optimization', 'Run a full campaign; monitor metrics and document pivots made mid-flight',    'Campaign results report with in-flight changes and outcome vs goal'),
  (2, 'Growth Experiments',               'Design and run 2 A/B content experiments with a documented hypothesis',       'Experiment log with hypothesis, variant descriptions, results, and learnings'),
  (3, 'Cross-Platform Strategy',          'Develop a unified strategy adapting content natively across 4+ platforms',     'Cross-platform content strategy doc with platform-specific adaptations'),
  (4, 'Analytics-Driven Deck',            'Present a 3-month performance review with recommendations to a stakeholder',   'Slide deck with quantified results, trend analysis, and next-quarter proposals'),
  (5, 'Operations Playbook',              'Document all processes for handoff to the next cohort',                        'Social media operations playbook covering tools, cadences, approval flows, and templates')
) AS m(ord, title, objective, artifact)
WHERE t.slug = 'social-media'
ON CONFLICT (track_id, level, order_index) DO NOTHING;

-- ─── Seed: Digital Marketing modules ──────────────────────────────────────────

INSERT INTO roadmap_modules (track_id, level, order_index, title, objective, artifact)
SELECT t.id, 'beginner', m.ord, m.title, m.objective, m.artifact
FROM tracks t
CROSS JOIN (VALUES
  (1, 'Digital Marketing Fundamentals', 'Understand channels, funnel stages (TOFU/MOFU/BOFU), and key metrics (CPC, CPM, CTR, ROAS)', 'Channel and metric reference cheat-sheet'),
  (2, 'SEO Basics',                     'Perform keyword research and apply on-page SEO (title tags, meta descriptions, heading structure)', 'SEO audit of a sample page with prioritized improvement list'),
  (3, 'GA4 Setup & Analysis',           'Configure GA4 and understand sessions, bounce rate, and conversion events',                     'GA4 property configured with 2 tracked goals and annotated screenshot walkthrough'),
  (4, 'Paid Ads Introduction',          'Navigate Google Ads and Meta Ads Manager interfaces and understand campaign structure',          'Annotated platform walkthrough and mock campaign structure (no spend)'),
  (5, 'Email Marketing Basics',         'Build and send a 3-email welcome sequence in Mailchimp or equivalent',                         'Published 3-email welcome flow with subject lines, preview text, and CTAs'),
  (6, 'Content Marketing Basics',       'Write one SEO-oriented piece of content targeting a researched keyword',                       'Published or approved blog post with keyword justification')
) AS m(ord, title, objective, artifact)
WHERE t.slug = 'digital-marketing'
ON CONFLICT (track_id, level, order_index) DO NOTHING;

INSERT INTO roadmap_modules (track_id, level, order_index, title, objective, artifact)
SELECT t.id, 'intermediate', m.ord, m.title, m.objective, m.artifact
FROM tracks t
CROSS JOIN (VALUES
  (1, 'Campaign Strategy',                'Write a multi-channel campaign brief with goals, KPIs, audience, and budget split',          'Campaign strategy doc reviewed and approved before execution'),
  (2, 'Google Ads Management',            'Build and optimize a Search + Display campaign with A/B ad variants',                       'Live or demo campaign report with CTR, CPC, and optimization notes'),
  (3, 'Meta Ads Management',              'Build and optimize a Meta campaign with 2 audience segments',                               'Meta campaign report with audience comparison and creative performance'),
  (4, 'Intermediate SEO',                 'Apply link building strategy, technical SEO basics, and content cluster planning',          'Content cluster map and link outreach list with 10+ targets'),
  (5, 'Email Automation',                 'Build a segmented email automation flow with 2+ branches based on behavior',                'Segmented automation flow with branching logic documented'),
  (6, 'Marketing Performance Dashboard',  'Build a consolidated dashboard pulling data from at least 2 channels',                     'Live Looker Studio or GA4 dashboard'),
  (7, 'Conversion Rate Optimization',     'Identify landing page friction points and brief an A/B test',                              'A/B test brief and results (real or simulated) with statistical interpretation')
) AS m(ord, title, objective, artifact)
WHERE t.slug = 'digital-marketing'
ON CONFLICT (track_id, level, order_index) DO NOTHING;

INSERT INTO roadmap_modules (track_id, level, order_index, title, objective, artifact)
SELECT t.id, 'advanced', m.ord, m.title, m.objective, m.artifact
FROM tracks t
CROSS JOIN (VALUES
  (1, 'Full-Funnel Strategy',         'Map and optimize the complete buyer journey from awareness through retention',               'Full-funnel strategy doc with channel assignments per stage'),
  (2, 'Budget Management',            'Allocate and rebalance a $1,000+ budget across channels with weekly pacing documentation',   'Budget allocation model and pacing tracker with rebalancing rationale'),
  (3, 'Attribution Modeling',         'Compare last-click vs multi-touch attribution and identify which channels drive conversions','Attribution comparison report with channel re-valuation recommendations'),
  (4, 'Advanced SEO',                 'Run a technical site audit covering Core Web Vitals, crawl errors, and schema markup',      'Technical SEO audit report with severity-ranked fix list'),
  (5, 'Marketing Systems & Playbooks','Document repeatable marketing processes (campaign setup, weekly reporting, ad QA)',         'Marketing operations playbook covering all recurring workflows'),
  (6, 'Capstone Campaign',            'Plan, execute, and report on a real or simulated campaign end-to-end',                     'Campaign report with spend breakdown, channel performance, and ROI analysis')
) AS m(ord, title, objective, artifact)
WHERE t.slug = 'digital-marketing'
ON CONFLICT (track_id, level, order_index) DO NOTHING;

-- ─── Seed: Sales modules ──────────────────────────────────────────────────────

INSERT INTO roadmap_modules (track_id, level, order_index, title, objective, artifact)
SELECT t.id, 'beginner', m.ord, m.title, m.objective, m.artifact
FROM tracks t
CROSS JOIN (VALUES
  (1, 'Sales Fundamentals',      'Understand the sales cycle stages and key metrics (pipeline value, conversion rate, activity ratios)', 'Sales process map diagram with stage definitions and key metrics'),
  (2, 'CRM Basics',              'Navigate and update a CRM; enter leads, contacts, and opportunities with correct field usage',          'Completed CRM exercise with 5 records across pipeline stages'),
  (3, 'Prospecting & Lead Research', 'Identify and qualify potential leads using LinkedIn and company databases',                    'Prospect list of 20 qualified leads with ICP scoring rationale'),
  (4, 'Outreach Basics',         'Write cold email sequences and structured follow-up messages',                                     '3-email outreach sequence and 2 follow-up templates reviewed by mentor'),
  (5, 'Objection Handling',      'Identify the 5 most common sales objections and draft structured responses',                       'Objection handling playbook with response frameworks for 5 objection types')
) AS m(ord, title, objective, artifact)
WHERE t.slug = 'sales'
ON CONFLICT (track_id, level, order_index) DO NOTHING;

INSERT INTO roadmap_modules (track_id, level, order_index, title, objective, artifact)
SELECT t.id, 'intermediate', m.ord, m.title, m.objective, m.artifact
FROM tracks t
CROSS JOIN (VALUES
  (1, 'Pipeline Management',         'Build and track a 20-lead pipeline through all stages with weekly updates',               'Live CRM pipeline with stage history and activity log'),
  (2, 'Discovery Calls',             'Structure and run a discovery call using the SPIN or BANT framework',                     'Call script and recorded or role-play session notes with self-assessment'),
  (3, 'Proposal & Pitch',            'Build a client proposal or pitch deck for a real or simulated opportunity',               'Reviewed proposal or pitch deck for a defined use case'),
  (4, 'Negotiation Fundamentals',    'Apply principled negotiation techniques in a structured role-play scenario',              'Role-play debrief doc with techniques applied, outcome, and learnings'),
  (5, 'Sales Analytics',             'Report on pipeline metrics, conversion rates, and sales activity data',                   'Pipeline metrics report with conversion funnel analysis and observations')
) AS m(ord, title, objective, artifact)
WHERE t.slug = 'sales'
ON CONFLICT (track_id, level, order_index) DO NOTHING;

INSERT INTO roadmap_modules (track_id, level, order_index, title, objective, artifact)
SELECT t.id, 'advanced', m.ord, m.title, m.objective, m.artifact
FROM tracks t
CROSS JOIN (VALUES
  (1, 'Account Management',    'Build a 90-day account plan for an existing or simulated client',                                'Account plan doc with goals, risk flags, and scheduled touchpoints'),
  (2, 'Sales Strategy',        'Develop a go-to-market sales strategy for a product or service',                                'GTM strategy doc with target segment, messaging, channels, and success metrics'),
  (3, 'Sales Forecasting',     'Build a quarterly sales forecast model with documented assumptions and variance analysis',       'Quarterly forecast model with scenario analysis (base, upside, downside)'),
  (4, 'Team Coordination',     'Shadow a senior rep or coordinate on a live deal; identify and document process improvements',   'Process improvement memo with 3+ specific recommendations'),
  (5, 'Capstone Deal',         'Manage a complete sales cycle from prospecting to close with mentor debrief',                   'Full sales cycle documentation and structured debrief notes with mentor')
) AS m(ord, title, objective, artifact)
WHERE t.slug = 'sales'
ON CONFLICT (track_id, level, order_index) DO NOTHING;
