#!/usr/bin/env node

/**
 * ChittyOS Hook Manager Implementation
 * References @chittyfoundation/hookify contracts
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Import foundation contracts
const { HookContract, HookRegistry, HookGovernance } = require('@chittyfoundation/hookify');

class ChittyOpsHookManager {
    constructor(options = {}) {
        this.hookDir = options.hookDir || path.join(process.env.HOME, '.chitty', 'hooks');
        this.configFile = options.configFile || path.join(process.env.HOME, '.chitty', 'hooks.json');
        this.logDir = options.logDir || path.join(process.env.HOME, '.chitty', 'logs');
        
        // Foundation contracts
        this.contract = new HookContract();
        
        this.ensureDirectories();
    }

    ensureDirectories() {
        [this.hookDir, this.logDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });

        if (!fs.existsSync(this.configFile)) {
            this.saveConfig({
                version: '1.0.0',
                hooks: {},
                global_hooks: {},
                repo_hooks: {}
            });
        }
    }

    loadConfig() {
        try {
            return JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
        } catch (error) {
            console.error('Failed to load config:', error.message);
            return { hooks: {}, global_hooks: {}, repo_hooks: {} };
        }
    }

    saveConfig(config) {
        fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2));
    }

    /**
     * Register a hook - validates against foundation contract
     */
    register(hookType, hookName, scriptPath, options = {}) {
        // Create hook object
        const hook = {
            type: hookType,
            name: hookName,
            script: path.resolve(scriptPath),
            governance: {
                blocking: options.blocking ?? true,
                priority: options.priority || 50,
                scope: options.scope || 'repo',
                territory: options.territory
            },
            timeout: options.timeout
        };

        // Validate against foundation contract
        const validation = this.contract.validate(hook);
        if (!validation.valid) {
            throw new Error(`Hook validation failed: ${validation.errors.join(', ')}`);
        }

        // Validate against foundation governance policy
        const policyValidation = HookGovernance.validateAgainstPolicy(hook);
        if (!policyValidation.valid) {
            throw new Error(`Governance validation failed: ${policyValidation.errors.join(', ')}`);
        }

        // Register with foundation registry
        const registration = HookRegistry.register(hook, hook.governance);

        // Save to config
        const config = this.loadConfig();
        const hookId = registration.hookId;

        if (!config.hooks[hookId]) {
            config.hooks[hookId] = [];
        }

        hook.id = `${hookId}:${Date.now()}`;
        hook.registered = registration.registered;
        hook.contract = registration.contract;

        config.hooks[hookId].push(hook);
        this.saveConfig(config);

        this.log('register', `Registered hook: ${hookId} (validated against foundation v${registration.contract})`);

        return hook;
    }

    /**
     * Execute hooks for a given event
     */
    async execute(hookType, hookName, context = {}) {
        const hookId = `${hookType}:${hookName}`;
        const config = this.loadConfig();
        const hooks = (config.hooks[hookId] || []).filter(h => h.enabled !== false);

        if (hooks.length === 0) {
            return { success: true, results: [] };
        }

        this.log('execute', `Executing ${hooks.length} hooks for ${hookId}`);

        const results = [];
        for (const hook of hooks) {
            try {
                // Validate execution against foundation governance
                HookRegistry.validateExecution(hookId, context, hook.governance);

                const result = await this.executeHook(hook, context);
                results.push({ hook: hook.id, success: true, result });
            } catch (error) {
                results.push({ hook: hook.id, success: false, error: error.message });
                
                // Check foundation policy for blocking behavior
                const policy = HookGovernance.getPolicy(hook.type, hook.name);
                if (policy?.blocking || hook.governance.blocking) {
                    this.log('execute', `Blocking hook ${hook.id} failed, stopping execution`);
                    return { success: false, results, stoppedBy: hook.id };
                }
            }
        }

        return { success: true, results };
    }

    async executeHook(hook, context) {
        const env = {
            ...process.env,
            CHITTY_HOOK_TYPE: hook.type,
            CHITTY_HOOK_NAME: hook.name,
            CHITTY_HOOK_ID: hook.id,
            CHITTY_HOOK_CONTEXT: JSON.stringify(context),
            CHITTY_HOOK_TERRITORY: hook.governance.territory || 'none'
        };

        const logFile = path.join(this.logDir, `${hook.type}-${hook.name}.log`);
        const logStream = fs.createWriteStream(logFile, { flags: 'a' });

        logStream.write(`\n=== ${new Date().toISOString()} - ${hook.id} ===\n`);

        return new Promise((resolve, reject) => {
            try {
                // Get foundation policy timeout
                const policy = HookGovernance.getPolicy(hook.type, hook.name);
                const timeout = hook.timeout || policy?.maxTimeout || 30000;

                const output = execSync(hook.script, {
                    env,
                    encoding: 'utf8',
                    timeout,
                    stdio: ['pipe', 'pipe', 'pipe']
                });

                logStream.write(output);
                logStream.end();
                resolve(output);
            } catch (error) {
                logStream.write(`ERROR: ${error.message}\n`);
                logStream.end();
                reject(error);
            }
        });
    }

    /**
     * Sync hooks to a repository
     */
    syncToRepo(repoPath) {
        const config = this.loadConfig();
        const gitHooksDir = path.join(repoPath, '.git', 'hooks');

        if (!fs.existsSync(gitHooksDir)) {
            console.error(`Not a git repository: ${repoPath}`);
            return false;
        }

        Object.entries(config.hooks).forEach(([hookId, hookList]) => {
            const [type, name] = hookId.split(':');
            
            if (type === 'git') {
                const hookPath = path.join(gitHooksDir, name);
                const wrapperScript = this.generateGitHookWrapper(name, hookList);
                
                fs.writeFileSync(hookPath, wrapperScript, { mode: 0o755 });
                this.log('sync', `Synced ${name} to ${repoPath}`);
            }
        });

        return true;
    }

    generateGitHookWrapper(hookName, hooks) {
        const enabledHooks = hooks.filter(h => h.enabled !== false);
        
        return `#!/bin/bash
# ChittyOps Git Hook: ${hookName}
# Generated by ChittyOS/chittyops
# Governed by @chittyfoundation/hookify contracts

export CHITTY_HOOK_TYPE="git"
export CHITTY_HOOK_NAME="${hookName}"

# Execute all registered hooks
${enabledHooks.map(hook => `
echo "🔧 Running: ${hook.id}"
bash "${hook.script}" "$@"
HOOK_EXIT=$?
if [ $HOOK_EXIT -ne 0 ]; then
    echo "❌ Hook failed: ${hook.id}"
    ${hook.governance.blocking ? 'exit 1' : 'echo "⚠️  Non-blocking hook failed, continuing..."'}
fi
`).join('\n')}

exit 0
`;
    }

    log(action, message) {
        const logFile = path.join(this.logDir, 'hook-manager.log');
        const entry = `${new Date().toISOString()} [${action}] ${message}\n`;
        fs.appendFileSync(logFile, entry);
    }

    /**
     * List hooks with foundation compliance status
     */
    list(filter = {}) {
        const config = this.loadConfig();
        let hooks = [];

        Object.entries(config.hooks).forEach(([hookId, hookList]) => {
            hookList.forEach(hook => {
                // Check foundation compliance
                const validation = this.contract.validate(hook);
                const policyValidation = HookGovernance.validateAgainstPolicy(hook);
                
                hooks.push({
                    hookId,
                    ...hook,
                    foundationCompliant: validation.valid && policyValidation.valid,
                    complianceIssues: [
                        ...validation.errors,
                        ...policyValidation.errors
                    ]
                });
            });
        });

        return hooks.sort((a, b) => a.governance.priority - b.governance.priority);
    }
}

module.exports = { ChittyOpsHookManager };

// CLI execution
if (require.main === module) {
    const manager = new ChittyOpsHookManager();
    const [,, command, ...args] = process.argv;

    switch (command) {
        case 'list':
            const hooks = manager.list();
            console.log('📋 Registered Hooks (Foundation Compliant):\n');
            hooks.forEach(h => {
                const status = h.foundationCompliant ? '✅' : '⚠️';
                const enabled = h.enabled !== false ? '✓' : '✗';
                console.log(`  ${status} ${enabled} ${h.hookId}`);
                console.log(`     Script: ${h.script}`);
                console.log(`     Territory: ${h.governance.territory || 'none'}`);
                if (!h.foundationCompliant) {
                    console.log(`     ⚠️  Issues: ${h.complianceIssues.join(', ')}`);
                }
            });
            break;

        case 'sync':
            const repo = args[0] || process.cwd();
            manager.syncToRepo(repo);
            console.log(`✅ Synced hooks to ${repo}`);
            break;

        default:
            console.log('Usage: hook-manager.js [list|sync] [args]');
            console.log('\nThis manager validates all hooks against @chittyfoundation/hookify contracts.');
    }
}
