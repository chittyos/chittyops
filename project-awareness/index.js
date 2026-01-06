#!/usr/bin/env node

/**
 * ChittyChat Project Awareness Extension
 * Intelligent project detection, session analysis, and smart switching
 */

const fs = require('fs');
const path = require('path');
const { ChittyChatClient } = require('./lib/chittychat-client');
const { ProjectAnalyzer } = require('./lib/project-analyzer');
const { SessionParser } = require('./lib/session-parser');
const { SessionConsolidator } = require('./lib/session-consolidator');
const { BackgroundConsolidator } = require('./lib/background-consolidator');
const { memoryCloude } = require('./lib/memory-cloude');
const { cloudeConsciousness } = require('./lib/cloude-consciousness');
const { UserPrompt } = require('./lib/user-prompt');

class ProjectAwarenessExtension {
    constructor() {
        this.chittyChatClient = new ChittyChatClient();
        this.projectAnalyzer = new ProjectAnalyzer();
        this.sessionParser = new SessionParser();
        this.sessionConsolidator = new SessionConsolidator();
        this.backgroundConsolidator = new BackgroundConsolidator();
        this.userPrompt = new UserPrompt();
        
        this.currentProject = null;
        this.sessionData = new Map();
        this.projectHistory = [];
        this.confidenceThreshold = 0.75;
        
        // Initialize session tracking
        this.sessionData.set('start_time', Date.now());
        this.sessionData.set('tools_used', []);
        this.sessionData.set('files_accessed', []);
        this.sessionData.set('decisions', []);
        
        // Register for session end events
        this.setupSessionEndHandlers();
    }

    /**
     * Initialize extension on Claude startup
     */
    async onClaudeStart() {
        console.log('🧠 ChittyChat Project Awareness: Initializing...');
        
        try {
            // Load session history and analyze patterns
            await this.loadSessionHistory();
            
            // Detect current working context
            const currentContext = await this.analyzeCurrentContext();
            
            // Get project suggestions
            const suggestions = await this.getProjectSuggestions(currentContext);
            
            if (suggestions.length > 0) {
                await this.promptUserForProjectSelection(suggestions);
            } else {
                await this.promptForNewProject();
            }
            
        } catch (error) {
            console.error('Project Awareness initialization failed:', error);
        }
    }

    /**
     * Analyze context before tool execution
     */
    async onPreToolUse(toolName, toolArgs) {
        const context = {
            tool: toolName,
            args: toolArgs,
            cwd: process.cwd(),
            timestamp: new Date().toISOString()
        };

        // Check if this tool requires cross-session alignment
        const requiresAlignment = this.isToolRequiringCrossSessionAlignment(toolName, toolArgs);
        
        if (requiresAlignment) {
            console.log(`🔄 Tool ${toolName} requires cross-session alignment - forcing restoration...`);
            await this.forceSessionRestoration();
        }

        // Analyze if this tool use suggests a project switch
        const projectSuggestion = await this.analyzeToolForProjectSwitch(context);
        
        if (projectSuggestion && projectSuggestion.confidence > this.confidenceThreshold) {
            const shouldSwitch = await this.userPrompt.confirmProjectSwitch(
                this.currentProject,
                projectSuggestion.project,
                projectSuggestion.reason
            );
            
            if (shouldSwitch) {
                await this.switchProject(projectSuggestion.project);
            }
        }

        // Log tool usage for pattern learning
        await this.logToolUsage(context);
        
        // Track tool usage in session
        const toolsUsed = this.sessionData.get('tools_used');
        toolsUsed.push({
            tool: toolName,
            timestamp: context.timestamp,
            args_summary: this.summarizeToolArgs(toolArgs)
        });
        this.sessionData.set('tools_used', toolsUsed);
    }

    /**
     * Analyze results after tool execution
     */
    async onPostToolUse(toolName, toolArgs, result) {
        const context = {
            tool: toolName,
            args: toolArgs,
            result: result,
            cwd: process.cwd(),
            timestamp: new Date().toISOString()
        };

        // Update project activity tracking
        await this.updateProjectActivity(context);
        
        // Learn from tool results for better predictions
        await this.learnFromToolResult(context);
        
        // Check if results suggest related projects
        const relatedProjects = await this.findRelatedProjects(context);
        
        if (relatedProjects.length > 0) {
            await this.suggestRelatedProjects(relatedProjects);
        }
    }

