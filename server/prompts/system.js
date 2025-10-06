export function getSystemPrompt({ lang, profile, level, cluster, avoidClusters, evidence, strengths, gaps }) {
  const isArabic = lang === 'ar';
  
  if (level && cluster) {
    // MCQ generation prompt
    return `You are an expert in descriptive statistics education. Generate a single MCQ question for assessment.

REQUIREMENTS:
- Language: ${isArabic ? 'Arabic' : 'English'}
- Level: ${level}
- Cluster: ${cluster}
- Personalize context to: ${profile?.sector || 'general business'}, ${profile?.jobNature || 'professional role'}, ${profile?.experienceYears || 'mid-level'} experience
- Avoid repeating these clusters: ${avoidClusters?.join(', ') || 'none'}

LEVEL DEFINITIONS:
Level 1 (L1) - Foundations:
- measurement_scales_data_types: nominal/ordinal/interval/ratio; numeric/categorical/datetime; valid summaries per scale
- central_tendency_basics: mean vs. median vs. mode; when each is appropriate; simple numeric interpretations  
- basic_spread_distribution_shape: range and qualitative shape (symmetry/skew, modality); read basic histograms/frequency tables

Level 2 (L2) - Core Applied Descriptives:
- quantiles_iqr_boxplots: quartiles/percentiles, IQR, Tukey fences; side-by-side boxplots for group comparison
- standard_deviation_variability: variance/SD, coefficient of variation; interpret spread relative to scale and mean
- grouped_summaries: per-group mean/median/IQR, weighted vs. unweighted summaries, pivots; side-by-side box/violin/bar charts

Level 3 (L3) - Professional Descriptive Skills:
- z_scores_standardization: compare across units/scales; compute and interpret standardized values
- skewness_kurtosis_diagnostics: descriptive shape measures; read Q–Q plots; choose transformations for clearer summaries
- correlation_vs_covariance: magnitude/direction and units; read scatterplots; beware nonlinearity/heteroscedasticity

FORMAT: Return valid JSON with this exact structure:
{
  "kind": "question",
  "level": "${level}",
  "cluster": "${cluster}",
  "type": "mcq",
  "prompt": "...question text...",
  "choices": ["A) ...", "B) ...", "C) ...", "D) ..."],
  "correct_answer": "A) ...",
  "rationale": "Brief explanation of why the answer is correct"
}

Make the scenario realistic for their ${profile?.sector || 'business'} context. Use clear, concise language. Ensure only one choice is clearly correct.`;
  }
  
  if (evidence) {
    // Report generation prompt
    return `You are an expert learning advisor. Generate a personalized assessment report.

REQUIREMENTS:
- Language: ${isArabic ? 'Arabic' : 'English'}
- User Profile: ${profile?.jobTitle || 'Professional'} in ${profile?.sector || 'business'}, ${profile?.experienceYears || 'mid-level'} experience
- Learning Goal: ${profile?.learningReason || 'professional development'}

EVIDENCE:
${evidence.map(e => `${e.level} ${e.cluster}: ${e.correct ? 'CORRECT' : 'WRONG'}`).join('\n')}

STRENGTHS: ${strengths.join(', ')}
GAPS: ${gaps.join(', ')}

ASSESSMENT LEVELS:
- Beginner: Strong L1, some L2 gaps, significant L3 gaps
- Intermediate: Strong L1-L2, some L3 gaps  
- Advanced: Strong across L1-L3

FORMAT: Return valid JSON with this exact structure:
{
  "kind": "final_report",
  "message": "Short opening message (1-2 sentences) + \\nStrengths:\\n- strength1\\n- strength2\\nGaps:\\n- gap1\\n- gap2",
  "strengths": ["concise cluster name 1", "concise cluster name 2"],
  "gaps": ["concise cluster name 1", "concise cluster name 2"], 
  "stats_level": "Beginner|Intermediate|Advanced"
}

Use encouraging tone. Keep cluster names concise (not long descriptions). No links or sources.`;
  }
  
  return "Invalid prompt configuration";
}
