## Plan: Image Inventory Cleanup (Active)

Use a conservative, dry-run-first workflow that matches the current codebase: preserve existing runtime lazy-loading, treat direct `/images/...` references as live, and only remove high-confidence duplicate files in the first cleanup pass.

### Steps
1. Keep the current behavior baseline.
   - Do not replace or remove existing Webcard lazy-loading behavior.
   - Continue treating concrete image paths referenced in HTML/CSS/JS/PHP/XML as live.
2. Run image audit (implemented).
   - Script: `scripts/image_audit_cleanup.py`
   - Default: dry run.
   - Outputs to `.audit/image-cleanup/`:
     - `00-summary.txt`
     - `01-large-files-over-500kb.tsv`
     - `02-duplicate-groups.tsv`
     - `03-unreferenced-paths.txt`
     - `04-orphan-ids.txt`
     - `05-safe-delete-candidates.txt`
     - `06-referenced-paths.txt`
3. Apply only conservative duplicate deletion.
   - Command: `./scripts/image_audit_cleanup.py --apply`
   - Safety rule: delete only unreferenced files that are byte-identical duplicates of at least one referenced file.
   - No automatic orphan-ID folder deletion in first pass.
4. Validate post-cleanup integrity.
   - Re-run dry mode and confirm referenced paths still resolve.
   - Manual smoke check on key pages:
     - homepage
     - projects and clients
     - spares and components
     - privacy
     - legal notice
5. Plan second-pass optimization only after first pass is stable.
   - Consider breakpoint consolidation for repeated brand/logo derivatives.
   - Keep crop-folder cleanup as review-driven, not blanket deletion.

### Current Baseline Metrics (Dry Run)
- Total image files: 509
- Total bytes: 68,662,142
- Files > 500KB: 39
- Duplicate groups: 116
- Unreferenced paths: 337
- Orphan IDs: 13
- Safe delete candidates: 155

### Relevant Files
- `/home/natasha/Documents/MY PROJECTS/Website Projects/Busta Refrigeration - Revamped/scripts/image_audit_cleanup.py`
- `/home/natasha/Documents/MY PROJECTS/Website Projects/Busta Refrigeration - Revamped/.audit/image-cleanup/00-summary.txt`
- `/home/natasha/Documents/MY PROJECTS/Website Projects/Busta Refrigeration - Revamped/index.html`
- `/home/natasha/Documents/MY PROJECTS/Website Projects/Busta Refrigeration - Revamped/projects-clients/index.html`
- `/home/natasha/Documents/MY PROJECTS/Website Projects/Busta Refrigeration - Revamped/spares-components/index.html`
- `/home/natasha/Documents/MY PROJECTS/Website Projects/Busta Refrigeration - Revamped/privacy/index.html`
- `/home/natasha/Documents/MY PROJECTS/Website Projects/Busta Refrigeration - Revamped/legal-notice/index.html`
- `/home/natasha/Documents/MY PROJECTS/Website Projects/Busta Refrigeration - Revamped/webcard/static/app.bundle.1773832603.js`

### Verification Checklist
1. `python3 -m py_compile scripts/image_audit_cleanup.py`
2. `./scripts/image_audit_cleanup.py`
3. Review `05-safe-delete-candidates.txt`
4. `./scripts/image_audit_cleanup.py --apply` (when approved)
5. `./scripts/image_audit_cleanup.py` again
6. Manual page-level visual validation

---

## Archived Plan: Form Submission Hardening (Completed)

The form-security hardening track is complete in code and locally verified. Remaining work for that track is live server E2E testing only.
