// server/shared/topicDisplayMap.js

export const TOPIC_DISPLAY = {
  en: {
    central_tendency_basics: "Central Tendency (Mean/Median/Mode)",
    basic_spread_distribution_shape: "Spread & Distribution Shape",
    quantiles_iqr_boxplots: "Quartiles, IQR & Boxplots",
    standard_deviation_variability: "Standard Deviation & Variability",
    grouped_summaries: "Grouped Summaries",
    z_scores_standardization: "Z-Scores & Standardization",
    correlation_vs_covariance: "Correlation vs. Covariance",
    skewness_kurtosis_diagnostics: "Skewness & Kurtosis Diagnostics",
  },
  ar: {
    central_tendency_basics: "مقاييس النزعة المركزية (المتوسط/الوسيط/المنوال)",
    basic_spread_distribution_shape: "التشتت وشكل التوزيع",
    quantiles_iqr_boxplots: "الربيعات و(IQR) ومخططات الصندوق",
    standard_deviation_variability: "الانحراف المعياري والتباين",
    grouped_summaries: "ملخّصات حسب المجموعات",
    z_scores_standardization: "الدرجات المعيارية (Z-Scores) والتوحيد",
    correlation_vs_covariance: "الارتباط مقابل التغاير",
    skewness_kurtosis_diagnostics: "الالتواء والتفلطح (تشخيصات)",
  },
};

/** يحوّل كود الكلاستر إلى اسم معروض حسب اللغة */
export function humanizeCluster(clusterKey, lang = "en") {
  const L = lang === "ar" ? "ar" : "en";
  return TOPIC_DISPLAY[L][clusterKey] || clusterKey;
}

/** يحوّل قائمة أكواد إلى قائمة أسماء معروضة */
export function toDisplayList(clusterKeys = [], lang = "en") {
  return (clusterKeys || []).map((k) => humanizeCluster(k, lang));
}