    /**
     * Handle directory changes
     */
    async onDirectoryChange(newPath, oldPath) {
        console.log(`📁 Directory changed: ${oldPath} → ${newPath}`);
        
        // Analyze new directory for project context
        const projectContext = await this.projectAnalyzer.analyzeDirectory(newPath);
        
        if (projectContext.project && projectContext.project !== this.currentProject) {
            const shouldSwitch = await this.userPrompt.confirmDirectoryProjectSwitch(
                oldPath,
                newPath,
                projectContext.project
            );
            
            if (shouldSwitch) {
                await this.switchProject(projectContext.project);
            }
        }
    }

    /**
     * Load and analyze historical session data
     */
    async loadSessionHistory() {
        const projectsPath = path.join(process.env.HOME, '.claude', 'projects');
        
        if (!fs.existsSync(projectsPath)) {
            return;
        }

        const projects = fs.readdirSync(projectsPath);
        
        for (const project of projects) {
            const projectPath = path.join(projectsPath, project);
            if (!fs.statSync(projectPath).isDirectory()) continue;
            
            const sessions = fs.readdirSync(projectPath)
                .filter(file => file.endsWith('.jsonl'))
                .slice(-10); // Last 10 sessions per project
            
            for (const sessionFile of sessions) {
                const sessionPath = path.join(projectPath, sessionFile);
                const sessionData = await this.sessionParser.parseSession(sessionPath);
                
                this.sessionData.set(`${project}/${sessionFile}`, sessionData);
            }
        }
        
        console.log(`📊 Loaded ${this.sessionData.size} sessions across ${projects.length} projects`);
    }

