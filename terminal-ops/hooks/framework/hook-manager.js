#!/usr/bin/env node

/**
 * ChittyOps Hook Manager
 * Universal hook lifecycle management for git hooks, terminal hooks, and custom automation
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class HookManager {
    constructor(options = {}) {
        this.hookDir = options.hookDir || path.join(process.env.HOME, '.chitty', 'hooks');
        this.configFile = options.configFile || path.join(process.env.HOME, '.chitty', 'hooks.json');
        this.logDir = options.logDir || path.join(process.env.HOME, '.chitty', 'logs');
        
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
     * Register a hook
     * @param {string} hookType - git, terminal, custom
     * @param {string} hookName - pre-commit, session-start, etc
     * @param {string} scriptPath - Path to hook script
     * @param {object} options - Additional options
     */
    register(hookType, hookName, scriptPath, options = {}) {
        const config = this.loadConfig();
        const hookId = `${hookType}:${hookName}`;

        if (!config.hooks[hookId]) {
            config.hooks[hookId] = [];
        }

        const hook = {
            id: `${hookId}:${Date.now()}`,
            type: hookType,
            name: hookName,
            script: path.resolve(scriptPath),
            enabled: true,
            scope: options.scope || 'global', // global, repo, project
            repos: options.repos || [],
            priority: options.priority || 50,
            created: new Date().toISOString(),
            ...options
        };

        config.hooks[hookId].push(hook);
        
        // Add to appropriate scope
        if (hook.scope === 'global') {
            if (!config.global_hooks[hookId]) {
                config.global_hooks[hookId] = [];
            }
            config.global_hooks[hookId].push(hook.id);
        }

        this.saveConfig(config);
        this.log('register', `Registered hook: ${hookId} (${hook.id})`);

        return hook;
    }

    /**
     * Unregister a hook
     */
    unregister(hookId, scriptPath = null) {
        const config = this.loadConfig();
        
        if (config.hooks[hookId]) {
            if (scriptPath) {
                config.hooks[hookId] = config.hooks[hookId].filter(h => h.script !== path.resolve(scriptPath));
            } else {
                delete config.hooks[hookId];
            }
        }

        this.saveConfig(config);
        this.log('unregister', `Unregistered hook: ${hookId}`);
    }

    /**
     * Enable/disable a hook
     */
    toggle(hookId, enabled) {
        const config = this.loadConfig();
        
        if (config.hooks[hookId]) {
            config.hooks[hookId].forEach(hook => {
                hook.enabled = enabled;
            });
            this.saveConfig(config);
            this.log('toggle', `${enabled ? 'Enabled' : 'Disabled'} hook: ${hookId}`);
        }
    }

    /**
     * List all hooks
     */
    list(filter = {}) {
        const config = this.loadConfig();
        let hooks = [];

        Object.entries(config.hooks).forEach(([hookId, hookList]) => {
            hookList.forEach(hook => {
                if (this.matchesFilter(hook, filter)) {
                    hooks.push({ hookId, ...hook });
                }
            });
        });

        return hooks.sort((a, b) => a.priority - b.priority);
    }

    matchesFilter(hook, filter) {
        if (filter.type && hook.type !== filter.type) return false;
        if (filter.enabled !== undefined && hook.enabled !== filter.enabled) return false;
        if (filter.scope && hook.scope !== filter.scope) return false;
        return true;
    }

    /**
     * Execute hooks for a given event
     */
    async execute(hookType, hookName, context = {}) {
        const hookId = `${hookType}:${hookName}`;
        const config = this.loadConfig();
        const hooks = (config.hooks[hookId] || []).filter(h => h.enabled);

        if (hooks.length === 0) {
            return { success: true, results: [] };
        }

        this.log('execute', `Executing ${hooks.length} hooks for ${hookId}`);

        const results = [];
        for (const hook of hooks) {
            try {
                const result = await this.executeHook(hook, context);
                results.push({ hook: hook.id, success: true, result });
            } catch (error) {
                results.push({ hook: hook.id, success: false, error: error.message });
                
                // If hook is blocking and fails, stop execution
                if (hook.blocking) {
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
            CHITTY_HOOK_CONTEXT: JSON.stringify(context)
        };

        const logFile = path.join(this.logDir, `${hook.type}-${hook.name}.log`);
        const logStream = fs.createWriteStream(logFile, { flags: 'a' });

        logStream.write(`\n=== ${new Date().toISOString()} - ${hook.id} ===\n`);

        return new Promise((resolve, reject) => {
            try {
                const output = execSync(hook.script, {
                    env,
                    encoding: 'utf8',
                    timeout: hook.timeout || 30000,
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
        const enabledHooks = hooks.filter(h => h.enabled);
        
        return `#!/bin/bash
# ChittyOps Git Hook: ${hookName}
# Auto-generated wrapper - DO NOT EDIT

export CHITTY_HOOK_TYPE="git"
export CHITTY_HOOK_NAME="${hookName}"

# Execute all registered hooks
${enabledHooks.map(hook => `
echo "Running: ${hook.id}"
bash "${hook.script}" "$@"
if [ $? -ne 0 ]; then
    echo "Hook failed: ${hook.id}"
    ${hook.blocking ? 'exit 1' : ''}
fi
`).join('\n')}

exit 0
`;
    }

    /**
     * Install terminal hooks (shell integration)
     */
    installTerminalHooks() {
        const shellrcPath = path.join(process.env.HOME, '.bashrc');
        const zshrcPath = path.join(process.env.HOME, '.zshrc');
        
        const hookScript = `
# ChittyOps Terminal Hooks
export CHITTY_HOOKS_ENABLED=1
export CHITTY_HOOKS_DIR="${this.hookDir}"

# Session start hook
if [ -z "$CHITTY_SESSION_STARTED" ]; then
    export CHITTY_SESSION_STARTED=1
    node "${path.join(__dirname, 'terminal-integration.js')}" session-start
fi

# Directory change hook
chitty_cd_hook() {
    builtin cd "$@"
    node "${path.join(__dirname, 'terminal-integration.js')}" cd-change "$(pwd)"
}
alias cd=chitty_cd_hook
`;

        // Add to bash
        if (fs.existsSync(shellrcPath)) {
            const content = fs.readFileSync(shellrcPath, 'utf8');
            if (!content.includes('ChittyOps Terminal Hooks')) {
                fs.appendFileSync(shellrcPath, hookScript);
                console.log('✅ Installed terminal hooks to .bashrc');
            }
        }

        // Add to zsh
        if (fs.existsSync(zshrcPath)) {
            const content = fs.readFileSync(zshrcPath, 'utf8');
            if (!content.includes('ChittyOps Terminal Hooks')) {
                fs.appendFileSync(zshrcPath, hookScript);
                console.log('✅ Installed terminal hooks to .zshrc');
            }
        }
    }

    log(action, message) {
        const logFile = path.join(this.logDir, 'hook-manager.log');
        const entry = `${new Date().toISOString()} [${action}] ${message}\n`;
        fs.appendFileSync(logFile, entry);
    }
}

module.exports = { HookManager };

// CLI execution
if (require.main === module) {
    const manager = new HookManager();
    const [,, command, ...args] = process.argv;

    switch (command) {
        case 'list':
            const hooks = manager.list();
            console.log('Registered Hooks:');
            hooks.forEach(h => {
                console.log(`  ${h.enabled ? '✓' : '✗'} ${h.hookId} - ${h.script}`);
            });
            break;

        case 'enable':
            manager.toggle(args[0], true);
            break;

        case 'disable':
            manager.toggle(args[0], false);
            break;

        case 'sync':
            const repo = args[0] || process.cwd();
            manager.syncToRepo(repo);
            break;

        case 'install-terminal':
            manager.installTerminalHooks();
            break;

        default:
            console.log('Usage: hook-manager.js [list|enable|disable|sync|install-terminal] [args]');
    }
}
