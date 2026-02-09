#!/usr/bin/env node
/**
 * ChittyOS Ecosystem Compliance Audit Engine
 *
 * Audits all services across ChittyOS and ChittyCorp organizations
 * against 7 compliance dimensions defined in checks.yml.
 *
 * Usage:
 *   node compliance/audit.js [options]
 *
 * Options:
 *   --org=ORG         Audit a specific org (CHITTYOS, ChittyCorp, or "all")
 *   --service=NAME    Audit a single service
 *   --output=FILE     Write JSON report to file
 *   --skip-runtime    Skip runtime checks (health, registry, router endpoints)
 *   --verbose         Print detailed progress
 */

const fs = require('fs');
const path = require('path');
const { GitHubChecker } = require('./lib/github-checker');
const { RuntimeChecker } = require('./lib/runtime-checker');
const { generateMarkdown } = require('./lib/report-generator');

// Simple YAML parser for the subset we use (avoids js-yaml dependency)
function parseSimpleYaml(text) {
  // Use js-yaml if available, otherwise fall back
  try {
    const yaml = require('js-yaml');
    return yaml.load(text);
  } catch {
    // Minimal fallback: parse enough to get service registry
    console.error('Warning: js-yaml not available, using JSON fallback');
    return null;
  }
}

function loadYaml(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return parseSimpleYaml(content);
}

function parseArgs(argv) {
  const args = {};
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--')) {
      const [key, val] = arg.slice(2).split('=');
      args[key] = val ?? true;
    }
  }
  return args;
}

class ComplianceAuditor {
  constructor(options = {}) {
    this.gh = new GitHubChecker();
    this.rt = new RuntimeChecker();
    this.verbose = options.verbose || false;
    this.skipRuntime = options.skipRuntime || false;
    this.registryPath = options.registryPath ||
      path.join(__dirname, 'service-registry.yml');
    this.checksPath = options.checksPath ||
      path.join(__dirname, 'checks.yml');
  }

  log(msg) {
    if (this.verbose) console.error(msg);
  }

  /**
   * Load the service registry and compliance profiles
   */
  loadRegistry() {
    const registry = loadYaml(this.registryPath);
    if (!registry) throw new Error('Failed to parse service-registry.yml');
    return registry;
  }

  /**
   * Load check definitions
   */
  loadChecks() {
    const checks = loadYaml(this.checksPath);
    if (!checks) throw new Error('Failed to parse checks.yml');
    return checks;
  }

  /**
   * Determine which checks apply to a service based on its type
   */
  getApplicableChecks(serviceType, profiles) {
    const profile = profiles[serviceType];
    if (!profile) return {};
    return profile;
  }

  /**
   * Run ChittyConnect check
   */
  checkConnect(repo) {
    const details = [];
    let pass = true;

    const hasConfig = this.gh.fileExists(repo, '.chittyconnect.yml');
    if (!hasConfig) {
      details.push('Missing .chittyconnect.yml');
      pass = false;
    }

    const hasWorkflow = this.gh.hasWorkflowMatching(repo, 'chittyconnect-sync|connect.*sync|ChittyConnect Sync');
    if (!hasWorkflow) {
      details.push('Missing ChittyConnect sync workflow');
      pass = false;
    }

    return {
      status: pass ? 'pass' : 'fail',
      reason: pass ? null : details.join('; '),
      details,
    };
  }

  /**
   * Run ChittyBeacon check
   */
  checkBeacon(repo, serviceType) {
    if (serviceType === 'documentation' || serviceType === 'org-config') {
      return { status: 'not_applicable' };
    }

    const depCheck = this.gh.hasDependency(repo, '@chittycorp/app-beacon');

    if (depCheck.exists) {
      return { status: 'pass' };
    }

    // Check for Python beacon
    const hasPyBeacon = this.gh.fileExists(repo, 'chittybeacon.py') ||
      this.gh.fileExists(repo, 'chittybeacon/__init__.py');
    if (hasPyBeacon) {
      return { status: 'pass' };
    }

    if (!depCheck.hasPackageJson) {
      // No package.json and no Python beacon -- check if beacon is in any workflow
      const hasInWorkflow = this.gh.hasWorkflowMatching(repo, 'beacon|ChittyBeacon');
      if (hasInWorkflow) return { status: 'pass' };
      return { status: 'fail', reason: 'No beacon integration found', details: ['No package.json, no Python beacon, no beacon workflow'] };
    }

    return { status: 'fail', reason: '@chittycorp/app-beacon not in package.json' };
  }

