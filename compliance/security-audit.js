#!/usr/bin/env node
/**
 * ChittyOS Org-Wide Security Mapping Audit Engine
 *
 * Audits all repos across the full org scope (chittyos, chittyapps,
 * chittyfoundation, chittycorp, furnished-condos) against 6 security
 * dimensions (WS1–WS6) defined in security-checks.yml.
 *
 * Linked to: Org-wide Security Mapping Initiative
 * Workstreams: WS1 Inventory, WS2 Identity, WS3 CI/CD, WS4 Runtime,
 *              WS5 Threats, WS6 Remediation
 *
 * Usage:
 *   node compliance/security-audit.js [options]
 *
 * Options:
 *   --org=ORG         Audit a specific org (or "all")
 *   --service=NAME    Audit a single service by registry key
 *   --output=FILE     Write JSON report to file
 *   --markdown=FILE   Write Markdown report to file
 *   --skip-runtime    Skip live HTTP health checks
 *   --verbose         Print detailed progress
 */

'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { GitHubChecker } = require('./lib/github-checker');
const { RuntimeChecker } = require('./lib/runtime-checker');

// Default tier assigned when a service has no explicit tier (infra/org-config entries).
// Used for severity and blast-radius calculations; must be the numerically highest tier.
const DEFAULT_TIER = 5;

// ─── helpers ────────────────────────────────────────────────────────────────

function loadYaml(filePath) {
  return yaml.load(fs.readFileSync(filePath, 'utf8'));
}

function parseArgs(argv) {
  const args = { _positional: [] };
  const rawArgs = argv.slice(2);
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg.startsWith('--')) {
      const eqIndex = arg.indexOf('=');
      if (eqIndex !== -1) {
        args[arg.slice(2, eqIndex)] = arg.slice(eqIndex + 1);
      } else {
        const key = arg.slice(2);
        if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('--')) {
          args[key] = rawArgs[i + 1];
          i++;
        } else {
          args[key] = true;
        }
      }
    } else {
      args._positional.push(arg);
    }
  }
  return args;
}

// ─── SecurityAuditor ────────────────────────────────────────────────────────

class SecurityAuditor {
  constructor(options = {}) {
    this.gh = new GitHubChecker();
    this.rt = new RuntimeChecker();
    this.verbose = options.verbose || false;
    this.skipRuntime = options.skipRuntime || false;
    this.registryPath = options.registryPath ||
      path.join(__dirname, 'service-registry.yml');
    this.securityChecksPath = options.securityChecksPath ||
      path.join(__dirname, 'security-checks.yml');
  }

  log(msg) {
    if (this.verbose) console.error(msg);
  }

  loadRegistry() {
    const registry = loadYaml(this.registryPath);
    if (!registry) throw new Error('Failed to parse service-registry.yml');
    return registry;
  }

  loadSecurityChecks() {
    const checks = loadYaml(this.securityChecksPath);
    if (!checks) throw new Error('Failed to parse security-checks.yml');
    return checks;
  }

  // ── WS1: Asset Inventory ────────────────────────────────────────────────

  checkWs1Inventory(repo, svcConfig) {
    const details = [];
    let pass = true;

    // Branch protection
    const bp = this.gh.getBranchProtection(repo, 'main');
    if (!bp.enabled) {
      details.push('No branch protection on main');
      pass = false;
    }

    // CODEOWNERS
    if (!this.gh.fileExists(repo, 'CODEOWNERS')) {
      details.push('Missing CODEOWNERS');
      pass = false;
    }

    // Tier and description in registry config (already present if we got here)
    if (svcConfig.description == null || svcConfig.description === '') {
      details.push('Missing description in service registry');
      pass = false;
    }

    return {
      status: pass ? 'pass' : 'fail',
      reason: pass ? null : details.join('; '),
      details,
    };
  }

  // ── WS2: Identity & Secrets Mapping ─────────────────────────────────────

