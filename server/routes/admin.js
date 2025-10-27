import express from 'express';
import { db, users } from '../db.js';
import { sql } from 'drizzle-orm';

const router = express.Router();

/**
 * GET /api/admin/users/raw
 * Returns flat rows with all user data for pivot analysis
 * Fields: id, email, username, name, country, age_band, sector, job_nature, experience_years_band, learning_reason
 * 
 * SQL verification queries:
 * 
 * Total users:
 * SELECT COUNT(*) FROM users;
 * 
 * Count by country:
 * SELECT NULLIF(TRIM(profile_json->'intake'->>'country'), '') AS country,
 *        COUNT(*) AS users_count
 * FROM users
 * GROUP BY 1
 * ORDER BY users_count DESC NULLS LAST;
 * 
 * Country × Sector:
 * SELECT NULLIF(TRIM(profile_json->'intake'->>'country'), '') AS country,
 *        NULLIF(TRIM(profile_json->'intake'->>'sector'), '')  AS sector,
 *        COUNT(*) AS users_count
 * FROM users
 * GROUP BY 1,2
 * ORDER BY country NULLS LAST, users_count DESC;
 */
router.get('/users/raw', async (req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT 
        id,
        email,
        username,
        profile_json->>'name' as name,
        profile_json->'intake'->>'country' as country,
        profile_json->'intake'->>'age_band' as age_band,
        profile_json->'intake'->>'sector' as sector,
        profile_json->'intake'->>'job_nature' as job_nature,
        profile_json->'intake'->>'experience_years_band' as experience_years_band,
        profile_json->'intake'->>'learning_reason' as learning_reason
      FROM users
      ORDER BY email
    `);

    // Convert rows to plain objects with proper null handling
    const data = result.rows.map(row => ({
      id: row.id || '',
      email: row.email || '',
      username: row.username || '',
      name: row.name || '',
      country: row.country || null,
      age_band: row.age_band || null,
      sector: row.sector || null,
      job_nature: row.job_nature || null,
      experience_years_band: row.experience_years_band || null,
      learning_reason: row.learning_reason || null
    }));

    res.json({ data });
  } catch (error) {
    console.error('[ADMIN USERS RAW ERROR]', error);
    res.status(500).json({ error: 'Failed to fetch users data' });
  }
});

export default router;