    /**
     * Analyze current context for project suggestions
     */
    async analyzeCurrentContext() {
        const cwd = process.cwd();
        const recentFiles = await this.getRecentlyModifiedFiles(cwd);
        const gitInfo = await this.getGitInfo(cwd);
        
        return {
            workingDirectory: cwd,
            recentFiles,
            gitBranch: gitInfo.branch,
            gitRemote: gitInfo.remote,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get project suggestions based on context
     */
    async getProjectSuggestions(context) {
        const suggestions = [];
        
        // Analyze working directory patterns
        const directoryProject = await this.projectAnalyzer.detectProjectFromDirectory(context.workingDirectory);
        if (directoryProject) {
            suggestions.push({
                project: directoryProject.name,
                confidence: directoryProject.confidence,
                reason: `Working directory matches ${directoryProject.name}`,
                type: 'directory_match'
            });
        }
        
        // Analyze recent file patterns
        const fileProjects = await this.projectAnalyzer.detectProjectsFromFiles(context.recentFiles);
        suggestions.push(...fileProjects.map(fp => ({
            project: fp.project,
            confidence: fp.confidence,
            reason: `Recent files suggest ${fp.project}`,
            type: 'file_pattern'
        })));
        
        // Analyze session history patterns
        const historicalProjects = await this.analyzeHistoricalPatterns(context);
        suggestions.push(...historicalProjects);
        
        // Get active ChittyChat projects
        const activeProjects = await this.chittyChatClient.getActiveProjects();
        suggestions.push(...activeProjects.map(ap => ({
            project: ap.name,
            confidence: ap.activity_score,
            reason: `Active in ChittyChat with ${ap.open_tasks} open tasks`,
            type: 'chittychat_active'
        })));
        
        // Sort by confidence and remove duplicates
        return suggestions
            .sort((a, b) => b.confidence - a.confidence)
            .filter((suggestion, index, arr) => 
                index === arr.findIndex(s => s.project === suggestion.project)
            )
            .slice(0, 5);
    }

    /**
     * Prompt user for project selection
     */
    async promptUserForProjectSelection(suggestions) {
        const message = this.buildProjectSelectionMessage(suggestions);
        
        const response = await this.userPrompt.showProjectSelection({
            title: "🧠 ChittyChat Project Awareness",
            message: message,
            suggestions: suggestions,
            options: [
                { id: 'select', label: 'Select Project', default: true },
                { id: 'new', label: 'Start New Project' },
                { id: 'continue', label: 'Continue Without Project' }
            ]
        });
        
        switch (response.action) {
            case 'select':
                await this.switchProject(response.project);
                break;
            case 'new':
                await this.promptForNewProject();
                break;
            case 'continue':
                console.log('⏭️  Continuing without project context');
                break;
        }
    }

    /**
     * Build project selection message
     */
    buildProjectSelectionMessage(suggestions) {
        let message = "Based on your recent activity, I've identified these relevant projects:\n\n";
        
        suggestions.forEach((suggestion, index) => {
            const confidence = Math.round(suggestion.confidence * 100);
            const emoji = this.getProjectEmoji(suggestion.type);
            
            message += `${index + 1}. ${emoji} **${suggestion.project}** (${confidence}% match)\n`;
            message += `   ${suggestion.reason}\n\n`;
        });
        
        message += "Would you like to switch to one of these projects or continue with something else?";
        
        return message;
    }

    /**
     * Get emoji for project type
     */
    getProjectEmoji(type) {
        const emojis = {
            'directory_match': '📁',
            'file_pattern': '📄',
            'chittychat_active': '💬',
            'historical': '📊',
            'git_branch': '🌿'
        };
        return emojis[type] || '🔹';
    }

    /**
     * Switch to a different project
     */
    async switchProject(projectName) {
        console.log(`🔄 Switching to project: ${projectName}`);
        
        try {
            // Get consciousness summary for the project
            const consciousness = cloudeConsciousness.getConsciousnessSummary(projectName);
            
            // Retrieve recent memories for context
            const memories = await memoryCloude.retrieveMemories(projectName, { limit: 5 });
            
            // Display consciousness awareness
            if (consciousness.sessions > 0) {
                console.log(`📊 Project awareness: ${consciousness.sessions} sessions, ${consciousness.totalTime} minutes invested`);
                console.log(`🎯 Current focus: ${consciousness.currentFocus || 'General Work'}`);
                
                if (consciousness.intelligence?.recommendations?.length > 0) {
                    console.log(`💡 Recommendations: ${consciousness.intelligence.recommendations[0]}`);
                }
            }
            
            // Update ChittyChat context
            await this.chittyChatClient.setActiveProject(projectName);
            
            // Load project-specific settings
            await this.loadProjectSettings(projectName);
            
            // Start background consolidator for this project
            this.backgroundConsolidator.start(projectName);
            
            // Update current project tracking
            this.currentProject = projectName;
            this.projectHistory.unshift({
                project: projectName,
                timestamp: new Date().toISOString(),
                trigger: 'user_selection'
            });
            
            // Notify user of successful switch
            console.log(`✅ Now working on: ${projectName}`);
            
            // Update status line if available
            await this.updateStatusLine(projectName);
            
        } catch (error) {
            console.error(`Failed to switch to project ${projectName}:`, error);
        }
    }

    /**
     * Analyze tool usage for project switching opportunities
     */
    async analyzeToolForProjectSwitch(context) {
        // File operations that might indicate project switch
        if (context.tool === 'Read' || context.tool === 'Write' || context.tool === 'Edit') {
            const filePath = context.args.file_path;
            if (filePath) {
                const projectMatch = await this.projectAnalyzer.detectProjectFromFile(filePath);
                if (projectMatch && projectMatch.project !== this.currentProject) {
                    return {
                        project: projectMatch.project,
                        confidence: projectMatch.confidence,
                        reason: `File operation on ${filePath} suggests ${projectMatch.project}`
                    };
                }
            }
        }
        
        // Directory navigation
        if (context.tool === 'LS' || context.tool === 'Bash') {
            const path = context.args.path || context.cwd;
            const projectMatch = await this.projectAnalyzer.detectProjectFromDirectory(path);
            if (projectMatch && projectMatch.project !== this.currentProject) {
                return {
                    project: projectMatch.project,
                    confidence: projectMatch.confidence,
                    reason: `Directory operation suggests ${projectMatch.project}`
                };
            }
        }
        
        return null;
    }

    /**
     * Update project activity tracking
     */
    async updateProjectActivity(context) {
        if (!this.currentProject) return;
        
        try {
            await this.chittyChatClient.logActivity({
                project: this.currentProject,
                activity_type: 'tool_use',
                tool: context.tool,
                timestamp: context.timestamp,
                context: {
                    cwd: context.cwd,
                    args_summary: this.summarizeToolArgs(context.args)
                }
            });
        } catch (error) {
            console.error('Failed to log activity to ChittyChat:', error);
        }
    }

    /**
     * Get recently modified files in directory
     */
    async getRecentlyModifiedFiles(directory) {
        try {
            const files = fs.readdirSync(directory, { withFileTypes: true })
                .filter(dirent => dirent.isFile())
                .map(dirent => ({
                    name: dirent.name,
                    path: path.join(directory, dirent.name),
                    mtime: fs.statSync(path.join(directory, dirent.name)).mtime
                }))
                .sort((a, b) => b.mtime - a.mtime)
                .slice(0, 10);
            
            return files;
        } catch (error) {
            return [];
        }
    }

    /**
     * Get git information for current directory
     */
    async getGitInfo(directory) {
        try {
            const { execSync } = require('child_process');
            const branch = execSync('git branch --show-current', { cwd: directory, encoding: 'utf8' }).trim();
            const remote = execSync('git remote get-url origin', { cwd: directory, encoding: 'utf8' }).trim();
            
            return { branch, remote };
        } catch (error) {
            return { branch: null, remote: null };
        }
    }

    /**
     * Prompt for new project creation
     */
    async promptForNewProject() {
        const response = await this.userPrompt.promptNewProject({
            title: "🆕 Create New Project",
            message: "What would you like to call your new project?",
            suggestions: this.generateNewProjectSuggestions()
        });
        
        if (response.projectName) {
            await this.createNewProject(response.projectName, response.description);
        }
    }

    /**
     * Create new project in ChittyChat with full ecosystem integration
     */
    async createNewProject(name, description) {
        try {
            const project = await this.chittyChatClient.createProject({
                name: name,
                description: description,
                created_by: process.env.USER || 'claude-user',
                context: {
                    working_directory: process.cwd(),
                    created_via: 'project-awareness-extension'
                }
            });
            
            await this.switchProject(name);
            console.log(`✨ Created project: ${name} with ChittyID: ${project.chitty_id}`);
            
        } catch (error) {
            console.error('Failed to create new project:', error);
        }
    }

    /**
     * Handle session end - consolidate memory
     */
    async onSessionEnd() {
        if (!this.currentProject) return;

        try {
            console.log('🧠 Consolidating session memory...');
            
            // Gather session data
            const sessionData = {
                session_id: process.env.CLAUDE_SESSION_ID || `session-${Date.now()}`,
                project_context: this.currentProject,
                tools_used: this.getSessionToolUsage(),
                files_accessed: this.getSessionFileAccess(),
                decisions_made: this.getSessionDecisions(),
                duration: this.getSessionDuration(),
                patterns_observed: this.getSessionPatterns()
            };

            // Consolidate through ChittyChat and Memory system
            const consolidationResult = await this.chittyChatClient.consolidateSessionMemory(
                sessionData.session_id, 
                this.currentProject
            );

            // Integrate with Memory-Claude system
            await this.chittyChatClient.integrateWithMemorySystem(sessionData);

            console.log('✅ Session memory consolidated and integrated');

        } catch (error) {
            console.error('Failed to consolidate session memory:', error);
        }
    }

    /**
     * Get session tool usage summary
     */
    getSessionToolUsage() {
        // This would track tools used during session
        return this.sessionData.get('tools_used') || [];
    }

    /**
     * Get files accessed during session
     */
    getSessionFileAccess() {
        return this.sessionData.get('files_accessed') || [];
    }

    /**
     * Get decisions made during session
     */
    getSessionDecisions() {
        return this.sessionData.get('decisions') || [];
    }

    /**
     * Get session duration
     */
    getSessionDuration() {
        const startTime = this.sessionData.get('start_time');
        return startTime ? Date.now() - startTime : 0;
    }

    /**
     * Get patterns observed in session
     */
    getSessionPatterns() {
        return {
            project_switches: this.projectHistory.length,
            cross_project_work: this.detectCrossProjectWork(),
            workflow_type: this.detectWorkflowType(),
            complexity_indicators: this.detectComplexityIndicators()
        };
    }

    /**
     * Detect if session involved cross-project work
     */
    detectCrossProjectWork() {
        const uniqueProjects = new Set(this.projectHistory.map(h => h.project));
        return uniqueProjects.size > 1;
    }

    /**
     * Detect workflow type
     */
    detectWorkflowType() {
        const tools = this.getSessionToolUsage();
        const fileOps = tools.filter(t => ['Read', 'Write', 'Edit'].includes(t.tool)).length;
        const searches = tools.filter(t => ['Grep', 'Glob'].includes(t.tool)).length;
        const executions = tools.filter(t => t.tool === 'Bash').length;

        if (searches > fileOps) return 'research';
        if (fileOps > executions) return 'development';
        if (executions > 0) return 'deployment';
        return 'analysis';
    }

    /**
     * Detect complexity indicators
     */
    detectComplexityIndicators() {
        return {
            multi_project: this.detectCrossProjectWork(),
            high_file_count: this.getSessionFileAccess().length > 10,
            long_duration: this.getSessionDuration() > 1800000, // 30 minutes
            many_tools: this.getSessionToolUsage().length > 20
        };
    }

    /**
     * Setup session end handlers
     */
    setupSessionEndHandlers() {
        // Handle process exit
        process.on('exit', () => this.onSessionEnd());
        process.on('SIGINT', () => this.onSessionEnd());
        process.on('SIGTERM', () => this.onSessionEnd());
        
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            console.error('Uncaught exception:', error);
            this.onSessionEnd();
        });
    }