  checkWs2Identity(repo) {
    const details = [];
    let pass = true;

    // Secret-scanning tool in CI
    const hasSecretScan = this.gh.hasWorkflowMatching(
      repo,
      'trufflehog|gitleaks|secret[- ]?scan'
    );
    if (!hasSecretScan) {
      details.push('No secret-scanning tool (TruffleHog/Gitleaks) in CI workflows');
      pass = false;
    }

    // Secret catalog
    if (!this.gh.fileExists(repo, '.github/secret-catalog.json')) {
      details.push('Missing .github/secret-catalog.json');
      pass = false;
    }

    return {
      status: pass ? 'pass' : 'fail',
      reason: pass ? null : details.join('; '),
      details,
    };
  }

  // ── WS3: CI/CD Controls ──────────────────────────────────────────────────

  checkWs3Cicd(repo) {
    const details = [];
    let pass = true;

    // SAST (CodeQL)
    const hasSast = this.gh.hasWorkflowMatching(repo, 'codeql|CodeQL');
    if (!hasSast) {
      details.push('No SAST (CodeQL) workflow found');
      pass = false;
    }

    // SCA (Dependabot/Snyk/npm audit)
    const hasSca = this.gh.hasWorkflowMatching(
      repo,
      'npm audit|pnpm audit|snyk|dependabot'
    );
    if (!hasSca) {
      details.push('No SCA (Dependabot/Snyk/npm audit) workflow found');
      pass = false;
    }

    // Dependabot config
    if (!this.gh.fileExists(repo, '.github/dependabot.yml')) {
      details.push('Missing .github/dependabot.yml');
      pass = false;
    }

    // Required status checks
    const bp = this.gh.getBranchProtection(repo, 'main');
    if (!bp.enabled || !bp.requiredStatusChecks || bp.requiredStatusChecks.length === 0) {
      details.push('No required status checks enforced on main');
      pass = false;
    }

    return {
      status: pass ? 'pass' : 'fail',
      reason: pass ? null : details.join('; '),
      details,
    };
  }

  // ── WS4: Runtime & Data-Plane Hardening ─────────────────────────────────

  async checkWs4Runtime(repo, svcConfig) {
    const { type, domain } = svcConfig;
    const details = [];
    let pass = true;

    if (type !== 'cloudflare-worker') {
      return { status: 'not_applicable', reason: `type is ${type || 'unknown'}` };
    }

    if (!domain) {
      return { status: 'fail', reason: 'cloudflare-worker has no domain configured', details: ['Missing domain in service registry'] };
    }

    // Wrangler config
    const hasWrangler =
      this.gh.fileExists(repo, 'wrangler.jsonc') ||
      this.gh.fileExists(repo, 'wrangler.toml');
    if (!hasWrangler) {
      details.push('No wrangler.jsonc or wrangler.toml found');
      pass = false;
    }

    // Live health check
    if (!this.skipRuntime) {
      const healthResult = await this.rt.checkHealth(domain);
      if (healthResult.status !== 'pass') {
        details.push(`Health endpoint check failed: ${healthResult.reason || 'no detail'}`);
        pass = false;
      }
    } else {
      details.push('runtime checks skipped');
    }

    return {
      status: pass ? 'pass' : 'fail',
      reason: pass ? null : details.join('; '),
      details,
    };
  }

  // ── WS5: Threat Scenarios & Auth Boundaries ──────────────────────────────

