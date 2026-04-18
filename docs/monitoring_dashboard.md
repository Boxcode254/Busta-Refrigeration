## Monitoring Dashboard Guide

Last updated: 2026-04-18

### Scope
This monitoring setup is tuned for content and lead generation flows (not checkout ecommerce).

### Environment Configuration
Set the following variables before build:

- `VITE_GA4_MEASUREMENT_ID`: GA4 measurement ID, example `G-XXXXXXXXXX`
- `VITE_SENTRY_DSN`: Sentry browser DSN
- `VITE_SENTRY_ENVIRONMENT`: Environment name (`staging`, `production`, etc.)
- `VITE_SENTRY_RELEASE`: Release label for deploy correlation
- `VITE_MONITORING_DEFAULT_CONSENT`: `denied` or `granted`
- `VITE_MONITORING_CONSENT_KEY`: localStorage key for consent state

### Consent Behavior
Monitoring is consent-gated. Runtime bridge:

- `window.BustaMonitoringConsent.grantAll()`
- `window.BustaMonitoringConsent.revokeAll()`
- `window.BustaMonitoringConsent.update({ analytics: true, errorTracking: true })`
- `window.BustaMonitoringConsent.getState()`

CMP integrations can dispatch:

- `window.dispatchEvent(new CustomEvent("busta:consent:update", { detail: { analytics: true, errorTracking: true } }))`

### GA4 Event Taxonomy
The runtime emits these events:

- `page_view`
- `contact_form_started`
- `contact_form_submit_attempt`
- `contact_form_submit_valid`
- `contact_form_validation_failed`
- `contact_form_submit_success`
- `contact_form_submit_failure`
- `contact_phone_click`
- `contact_email_click`
- `contact_whatsapp_click`
- `cta_click`
- `document_download`
- `gallery_item_open`
- `web_vital`
- `performance_budget_breach`

### Core Web Vitals + Budgets
Current budget thresholds:

- LCP: < 2500 ms
- FID: < 100 ms
- CLS: < 0.1
- INP: < 200 ms

Budget breaches are emitted as `performance_budget_breach` events in GA4.

### Dashboard Layout (GA4)
Create a Looker Studio or GA4 Exploration dashboard with these cards:

1. Web Vitals Trend
- Dimension: `metric_name`
- Metric: average `metric_value`
- Filter: `event_name = web_vital`

2. Budget Breach Count
- Dimension: `metric_name`
- Metric: event count
- Filter: `event_name = performance_budget_breach`

3. Lead Funnel
- Metric sequence:
  - `contact_form_started`
  - `contact_form_submit_attempt`
  - `contact_form_submit_valid`
  - `contact_form_submit_success`

4. Contact Channel Mix
- Dimension: `event_name`
- Filter include:
  - `contact_phone_click`
  - `contact_email_click`
  - `contact_whatsapp_click`

5. CTA and Document Engagement
- Dimension: `event_name`
- Filter include:
  - `cta_click`
  - `document_download`
  - `gallery_item_open`

### Dashboard Layout (Sentry)
Create a Sentry dashboard with:

1. Error Events by Release
2. Error Events by Page Type (`page_type` tag)
3. Top Exception Messages (excluding ignored ResizeObserver noise)
4. New Issues in Last 24h

### Release Checklist

1. Verify env variables are set in deployment target.
2. Grant consent on a test session and confirm GA4 realtime events.
3. Trigger a handled JS error and confirm Sentry ingest.
4. Confirm `web_vital` and `performance_budget_breach` events in GA4 debug view.
5. Verify consent revocation stops new monitoring events.