    /**
     * Summarize tool arguments for logging
     */
    summarizeToolArgs(args) {
        const summary = {};
        
        // Extract key information without sensitive data
        if (args.file_path) summary.file_type = args.file_path.split('.').pop();
        if (args.pattern) summary.search_type = 'pattern_search';
        if (args.command) summary.command_type = args.command.split(' ')[0];
        if (args.old_string) summary.edit_type = 'file_modification';
        
        return summary;
    }

    /**
     * Log tool usage for pattern learning
     */
    async logToolUsage(context) {
        try {
            // Track files accessed
            if (context.args.file_path) {
                const filesAccessed = this.sessionData.get('files_accessed');
                filesAccessed.push({
                    path: context.args.file_path,
                    tool: context.tool,
                    timestamp: context.timestamp
                });
                this.sessionData.set('files_accessed', filesAccessed);
            }
        } catch (error) {
            console.error('Error logging tool usage:', error);
        }
    }

    /**
     * Learn from tool results for better predictions
     */
    async learnFromToolResult(context) {
        // Implement learning from tool results
        // This could update project patterns, confidence scores, etc.
    }

    /**
     * Find related projects based on context
     */
    async findRelatedProjects(context) {
        // Implement related project detection
        return [];
    }

    /**
     * Suggest related projects
     */
    async suggestRelatedProjects(relatedProjects) {
        // Implement related project suggestions
    }