  checkWs5Threats(repo, svcConfig) {
    const { type } = svcConfig;
    const details = [];
    let pass = true;

    // Only applies to services that use chittyconnect (workers + tools with trust chain)
    if (type === 'documentation' || type === 'org-config') {
      return { status: 'not_applicable', reason: `type is ${type}` };
    }

    const connectContent = this.gh.getFileContent(repo, '.chittyconnect.yml');
    if (!connectContent) {
      return { status: 'fail', reason: 'No .chittyconnect.yml — auth boundary undeclared', details: ['Missing .chittyconnect.yml'] };
    }

    if (!connectContent.includes('chittyauth')) {
      details.push('Auth provider not set to chittyauth');
      pass = false;
    }

    if (!connectContent.includes('service_token')) {
      details.push('service_token not in onboarding provisions');
      pass = false;
    }

    if (!connectContent.includes('trust_chain')) {
      details.push('trust_chain not in onboarding provisions');
      pass = false;
    }

    return {
      status: pass ? 'pass' : 'fail',
      reason: pass ? null : details.join('; '),
      details,
    };
  }

  // ── WS6: Remediation & Closure Evidence ─────────────────────────────────

  checkWs6Remediation(repo) {
    const details = [];
    let pass = true;

    // Compliance/security audit workflow
    const hasAuditWorkflow = this.gh.hasWorkflowMatching(
      repo,
      'compliance.*audit|ecosystem.*audit|security.*audit|security.?map'
    );
    if (!hasAuditWorkflow) {
      details.push('No compliance or security audit workflow found');
      pass = false;
    }

    return {
      status: pass ? 'pass' : 'fail',
      reason: pass ? null : details.join('; '),
      details,
    };
  }

  // ── Per-service audit ────────────────────────────────────────────────────

  async auditService(name, svcConfig) {
    const { repo, active, type } = svcConfig;

    if (!active) {
      return { ...svcConfig, checks: {}, skipped: true, reason: 'inactive/archived' };
    }

    this.log(`  [security] ${repo} (type: ${type})`);

    const checks = {};
    checks.ws1_inventory = this.checkWs1Inventory(repo, svcConfig);
    checks.ws2_identity = this.checkWs2Identity(repo);
    checks.ws3_cicd = this.checkWs3Cicd(repo);
    checks.ws4_runtime = await this.checkWs4Runtime(repo, svcConfig);
    checks.ws5_threats = this.checkWs5Threats(repo, svcConfig);
    checks.ws6_remediation = this.checkWs6Remediation(repo);

    return { ...svcConfig, checks, skipped: false };
  }

  // ── Full audit run ───────────────────────────────────────────────────────

  async run(options = {}) {
    const registry = this.loadRegistry();
    const securityChecks = this.loadSecurityChecks();

    const report = {
      timestamp: new Date().toISOString(),
      schema_version: registry.schema_version,
      security_checks_version: securityChecks.schema_version,
      scope: 'org-wide-security-mapping',
      organizations: {},
      summary: {
        total: 0,
        fullPass: 0,
        partial: 0,
        fail: 0,
        skipped: 0,
        orgCount: 0,
        securityRate: 0,
      },
    };

    const orgFilter = options.org && options.org !== 'all' ? options.org : null;
    // serviceFilter matches against the registry key (e.g. "chittyops"), not the repo path.
    // Use `--service=<registry-key>` on the CLI.
    const serviceFilter = options.service || null;

    for (const [orgName, orgData] of Object.entries(registry.organizations)) {
      if (orgFilter && orgName !== orgFilter) continue;

      this.log(`\n[security] Auditing ${orgName}...`);
      report.summary.orgCount++;
      report.organizations[orgName] = { services: {} };

      for (const [svcName, svcConfig] of Object.entries(orgData.services)) {
        if (serviceFilter && svcName !== serviceFilter) continue;

        report.summary.total++;
        const result = await this.auditService(svcName, svcConfig);
        report.organizations[orgName].services[svcName] = result;

        if (result.skipped) {
          report.summary.skipped++;
          continue;
        }

        const applicable = Object.values(result.checks)
          .filter(c => c.status !== 'not_applicable' && c.status !== 'skip');
        const passed = applicable.filter(c => c.status === 'pass').length;

        if (passed === applicable.length && applicable.length > 0) {
          report.summary.fullPass++;
        } else if (passed > 0) {
          report.summary.partial++;
        } else {
          report.summary.fail++;
        }
      }
    }

    const audited = report.summary.total - report.summary.skipped;
    report.summary.securityRate = audited > 0
      ? Math.round((report.summary.fullPass / audited) * 100)
      : 0;

    return report;
  }
}

