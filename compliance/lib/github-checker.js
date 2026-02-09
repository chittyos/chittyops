/**
 * GitHub API wrapper for compliance auditing
 * Uses `gh api` CLI for authenticated access across orgs
 */
const { execFileSync } = require('child_process');

class GitHubChecker {
  constructor(options = {}) {
    this.cache = new Map();
    this.rateLimitDelay = options.rateLimitDelay || 100;
    this.maxRetries = options.maxRetries || 2;
    this._callCount = 0;
  }

  /**
   * Throttle API calls to avoid secondary rate limits
   */
  _throttle() {
    this._callCount++;
    if (this._callCount % 10 === 0 && this.rateLimitDelay > 0) {
      const { execSync } = require('child_process');
      execSync(`sleep ${this.rateLimitDelay / 1000}`);
    }
  }

  /**
   * Execute gh command with retry on failure
   */
  _exec(args, options = {}) {
    const timeout = options.timeout || 15000;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        this._throttle();
        return execFileSync('gh', args, {
          encoding: 'utf8',
          timeout,
          stdio: ['pipe', 'pipe', 'ignore'],
        });
      } catch (err) {
        if (attempt < this.maxRetries) {
          const backoff = (attempt + 1) * 1000;
          const { execSync } = require('child_process');
          execSync(`sleep ${backoff / 1000}`);
          continue;
        }
        throw err;
      }
    }
  }

  /**
   * Execute a gh api call and return parsed JSON
   */
  ghApi(path, options = {}) {
    const cacheKey = `${path}:${JSON.stringify(options)}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

    try {
      const result = this._exec(['api', path, '--paginate']);
      const parsed = JSON.parse(result);
      this.cache.set(cacheKey, parsed);
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Check if a file exists in a repo
   */
  fileExists(repo, filePath) {
    try {
      this._exec(['api', `repos/${repo}/contents/${filePath}`, '--jq', '.name'], { timeout: 10000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file content from a repo
   */
  getFileContent(repo, filePath) {
    try {
      const b64 = this._exec(
        ['api', `repos/${repo}/contents/${filePath}`, '--jq', '.content'],
        { timeout: 10000 }
      ).trim();
      return Buffer.from(b64, 'base64').toString('utf8');
    } catch {
      return null;
    }
  }

  /**
   * List workflow files in a repo
   */
  listWorkflows(repo) {
    try {
      const result = this._exec(
        ['api', `repos/${repo}/actions/workflows`, '--jq', '.workflows[].path'],
        { timeout: 10000 }
      );
      return result.trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Get workflow file names for pattern matching
   */
  getWorkflowNames(repo) {
    try {
      const result = this._exec([
        'api', `repos/${repo}/actions/workflows`,
        '--jq', '.workflows[] | "\\(.path):\\(.name)"',
      ], { timeout: 10000 });
      return result.trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Check if any workflow matches a pattern (by name or file content keyword)
   */
  hasWorkflowMatching(repo, pattern) {
    const workflows = this.getWorkflowNames(repo);
    const regex = new RegExp(pattern, 'i');
    return workflows.some(w => regex.test(w));
  }

  /**
   * Check branch protection rules
   */
  getBranchProtection(repo, branch = 'main') {
    try {
      const result = this._exec(
        ['api', `repos/${repo}/branches/${branch}/protection`],
        { timeout: 10000 }
      );
      const protection = JSON.parse(result);
      return {
        enabled: true,
        requiredReviews: !!protection.required_pull_request_reviews,
        requiredStatusChecks: protection.required_status_checks?.contexts || [],
        enforceAdmins: !!protection.enforce_admins?.enabled,
        noForcePush: !protection.allow_force_pushes?.enabled,
      };
    } catch {
      return { enabled: false };
    }
  }

  /**
   * Get recent workflow run conclusions
   */
  getRecentRuns(repo, limit = 5) {
    try {
      const result = this._exec([
        'run', 'list', '-R', repo,
        '--limit', String(limit),
        '--json', 'workflowName,conclusion,status,createdAt',
      ]);
      return JSON.parse(result);
    } catch {
      return [];
    }
  }

  /**
   * Check if a package.json dependency exists
   */
  hasDependency(repo, depName) {
    const content = this.getFileContent(repo, 'package.json');
    if (!content) return { exists: false, hasPackageJson: false };

    try {
      const pkg = JSON.parse(content);
      const inDeps = !!(pkg.dependencies && pkg.dependencies[depName]);
      const inDevDeps = !!(pkg.devDependencies && pkg.devDependencies[depName]);
      return { exists: inDeps || inDevDeps, hasPackageJson: true, inDeps, inDevDeps };
    } catch {
      return { exists: false, hasPackageJson: true, parseError: true };
    }
  }
}

module.exports = { GitHubChecker };
