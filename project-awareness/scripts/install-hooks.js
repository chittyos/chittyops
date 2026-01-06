#!/usr/bin/env node

/**
 * Installation script for Project Awareness hooks
 * Automatically updates Claude Code settings.local.json with hook configuration
 */

const fs = require('fs');
const path = require('path');

class HookInstaller {
    constructor() {
        this.claudeConfigPath = path.join(process.env.HOME, '.claude', 'settings.local.json');
        this.hooksPath = path.join(process.env.HOME, '.claude', 'hooks');
    }

    async install() {
        console.log('🔧 Installing ChittyChat Project Awareness hooks...');

        try {
            // 1. Check if settings file exists
            if (!fs.existsSync(this.claudeConfigPath)) {
                console.error('❌ Claude settings file not found:', this.claudeConfigPath);
                console.log('Please make sure Claude Code is properly installed.');
                return false;
            }

            // 2. Read current settings
            const currentSettings = JSON.parse(fs.readFileSync(this.claudeConfigPath, 'utf8'));
            
            // 3. Add hook configuration
            if (!currentSettings.hooks) {
                currentSettings.hooks = {};
            }

            // Startup hook
            if (!currentSettings.hooks.onStart) {
                currentSettings.hooks.onStart = [];
            } else if (!Array.isArray(currentSettings.hooks.onStart)) {
                currentSettings.hooks.onStart = [currentSettings.hooks.onStart];
            }

            const startupHook = {
                command: path.join(this.hooksPath, 'project-awareness-startup.sh')
            };

            // Check if already installed
            const hasStartupHook = currentSettings.hooks.onStart.some(hook => 
                hook.command && hook.command.includes('project-awareness-startup.sh')
            );

            if (!hasStartupHook) {
                currentSettings.hooks.onStart.push(startupHook);
                console.log('✅ Added startup hook');
            } else {
                console.log('⏭️  Startup hook already installed');
            }

            // Pre-tool hook
            if (!currentSettings.hooks.preToolUse) {
                currentSettings.hooks.preToolUse = [];
            } else if (!Array.isArray(currentSettings.hooks.preToolUse)) {
                currentSettings.hooks.preToolUse = [currentSettings.hooks.preToolUse];
            }

            const preToolHook = {
                command: path.join(this.hooksPath, 'project-awareness-pretool.sh'),
                tools: ['*']
            };

            const hasPreToolHook = currentSettings.hooks.preToolUse.some(hook =>
                hook.command && hook.command.includes('project-awareness-pretool.sh')
            );

            if (!hasPreToolHook) {
                currentSettings.hooks.preToolUse.push(preToolHook);
                console.log('✅ Added pre-tool hook');
            } else {
                console.log('⏭️  Pre-tool hook already installed');
            }

            // Post-tool hook  
            if (!currentSettings.hooks.postToolUse) {
                currentSettings.hooks.postToolUse = [];
            } else if (!Array.isArray(currentSettings.hooks.postToolUse)) {
                currentSettings.hooks.postToolUse = [currentSettings.hooks.postToolUse];
            }

            const postToolHook = {
                command: path.join(this.hooksPath, 'project-awareness-posttool.sh'),
                tools: ['*']
            };

            const hasPostToolHook = currentSettings.hooks.postToolUse.some(hook =>
                hook.command && hook.command.includes('project-awareness-posttool.sh')
            );

            if (!hasPostToolHook) {
                currentSettings.hooks.postToolUse.push(postToolHook);
                console.log('✅ Added post-tool hook');
            } else {
                console.log('⏭️  Post-tool hook already installed');
            }

            // 4. Write updated settings
            fs.writeFileSync(this.claudeConfigPath, JSON.stringify(currentSettings, null, 2));
            console.log('✅ Updated Claude Code settings');

            // 5. Create log directory
            const logDir = path.join(process.env.HOME, '.claude', 'logs');
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
                console.log('✅ Created logs directory');
            }

            // 6. Verify hook files exist and are executable
            const hooks = [
                'project-awareness-startup.sh',
                'project-awareness-pretool.sh', 
                'project-awareness-posttool.sh'
            ];

            for (const hook of hooks) {
                const hookPath = path.join(this.hooksPath, hook);
                if (!fs.existsSync(hookPath)) {
                    console.error(`❌ Hook file missing: ${hookPath}`);
                    return false;
                }

                // Make executable
                fs.chmodSync(hookPath, 0o755);
            }
            console.log('✅ Verified hook files are executable');

            console.log('\n🎉 Installation complete!');
            console.log('\n📋 Next steps:');
            console.log('   1. Restart Claude Code to activate hooks');
            console.log('   2. The system will analyze your context on startup');
            console.log('   3. Check logs: tail -f ~/.claude/logs/project-awareness.log');
            console.log('\n🔧 Configuration:');
            console.log(`   Settings file: ${this.claudeConfigPath}`);
            console.log(`   Hooks directory: ${this.hooksPath}`);
            console.log(`   Extension: ~/.claude/extensions/project-awareness/`);

            return true;

        } catch (error) {
            console.error('❌ Installation failed:', error.message);
            return false;
        }
    }

    async uninstall() {
        console.log('🗑️  Uninstalling Project Awareness hooks...');

        try {
            const currentSettings = JSON.parse(fs.readFileSync(this.claudeConfigPath, 'utf8'));

            // Remove hooks
            if (currentSettings.hooks) {
                if (currentSettings.hooks.onStart) {
                    currentSettings.hooks.onStart = currentSettings.hooks.onStart.filter(hook =>
                        !hook.command || !hook.command.includes('project-awareness-startup.sh')
                    );
                }

                if (currentSettings.hooks.preToolUse) {
                    currentSettings.hooks.preToolUse = currentSettings.hooks.preToolUse.filter(hook =>
                        !hook.command || !hook.command.includes('project-awareness-pretool.sh')
                    );
                }

                if (currentSettings.hooks.postToolUse) {
                    currentSettings.hooks.postToolUse = currentSettings.hooks.postToolUse.filter(hook =>
                        !hook.command || !hook.command.includes('project-awareness-posttool.sh')
                    );
                }
            }

            fs.writeFileSync(this.claudeConfigPath, JSON.stringify(currentSettings, null, 2));
            console.log('✅ Removed hooks from Claude Code settings');
            console.log('🔄 Restart Claude Code to complete uninstallation');

        } catch (error) {
            console.error('❌ Uninstallation failed:', error.message);
        }
    }
}

// CLI execution
if (require.main === module) {
    const installer = new HookInstaller();
    const command = process.argv[2];

    switch (command) {
        case 'install':
            installer.install();
            break;
        case 'uninstall':
            installer.uninstall();
            break;
        default:
            console.log('Usage: node install-hooks.js [install|uninstall]');
    }
}

module.exports = { HookInstaller };