// ─── Markdown report generator ───────────────────────────────────────────────

function generateSecurityMarkdown(report) {
  const lines = [];
  const now = new Date().toISOString().replace('T', ' ').split('.')[0] + ' UTC';

  lines.push('# ChittyOS Org-Wide Security Mapping Report');
  lines.push('');
  lines.push(`> Generated: ${now}`);
  lines.push(`> Scope: ${report.scope}`);
  lines.push(`> Audited: ${report.summary.total} services across ${report.summary.orgCount} organizations`);
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total services | ${report.summary.total} |`);
  lines.push(`| Fully secure | ${report.summary.fullPass} |`);
  lines.push(`| Partially secure | ${report.summary.partial} |`);
  lines.push(`| Security gaps | ${report.summary.fail} |`);
  lines.push(`| Skipped (inactive) | ${report.summary.skipped} |`);
  lines.push(`| Security coverage rate | ${report.summary.securityRate}% |`);
  lines.push('');

  const wsLabels = {
    ws1_inventory: 'WS1 Inventory',
    ws2_identity:  'WS2 Identity',
    ws3_cicd:      'WS3 CI/CD',
    ws4_runtime:   'WS4 Runtime',
    ws5_threats:   'WS5 Threats',
    ws6_remediation: 'WS6 Remediation',
  };

  for (const [orgName, orgData] of Object.entries(report.organizations)) {
    lines.push(`## ${orgName}`);
    lines.push('');
    lines.push('| Service | Tier | WS1 Inv | WS2 Id | WS3 CI/CD | WS4 RT | WS5 Auth | WS6 Remed | Score |');
    lines.push('|---------|------|---------|--------|-----------|--------|----------|-----------|-------|');

    const services = Object.entries(orgData.services)
      .sort((a, b) => (a[1].tier ?? 99) - (b[1].tier ?? 99));

    for (const [name, svc] of services) {
      if (!svc.active) continue;

      const tier = svc.tier != null ? svc.tier : '-';
      const checks = svc.checks || {};

      const cols = [
        statusIcon(checks.ws1_inventory),
        statusIcon(checks.ws2_identity),
        statusIcon(checks.ws3_cicd),
        statusIcon(checks.ws4_runtime),
        statusIcon(checks.ws5_threats),
        statusIcon(checks.ws6_remediation),
      ];

      const applicable = Object.values(checks)
        .filter(c => c && c.status !== 'not_applicable' && c.status !== 'skip');
      const passed = applicable.filter(c => c.status === 'pass').length;
      const score = applicable.length > 0 ? `${passed}/${applicable.length}` : 'N/A';

      lines.push(`| ${name} | ${tier} | ${cols.join(' | ')} | ${score} |`);
    }
    lines.push('');
  }

  // Risk register section — list all failing checks with severity hints
  lines.push('## Risk Register');
  lines.push('');
  lines.push('> P0 = Critical (≤24h), P1 = High (≤7d), P2 = Medium (≤30d)');
  lines.push('');
  lines.push('| Repo | Dimension | Finding | Severity | Blast Radius |');
  lines.push('|------|-----------|---------|----------|--------------|');

  for (const [orgName, orgData] of Object.entries(report.organizations)) {
    for (const [name, svc] of Object.entries(orgData.services)) {
      if (!svc.active || svc.skipped) continue;
      const checks = svc.checks || {};

      for (const [dim, check] of Object.entries(checks)) {
        if (!check || check.status !== 'fail') continue;

        const severity = riskSeverity(dim, svc.tier);
        const blastRadius = blastRadiusLabel(svc.tier, svc.type);
        const finding = check.reason || 'Control gap detected';
        const repo = svc.repo || `${orgName}/${name}`;

        lines.push(`| ${repo} | ${wsLabels[dim] || dim} | ${finding} | ${severity} | ${blastRadius} |`);
      }
    }
  }
  lines.push('');

  // Workstream dimension summary
  lines.push('## Control Matrix by Dimension');
  lines.push('');
  for (const [dim, label] of Object.entries(wsLabels)) {
    let pass = 0, fail = 0, na = 0;
    for (const orgData of Object.values(report.organizations)) {
      for (const svc of Object.values(orgData.services)) {
        if (!svc.active || svc.skipped) continue;
        const check = (svc.checks || {})[dim];
        if (!check) continue;
        if (check.status === 'pass') pass++;
        else if (check.status === 'fail') fail++;
        else na++;
      }
    }
    lines.push(`- **${label}**: ${pass} PASS / ${fail} FAIL / ${na} N/A`);
  }
  lines.push('');

  return lines.join('\n');
}

