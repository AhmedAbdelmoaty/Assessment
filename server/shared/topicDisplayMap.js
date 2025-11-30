// server/shared/topicDisplayMap.js

export const TOPIC_DISPLAY = {
  en: {
    // Level 1
    central_tendency_foundations: "Central Tendency (Mean/Median/Mode)",
    dispersion_boxplot_foundations: "Dispersion & Box Plot (Range/Variance/SD)",

    // Level 2
    distribution_shape_normality: "Distribution Shape & Normality",
    data_quality_outliers_iqr: "Data Quality & Outliers (IQR, LB/UB)",

    // Level 3
    correlation_bivariate_patterns: "Correlation & Bivariate Patterns",
    non_normal_skew_kurtosis_z: "Non-Normal Data (Skewness/Kurtosis/Z-Scores)",
  },
  ar: {
    // المستوى 1
    central_tendency_foundations: "مقاييس النزعة المركزية (المتوسط/الوسيط/المنوال)",
    dispersion_boxplot_foundations: "التشتت ومخطط الصندوق (المدى/التباين/الانحراف المعياري)",

    // المستوى 2
    distribution_shape_normality: "شكل التوزيع (Distribution Shape & Normality)",
    data_quality_outliers_iqr: "جودة البيانات والقيم الشاذة (IQR, LB/UB)",

    // المستوى 3
    correlation_bivariate_patterns: "الارتباط والأنماط الثنائية (Correlation & Bivariate Patterns)",
    non_normal_skew_kurtosis_z: "البيانات غير الطبيعية (Skewness/Kurtosis/Z-Scores)",
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
