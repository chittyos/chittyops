#!/usr/bin/env node
/**
 * Compliance report generator
 * Produces Markdown dashboard from JSON audit results
 *
 * Usage: node report-generator.js <audit-report.json> [--output=report.md]
 */

const fs = require('fs');
const path = require('path');

function generateMarkdown(report) {
  const lines = [];
  const now = new Date().toISOString().replace('T', ' ').split('.')[0] + ' UTC';

  lines.push('# ChittyOS Ecosystem Compliance Dashboard');
  lines.push(`\n> Last updated: ${now}`);
  lines.push(`> Audited: ${report.summary.total} services across ${report.summary.orgCount} organizations`);
  lines.push('');

  // Summary stats
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total services audited | ${report.summary.total} |`);
  lines.push(`| Fully compliant | ${report.summary.fullPass} |`);
  lines.push(`| Partially compliant | ${report.summary.partial} |`);
  lines.push(`| Non-compliant | ${report.summary.fail} |`);
  lines.push(`| Skipped (inactive/archived) | ${report.summary.skipped} |`);
  lines.push(`| Overall compliance rate | ${report.summary.complianceRate}% |`);
  lines.push('');

  // Per-org tables
  for (const [orgName, orgData] of Object.entries(report.organizations)) {
    lines.push(`## ${orgName}`);
    lines.push('');
    lines.push('| Service | Tier | Connect | Beacon | Canon | Register | Router | Trust | Health | Score |');
    lines.push('|---------|------|---------|--------|-------|----------|--------|-------|--------|-------|');

    const services = Object.entries(orgData.services)
      .sort((a, b) => (a[1].tier ?? 99) - (b[1].tier ?? 99));

    for (const [name, svc] of services) {
      if (!svc.active) continue;

      const tier = svc.tier != null ? svc.tier : '-';
      const checks = svc.checks || {};
      const cols = [
        statusIcon(checks.chittyconnect),
        statusIcon(checks.chittybeacon),
        statusIcon(checks.chittycanon),
        statusIcon(checks.chittyregister),
        statusIcon(checks.chittyrouter),
        statusIcon(checks.chittytrust),
        statusIcon(checks.health_endpoint),
      ];

      const applicable = Object.values(checks).filter(c => c && c.status !== 'not_applicable');
      const passed = applicable.filter(c => c.status === 'pass').length;
      const score = applicable.length > 0 ? `${passed}/${applicable.length}` : 'N/A';

      lines.push(`| ${name} | ${tier} | ${cols.join(' | ')} | ${score} |`);
    }
    lines.push('');
  }

  // Failing checks detail
  lines.push('## Non-Compliant Services Detail');
  lines.push('');

  for (const [orgName, orgData] of Object.entries(report.organizations)) {
    for (const [name, svc] of Object.entries(orgData.services)) {
      if (!svc.active) continue;
      const checks = svc.checks || {};
      const failures = Object.entries(checks)
        .filter(([, c]) => c && c.status === 'fail');

      if (failures.length === 0) continue;

      lines.push(`### ${orgName}/${name}`);
      for (const [dim, check] of failures) {
        lines.push(`- **${dim}**: ${check.reason || 'Check failed'}`);
        if (check.details) {
          for (const detail of check.details) {
            lines.push(`  - ${detail}`);
          }
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

function statusIcon(check) {
  if (!check) return '?';
  switch (check.status) {
    case 'pass': return 'PASS';
    case 'fail': return 'FAIL';
    case 'not_applicable': return 'N/A';
    case 'skip': return 'SKIP';
    default: return '?';
  }
}

function generateJson(report) {
  return JSON.stringify(report, null, 2);
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const inputFile = args.find(a => !a.startsWith('--'));

  if (!inputFile) {
    console.error('Usage: node report-generator.js <audit-report.json> [--output=report.md]');
    process.exit(1);
  }

  const report = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const markdown = generateMarkdown(report);

  const outputArg = args.find(a => a.startsWith('--output='));
  if (outputArg) {
    const outputFile = outputArg.split('=')[1];
    fs.writeFileSync(outputFile, markdown);
    console.error(`Report written to ${outputFile}`);
  } else {
    console.log(markdown);
  }
}

module.exports = { generateMarkdown, generateJson };