    /**
     * Analyze historical patterns
     */
    async analyzeHistoricalPatterns(context) {
        // Implement historical pattern analysis
        return [];
    }

    /**
     * Load project-specific settings
     */
    async loadProjectSettings(projectName) {
        // Implement project settings loading
    }

    /**
     * Update status line
     */
    async updateStatusLine(projectName) {
        try {
            console.log(`📊 Current Project: ${projectName}`);
        } catch (error) {
            // Status line update failed - non-critical
        }
    }

    /**
     * Generate new project suggestions
     */
    generateNewProjectSuggestions() {
        const cwd = process.cwd();
        const cwdName = require('path').basename(cwd);
        
        return [
            cwdName.replace(/[-_]/g, ' '),
            `${cwdName}-project`,
            'New Development Project',
            'Research Project'
        ];
    }

    /**
     * Check if tool requires cross-session alignment
     */
    isToolRequiringCrossSessionAlignment(toolName, toolArgs) {
        // Critical tools that need full context restoration
        const criticalTools = [
            'Task',           // ChittyChat task management
            'TodoWrite'       // Should be blocked anyway, but just in case
        ];

        // Tools working with known cross-session files
        const crossSessionFilePatterns = [
            /\.claude\//,                    // Claude configuration
            /session.*\.json/i,              // Session files
            /project.*\.json/i,              // Project files
            /\.chitty/,                      // ChittyOS files
            /chittychat/i,                   // ChittyChat files
            /settings\.local\.json/,         // Claude settings
            /memory.*\.json/i,               // Memory files
            /consolidated.*\.json/i          // Consolidated session files
        ];

        // Tools requiring ChittyChat/MCP integration
        const mcpIntegrationTools = [
            'Task',
            'TodoWrite'
        ];

        // Check tool name
        if (criticalTools.includes(toolName)) {
            return true;
        }

        if (mcpIntegrationTools.includes(toolName)) {
            return true;
        }

        // Check file paths in tool arguments
        if (toolArgs.file_path) {
            const filePath = toolArgs.file_path;
            if (crossSessionFilePatterns.some(pattern => pattern.test(filePath))) {
                return true;
            }
        }

        // Check for specific command patterns that indicate cross-session work
        if (toolName === 'Bash' && toolArgs.command) {
            const command = toolArgs.command.toLowerCase();
            const crossSessionCommands = [
                'chittychat',
                'chittyos',
                'claude',
                'launchctl.*chitty',
                'ps.*chitty',
                'npm.*dev',
                'node.*server',
                'mcp.*server'
            ];

            if (crossSessionCommands.some(pattern => new RegExp(pattern).test(command))) {
                return true;
            }
        }

        // Check patterns in search/grep operations
        if ((toolName === 'Grep' || toolName === 'Glob') && toolArgs.pattern) {
            const pattern = toolArgs.pattern.toLowerCase();
            if (/chitty|session|project|mcp|claude/.test(pattern)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Force session restoration and compaction
     */
    async forceSessionRestoration() {
        try {
            console.log('📡 Forcing cross-session alignment...');

            // Step 1: Force compaction of current session
            await this.forceSessionCompaction();

            // Step 2: Restore latest project context
            await this.restoreProjectContext();

            // Step 3: Sync with ChittyChat for latest updates
            await this.syncWithChittyChat();

            // Step 4: Update memory system with current state
            await this.updateMemorySystem();

            console.log('✅ Cross-session alignment complete');

        } catch (error) {
            console.error('❌ Failed to force session restoration:', error);
        }
    }

    /**
     * Force session compaction
     */
    async forceSessionCompaction() {
        try {
            const sessionId = process.env.CLAUDE_SESSION_ID || `session-${Date.now()}`;
            
            // Compact current session data
            const sessionData = {
                session_id: sessionId,
                project_context: this.currentProject,
                tools_used: this.getSessionToolUsage(),
                files_accessed: this.getSessionFileAccess(),
                decisions_made: this.getSessionDecisions(),
                compacted_at: new Date().toISOString(),
                compaction_reason: 'forced_before_critical_tool'
            };

            // Send to memory system for compaction
            await this.chittyChatClient.integrateWithMemorySystem(sessionData);

            console.log('🗜️ Session compacted for alignment');

        } catch (error) {
            console.error('Failed to compact session:', error);
        }
    }

    /**
     * Restore project context from latest session
     */
    async restoreProjectContext() {
        try {
            // Get latest project context from memory
            const latestContext = await this.getLatestProjectContext();
            
            if (latestContext && latestContext.project !== this.currentProject) {
                console.log(`📁 Restoring project context: ${latestContext.project}`);
                
                // Update current project without switching (restore state)
                this.currentProject = latestContext.project;
                
                // Load project-specific memory and context
                await this.loadProjectMemoryContext(latestContext.project);
            }

        } catch (error) {
            console.error('Failed to restore project context:', error);
        }
    }

    /**
     * Sync with ChittyChat for latest updates
     */
    async syncWithChittyChat() {
        try {
            // Get recent activity from ChittyChat
            const recentActivity = await this.chittyChatClient.sendRequest('tools/call', {
                name: 'get_recent_activity',
                arguments: {
                    since: this.getLastSyncTimestamp(),
                    include_projects: true,
                    include_tasks: true
                }
            });

            if (recentActivity.result?.content) {
                const activity = JSON.parse(recentActivity.result.content);
                console.log(`📥 Synced ${activity.length} updates from ChittyChat`);
                
                // Process updates
                await this.processChittyChatUpdates(activity);
            }

        } catch (error) {
            console.error('Failed to sync with ChittyChat:', error);
        }
    }

    /**
     * Update memory system with current state
     */
    async updateMemorySystem() {
        try {
            // Send current state to memory system
            const currentState = {
                session_id: process.env.CLAUDE_SESSION_ID,
                current_project: this.currentProject,
                project_history: this.projectHistory,
                session_duration: this.getSessionDuration(),
                state_update_reason: 'cross_session_alignment',
                updated_at: new Date().toISOString()
            };

            await this.chittyChatClient.sendRequest('tools/call', {
                name: 'memory_update_state',
                arguments: currentState
            });

            console.log('💾 Memory system updated with current state');

        } catch (error) {
            console.error('Failed to update memory system:', error);
        }
    }

    /**
     * Get latest project context
     */
    async getLatestProjectContext() {
        try {
            const fs = require('fs');
            const path = require('path');
            
            const sessionMemoryIndex = path.join(process.env.HOME, '.claude', 'session-memory', 'index.json');
            
            if (fs.existsSync(sessionMemoryIndex)) {
                const index = JSON.parse(fs.readFileSync(sessionMemoryIndex, 'utf8'));
                
                // Find most recently updated project
                let latestProject = null;
                let latestTimestamp = null;
                
                for (const [projectName, projectData] of Object.entries(index)) {
                    if (projectData.last_updated && (!latestTimestamp || projectData.last_updated > latestTimestamp)) {
                        latestTimestamp = projectData.last_updated;
                        latestProject = projectName;
                    }
                }
                
                return latestProject ? { project: latestProject, timestamp: latestTimestamp } : null;
            }

        } catch (error) {
            console.error('Failed to get latest project context:', error);
        }
        
        return null;
    }

    /**
     * Load project memory context
     */
    async loadProjectMemoryContext(projectName) {
        try {
            const fs = require('fs');
            const path = require('path');
            
            const projectMemoryDir = path.join(process.env.HOME, '.claude', 'project-memory', projectName);
            const memoryIndexFile = path.join(projectMemoryDir, 'memory-index.json');
            
            if (fs.existsSync(memoryIndexFile)) {
                const memoryIndex = JSON.parse(fs.readFileSync(memoryIndexFile, 'utf8'));
                
                // Restore project-specific patterns and insights
                this.restoreProjectPatterns(projectName, memoryIndex);
                
                console.log(`🧠 Loaded memory context for ${projectName}`);
            }

        } catch (error) {
            console.error('Failed to load project memory context:', error);
        }
    }

    /**
     * Get last sync timestamp
     */
    getLastSyncTimestamp() {
        return this.sessionData.get('last_sync') || new Date(Date.now() - 3600000).toISOString(); // 1 hour ago default
    }

    /**
     * Process ChittyChat updates
     */
    async processChittyChatUpdates(updates) {
        // Process activity updates and adjust project context if needed
        for (const update of updates) {
            if (update.type === 'project_switch' && update.project !== this.currentProject) {
                console.log(`📋 ChittyChat indicates project switch to: ${update.project}`);
            }
        }
        
        // Update last sync timestamp
        this.sessionData.set('last_sync', new Date().toISOString());
    }

    /**
     * Restore project patterns from memory
     */
    restoreProjectPatterns(projectName, memoryIndex) {
        if (memoryIndex.patterns_learned) {
            // Apply learned patterns to project analyzer
            // This would update confidence scores, detection patterns, etc.
            console.log(`🎯 Restored learned patterns for ${projectName}`);
        }
    }
}

// Export extension for Claude Code
module.exports = ProjectAwarenessExtension;

// CLI execution
if (require.main === module) {
    const extension = new ProjectAwarenessExtension();
    const command = process.argv[2];
    
    switch (command) {
        case 'init':
            extension.onClaudeStart();
            break;
        case 'analyze':
            extension.analyzeCurrentContext().then(console.log);
            break;
        case 'consolidate':
            extension.sessionConsolidator.generateAllSmartSessions();
            break;
        case 'smart-session':
            const projectName = process.argv[3];
            if (projectName) {
                extension.sessionConsolidator.generateSmartSession(projectName);
            } else {
                console.log('Usage: node index.js smart-session <project-name>');
            }
            break;
        default:
            console.log('ChittyChat Project Awareness Extension');
            console.log('Commands: init, analyze, consolidate, smart-session <project>');
    }
}