function statusIcon(check) {
  if (!check) return '?';
  switch (check.status) {
    case 'pass':           return 'PASS';
    case 'fail':           return 'FAIL';
    case 'not_applicable': return 'N/A';
    case 'skip':           return 'SKIP';
    default:               return '?';
  }
}

/**
 * Assign a severity label based on the failing dimension and service tier.
 * Higher-tier services (lower number) that fail identity/CI checks are P0/P1.
 */
function riskSeverity(dimension, tier) {
  const criticalDims = ['ws2_identity', 'ws3_cicd', 'ws5_threats'];
  const tierNum = tier == null ? DEFAULT_TIER : Number(tier);

  if (criticalDims.includes(dimension) && tierNum <= 2) return 'P0';
  if (criticalDims.includes(dimension)) return 'P1';
  if (dimension === 'ws1_inventory' && tierNum <= 1) return 'P1';
  return 'P2';
}

function blastRadiusLabel(tier, type) {
  if (type === 'org-config') return 'Organization';
  const tierNum = tier == null ? DEFAULT_TIER : Number(tier);
  if (tierNum <= 1) return 'Ecosystem-wide';
  if (tierNum <= 3) return 'Platform-wide';
  return 'Domain/Application';
}

// ─── CLI entry point ─────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  const auditor = new SecurityAuditor({
    verbose: !!args.verbose,
    skipRuntime: !!args['skip-runtime'],
  });

  console.error('ChittyOS Org-Wide Security Mapping Audit');
  console.error('=========================================');
  console.error(`Org filter:     ${args.org || 'all'}`);
  console.error(`Service filter: ${args.service || 'all'}`);
  console.error(`Skip runtime:   ${!!args['skip-runtime']}`);
  console.error('');

  const report = await auditor.run({ org: args.org, service: args.service });

  const markdown = generateSecurityMarkdown(report);

  if (args.output) {
    fs.writeFileSync(args.output, JSON.stringify(report, null, 2));
    console.error(`JSON report written to ${args.output}`);
  }

  if (args.markdown) {
    fs.writeFileSync(args.markdown, markdown);
    console.error(`Markdown report written to ${args.markdown}`);
  }

  console.error('\n--- Security Summary ---');
  console.error(`Total services:     ${report.summary.total}`);
  console.error(`Fully secure:       ${report.summary.fullPass}`);
  console.error(`Partially secure:   ${report.summary.partial}`);
  console.error(`Security gaps:      ${report.summary.fail}`);
  console.error(`Skipped:            ${report.summary.skipped}`);
  console.error(`Security rate:      ${report.summary.securityRate}%`);

  if (!args.output) {
    console.log(JSON.stringify(report, null, 2));
  }

  const threshold = parseInt(args.threshold || '0', 10);
  if (report.summary.securityRate < threshold) {
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Security audit failed:', err.message);
    process.exit(2);
  });
}

module.exports = { SecurityAuditor, generateSecurityMarkdown, riskSeverity, blastRadiusLabel };