  /**
   * Run ChittyCanon check
   */
  checkCanon(repo) {
    const details = [];
    const requiredFiles = ['CLAUDE.md', 'CODEOWNERS', 'CHARTER.md'];
    let score = 0;

    for (const file of requiredFiles) {
      if (this.gh.fileExists(repo, file)) {
        score++;
      } else {
        details.push(`Missing ${file}`);
      }
    }

    const protection = this.gh.getBranchProtection(repo, 'main');
    if (!protection.enabled) {
      details.push('No branch protection on main');
    } else {
      score += 0.5; // Partial credit for having protection
      if (protection.requiredReviews) score += 0.25;
      if (protection.noForcePush) score += 0.25;
    }

    const pass = details.length === 0;
    return {
      status: pass ? 'pass' : 'fail',
      reason: pass ? null : details.join('; '),
      details,
      score: `${score}/${requiredFiles.length + 1}`,
    };
  }

  /**
   * Run ChittyRegister check
   */
  async checkRegister(repo, serviceName) {
    const details = [];
    let pass = true;

    // Check for registry heartbeat in workflows
    const hasRegistryInWorkflow = this.gh.hasWorkflowMatching(repo, 'registry\\.chitty\\.cc|ChittyRegistry|Register');
    if (!hasRegistryInWorkflow) {
      details.push('No registry heartbeat in workflows');
      pass = false;
    }

    // Runtime check
    if (!this.skipRuntime) {
      const regCheck = await this.rt.checkRegistry(serviceName);
      if (regCheck.status === 'fail') {
        details.push(`Registry probe failed: ${regCheck.reason}`);
        pass = false;
      }
    }

    return {
      status: pass ? 'pass' : 'fail',
      reason: pass ? null : details.join('; '),
      details,
    };
  }

  /**
   * Run ChittyRouter check
   */
  async checkRouter(domain) {
    if (!domain) return { status: 'not_applicable', reason: 'no domain' };

    if (this.skipRuntime) {
      return { status: 'skip', reason: 'runtime checks skipped' };
    }

    return await this.rt.checkRouter(domain);
  }

  /**
   * Run ChittyTrust/ChittyCert check
   */
  checkTrust(repo) {
    const content = this.gh.getFileContent(repo, '.chittyconnect.yml');
    if (!content) {
      return { status: 'fail', reason: 'No .chittyconnect.yml to verify trust chain' };
    }

    const details = [];
    const requiredProvisions = ['chitty_id', 'service_token', 'certificate', 'trust_chain'];
    let pass = true;

    for (const provision of requiredProvisions) {
      if (!content.includes(provision)) {
        details.push(`Missing onboarding provision: ${provision}`);
        pass = false;
      }
    }

    if (!content.includes('chittyauth')) {
      details.push('Auth provider not set to chittyauth');
      pass = false;
    }

    return {
      status: pass ? 'pass' : 'fail',
      reason: pass ? null : details.join('; '),
      details,
    };
  }

  /**
   * Run Health Endpoint check
   */
  async checkHealth(domain) {
    if (!domain) return { status: 'not_applicable', reason: 'no domain' };

    if (this.skipRuntime) {
      return { status: 'skip', reason: 'runtime checks skipped' };
    }

    return await this.rt.checkHealth(domain);
  }

  /**
   * Audit a single service across all applicable dimensions
   */
  async auditService(name, config, profiles) {
    const { repo, type, domain, active, tier } = config;

    if (!active) {
      return { ...config, checks: {}, skipped: true, reason: 'inactive/archived' };
    }

    this.log(`  Auditing ${repo} (tier ${tier}, type ${type})...`);

    const applicability = this.getApplicableChecks(type, profiles);
    const checks = {};

    // ChittyConnect
    if (applicability.chittyconnect === 'required' || applicability.chittyconnect === 'optional') {
      checks.chittyconnect = this.checkConnect(repo);
      if (applicability.chittyconnect === 'optional' && checks.chittyconnect.status === 'fail') {
        checks.chittyconnect.status = 'skip';
        checks.chittyconnect.reason = 'optional, not configured';
      }
    } else {
      checks.chittyconnect = { status: 'not_applicable' };
    }

    // ChittyBeacon
    if (applicability.chittybeacon === 'required' || applicability.chittybeacon === 'optional') {
      checks.chittybeacon = this.checkBeacon(repo, type);
      if (applicability.chittybeacon === 'optional' && checks.chittybeacon.status === 'fail') {
        checks.chittybeacon.status = 'skip';
        checks.chittybeacon.reason = 'optional, not configured';
      }
    } else {
      checks.chittybeacon = { status: 'not_applicable' };
    }

    // ChittyCanon
    if (applicability.chittycanon === 'required') {
      checks.chittycanon = this.checkCanon(repo);
    } else {
      checks.chittycanon = { status: 'not_applicable' };
    }

    // ChittyRegister
    if (applicability.chittyregister === 'required' || applicability.chittyregister === 'optional') {
      checks.chittyregister = await this.checkRegister(repo, name);
      if (applicability.chittyregister === 'optional' && checks.chittyregister.status === 'fail') {
        checks.chittyregister.status = 'skip';
      }
    } else {
      checks.chittyregister = { status: 'not_applicable' };
    }

    // ChittyRouter
    if (applicability.chittyrouter === 'required') {
      checks.chittyrouter = await this.checkRouter(domain);
    } else {
      checks.chittyrouter = { status: 'not_applicable' };
    }

    // ChittyTrust
    if (applicability.chittytrust === 'required' || applicability.chittytrust === 'optional') {
      checks.chittytrust = this.checkTrust(repo);
      if (applicability.chittytrust === 'optional' && checks.chittytrust.status === 'fail') {
        checks.chittytrust.status = 'skip';
      }
    } else {
      checks.chittytrust = { status: 'not_applicable' };
    }

    // Health Endpoint
    if (applicability.health_endpoint === 'required') {
      checks.health_endpoint = await this.checkHealth(domain);
    } else {
      checks.health_endpoint = { status: 'not_applicable' };
    }

    return { ...config, checks, skipped: false };
  }

