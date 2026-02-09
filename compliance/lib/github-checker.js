/**
 * GitHub API wrapper for compliance auditing
 * Uses `gh api` CLI for authenticated access across orgs
 */
const { execFileSync } = require('child_process');

class GitHubChecker {
  constructor(options = {}) {
    this.cache = new Map();
    this.rateLimitDelay = options.rateLimitDelay || 100;
  }

  /**
   * Execute a gh api call and return parsed JSON
   */
  ghApi(path, options = {}) {
    const cacheKey = `${path}:${JSON.stringify(options)}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

    try {
      const result = execFileSync('gh', ['api', path, '--paginate'], {
        encoding: 'utf8',
        timeout: 15000,
        stdio: ['pipe', 'pipe', 'ignore'],
      });
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
      execFileSync('gh', ['api', `repos/${repo}/contents/${filePath}`, '--jq', '.name'], {
        encoding: 'utf8',
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'ignore'],
      });
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
      const b64 = execFileSync('gh', ['api', `repos/${repo}/contents/${filePath}`, '--jq', '.content'], {
        encoding: 'utf8',
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
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
      const result = execFileSync('gh', ['api', `repos/${repo}/actions/workflows`, '--jq', '.workflows[].path'], {
        encoding: 'utf8',
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'ignore'],
      });
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
      const result = execFileSync('gh', [
        'api', `repos/${repo}/actions/workflows`,
        '--jq', '.workflows[] | "\\(.path):\\(.name)"',
      ], {
        encoding: 'utf8',
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'ignore'],
      });
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
      const result = execFileSync('gh', ['api', `repos/${repo}/branches/${branch}/protection`], {
        encoding: 'utf8',
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'ignore'],
      });
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
      const result = execFileSync('gh', [
        'run', 'list', '-R', repo,
        '--limit', String(limit),
        '--json', 'workflowName,conclusion,status,createdAt',
      ], {
        encoding: 'utf8',
        timeout: 15000,
        stdio: ['pipe', 'pipe', 'ignore'],
      });
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
