const express = require('express');
const db = require('../db');
const { moduleEnabled } = require('./utils');

const router = express.Router();

router.get('/', async (_req, res, next) => {
  if (!moduleEnabled('PUBLIC_CREDITS_ENABLED')) {
    return res.status(503).json({ success: false, error: 'Public credits module is currently disabled.' });
  }

  try {
    const result = await db.query(
      `select
         cf.slug,
         cf.headline,
         cf.summary,
         cf.readiness_tier,
         u.name as intern_name,
         ip.track,
         ip.portfolio_url,
         ip.linkedin_url,
         ip.github_url
       from epdg.career_files cf
       join epdg.intern_profiles ip on ip.id = cf.intern_profile_id
       join epdg.users u on u.id = ip.user_id
       where cf.is_public = true
         and ip.is_approved = true
         and u.deleted_at is null
       order by cf.updated_at desc nulls last, cf.created_at desc
       limit 50`
    );

    return res.status(200).json({ success: true, contributions: result.rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