  /**
   * Run the full audit
   */
  async run(options = {}) {
    const registry = this.loadRegistry();
    const profiles = registry.compliance_profiles;

    const report = {
      timestamp: new Date().toISOString(),
      schema_version: registry.schema_version,
      organizations: {},
      summary: { total: 0, fullPass: 0, partial: 0, fail: 0, skipped: 0, orgCount: 0 },
    };

    const orgFilter = options.org && options.org !== 'all' ? options.org : null;
    const serviceFilter = options.service || null;

    for (const [orgName, orgData] of Object.entries(registry.organizations)) {
      if (orgFilter && orgName !== orgFilter) continue;

      this.log(`\nAuditing ${orgName}...`);
      report.summary.orgCount++;
      report.organizations[orgName] = { services: {} };

      for (const [svcName, svcConfig] of Object.entries(orgData.services)) {
        if (serviceFilter && svcName !== serviceFilter) continue;

        report.summary.total++;

        const result = await this.auditService(svcName, svcConfig, profiles);
        report.organizations[orgName].services[svcName] = result;

        if (result.skipped) {
          report.summary.skipped++;
          continue;
        }

        // Compute score
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
    report.summary.complianceRate = audited > 0
      ? Math.round((report.summary.fullPass / audited) * 100)
      : 0;

    return report;
  }
}

// CLI entry point
async function main() {
  const args = parseArgs(process.argv);

  const auditor = new ComplianceAuditor({
    verbose: !!args.verbose,
    skipRuntime: !!args['skip-runtime'],
  });

  console.error('ChittyOS Ecosystem Compliance Audit');
  console.error('====================================');
  console.error(`Org filter: ${args.org || 'all'}`);
  console.error(`Service filter: ${args.service || 'all'}`);
  console.error(`Skip runtime: ${!!args['skip-runtime']}`);
  console.error('');

  const report = await auditor.run({
    org: args.org,
    service: args.service,
  });

  // Output JSON
  if (args.output) {
    fs.writeFileSync(args.output, JSON.stringify(report, null, 2));
    console.error(`\nJSON report written to ${args.output}`);
  }

  // Always output markdown summary to stderr
  const markdown = generateMarkdown(report);
  if (args.markdown) {
    fs.writeFileSync(args.markdown, markdown);
    console.error(`Markdown report written to ${args.markdown}`);
  }

  // Print summary
  console.error('\n--- Summary ---');
  console.error(`Total services: ${report.summary.total}`);
  console.error(`Fully compliant: ${report.summary.fullPass}`);
  console.error(`Partially compliant: ${report.summary.partial}`);
  console.error(`Non-compliant: ${report.summary.fail}`);
  console.error(`Skipped: ${report.summary.skipped}`);
  console.error(`Compliance rate: ${report.summary.complianceRate}%`);

  // Write JSON to stdout for piping
  if (!args.output) {
    console.log(JSON.stringify(report, null, 2));
  }

  // Exit with non-zero if compliance is below threshold
  const threshold = parseInt(args.threshold || '0', 10);
  if (report.summary.complianceRate < threshold) {
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Audit failed:', err.message);
    process.exit(2);
  });
}

module.exports = { ComplianceAuditor };
