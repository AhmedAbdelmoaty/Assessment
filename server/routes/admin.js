import express from 'express';
import { db, users } from '../db.js';
import { sql } from 'drizzle-orm';

const router = express.Router();

/**
 * GET /api/admin/counters
 * Returns basic counters: total users and top country
 */
router.get('/counters', async (req, res) => {
  try {
    // Get total users count
    const totalResult = await db.execute(sql`
      SELECT COUNT(*)::int as total
      FROM users
    `);
    const totalUsers = totalResult.rows[0]?.total || 0;

    // Get top country (most common country in profile_json->intake)
    const topCountryResult = await db.execute(sql`
      SELECT 
        profile_json->'intake'->>'country' as country,
        COUNT(*)::int as count
      FROM users
      WHERE profile_json->'intake'->>'country' IS NOT NULL
      GROUP BY profile_json->'intake'->>'country'
      ORDER BY count DESC
      LIMIT 1
    `);

    const topCountry = topCountryResult.rows[0] || { country: 'N/A', count: 0 };

    res.json({
      totalUsers,
      topCountry: {
        name: topCountry.country,
        count: topCountry.count
      }
    });
  } catch (error) {
    console.error('[ADMIN COUNTERS ERROR]', error);
    res.status(500).json({ error: 'Failed to fetch counters' });
  }
});

/**
 * GET /api/admin/drilldown
 * Returns aggregated data for 4-level drilldown: country → age_band → sector → job_nature
 * Returns flat array; client will build tree structure
 */
router.get('/drilldown', async (req, res) => {
  try {
    // Query to get all combinations with counts
    const result = await db.execute(sql`
      SELECT 
        profile_json->'intake'->>'country' as country,
        profile_json->'intake'->>'age_band' as age_band,
        profile_json->'intake'->>'sector' as sector,
        profile_json->'intake'->>'job_nature' as job_nature,
        COUNT(*)::int as count
      FROM users
      WHERE profile_json->'intake' IS NOT NULL
      GROUP BY 
        profile_json->'intake'->>'country',
        profile_json->'intake'->>'age_band',
        profile_json->'intake'->>'sector',
        profile_json->'intake'->>'job_nature'
      ORDER BY 
        country NULLS LAST,
        age_band NULLS LAST,
        sector NULLS LAST,
        job_nature NULLS LAST
    `);

    // Convert rows to plain objects
    const data = result.rows.map(row => ({
      country: row.country || null,
      age_band: row.age_band || null,
      sector: row.sector || null,
      job_nature: row.job_nature || null,
      count: row.count
    }));

    res.json({ data });
  } catch (error) {
    console.error('[ADMIN DRILLDOWN ERROR]', error);
    res.status(500).json({ error: 'Failed to fetch drilldown data' });
  }
});

export default router;
