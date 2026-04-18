import { onCLS, onFID, onINP, onLCP } from "web-vitals";

export const PERFORMANCE_BUDGETS = {
  LCP: 2500,
  FID: 100,
  CLS: 0.1,
  INP: 200
};

let vitalsInitialized = false;

/**
 * @param {number} value
 * @returns {number}
 */
function formatMetricValue(value) {
  return Number.isFinite(value) ? Number(value.toFixed(3)) : 0;
}

/**
 * @param {(eventName: string, params: Record<string, string | number>) => void} reportEvent
 */
export function initWebVitalsReporting(reportEvent) {
  if (vitalsInitialized || typeof reportEvent !== "function") {
    return;
  }

  vitalsInitialized = true;

  /**
   * @param {{
   *   name: "LCP" | "CLS" | "FID" | "INP",
   *   id: string,
   *   value: number,
   *   rating: "good" | "needs-improvement" | "poor",
   *   delta: number,
   *   navigationType: string
   * }} metric
   */
  const handleMetric = (metric) => {
    const value = formatMetricValue(metric.value);

    reportEvent("web_vital", {
      metric_name: metric.name,
      metric_id: metric.id,
      metric_value: value,
      metric_delta: formatMetricValue(metric.delta),
      metric_rating: metric.rating,
      navigation_type: metric.navigationType
    });

    const budget = PERFORMANCE_BUDGETS[metric.name];
    if (typeof budget === "number" && value > budget) {
      reportEvent("performance_budget_breach", {
        metric_name: metric.name,
        metric_value: value,
        budget_value: budget,
        over_budget_by: formatMetricValue(value - budget),
        metric_rating: metric.rating
      });
    }
  };

  onLCP(handleMetric, { reportAllChanges: true });
  onFID(handleMetric);
  onCLS(handleMetric, { reportAllChanges: true });
  onINP(handleMetric, { reportAllChanges: true });
}
