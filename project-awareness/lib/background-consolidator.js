#!/usr/bin/env node

/**
 * Background Session Consolidator
 * Continuously updates smart-start sessions using Memory-Claude integration
 * Runs throughout session and consolidates on session end
 */

const fs = require('fs');
const path = require('path');
const { SessionConsolidator } = require('./session-consolidator');
const { memoryCloude } = require('./memory-cloude');
const { cloudeConsciousness } = require('./cloude-consciousness');

class BackgroundConsolidator {
    constructor() {
        this.sessionConsolidator = new SessionConsolidator();
        this.memoryCloudePath = path.join(process.env.HOME, '.cloude', 'memory-cloude');
        this.cloudeConsciousnessPath = path.join(process.env.HOME, '.cloude', 'consciousness');
        this.isRunning = false;
        this.updateInterval = null;
        this.currentSession = {
            id: process.env.CLAUDE_SESSION_ID || `session-${Date.now()}`,
            project: null,
            startTime: Date.now(),
            toolsUsed: [],
            filesAccessed: [],
            decisions: [],
            insights: []
        };
    }

    /**
     * Start background consolidation process
     */
    start(projectName) {
        if (this.isRunning) {
            console.log('🔄 Background consolidator already running');
            return;
        }

        console.log(`🚀 Starting background consolidator for ${projectName}`);
        this.isRunning = true;
        this.currentSession.project = projectName;

        // Set up continuous update interval (every 5 minutes)
        this.updateInterval = setInterval(() => {
            this.incrementalUpdate();
        }, 5 * 60 * 1000); // 5 minutes

        // Set up session end handlers
        this.setupSessionEndHandlers();

        // Set up Memory-Cloude integration
        this.setupMemoryCloudeIntegration();

        console.log('✅ Background consolidator active');
    }

    /**
     * Incremental update during session
     */
    async incrementalUpdate() {
        if (!this.currentSession.project) return;

        console.log(`🔄 Incremental smart session update for ${this.currentSession.project}`);

        try {
            // Step 1: Gather current session data
            const sessionSnapshot = this.gatherSessionSnapshot();

            // Step 2: Update Memory-Cloude
            await this.updateMemoryCloude(sessionSnapshot);

            // Step 3: Rebuild smart context
            const rebuiltContext = await this.rebuildSmartContext(sessionSnapshot);

            // Step 4: Update smart-start session file
            await this.updateSmartStartSession(rebuiltContext);

            console.log('✅ Incremental update complete');

        } catch (error) {
            console.error('❌ Incremental update failed:', error);
        }
    }

    /**
     * Gather current session snapshot
     */
    gatherSessionSnapshot() {
        return {
            sessionId: this.currentSession.id,
            project: this.currentSession.project,
            duration: Date.now() - this.currentSession.startTime,
            toolsUsed: [...this.currentSession.toolsUsed],
            filesAccessed: [...this.currentSession.filesAccessed],
            decisions: [...this.currentSession.decisions],
            insights: [...this.currentSession.insights],
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Update Memory-Cloude with session data
     */
    async updateMemoryCloude(sessionSnapshot) {
        // Use the actual memory-cloude module
        const memoryData = await memoryCloude.storeMemory(
            this.currentSession.project,
            this.currentSession.id,
            sessionSnapshot
        );
        
        // Sync with Cloude-Consciousness for awareness
        await cloudeConsciousness.updateConsciousness(
            this.currentSession.project,
            sessionSnapshot
        );
        
        return memoryData;
    }

    /**
     * Rebuild smart context from memory and current session
     */
    async rebuildSmartContext(sessionSnapshot) {
        const projectName = sessionSnapshot.project;
        
        // Load existing smart session
        const smartSessionPath = path.join(
            process.env.HOME,
            '.claude',
            'projects',
            projectName,
            `${projectName}-SMART-START.jsonl`
        );

        let existingContext = {
            consolidated_sessions: 0,
            total_duration: 0,
            accumulated_insights: [],
            common_patterns: []
        };

        if (fs.existsSync(smartSessionPath)) {
            try {
                const content = fs.readFileSync(smartSessionPath, 'utf8');
                const lines = content.trim().split('\n');
                const metadata = JSON.parse(lines[0]);
                existingContext.consolidated_sessions = metadata.consolidated_sessions || 0;
            } catch (error) {
                // Use defaults if parse fails
            }
        }

        // Build new context combining old and new
        const rebuiltContext = {
            type: 'smart_start_session',
            project: projectName,
            generated_at: new Date().toISOString(),
            consolidated_sessions: existingContext.consolidated_sessions + 1,
            last_active_session: sessionSnapshot.sessionId,
            version: '2.0.0',
            
            // Accumulated knowledge
            accumulated: {
                total_duration: existingContext.total_duration + sessionSnapshot.duration,
                total_tools: sessionSnapshot.toolsUsed.length,
                total_files: sessionSnapshot.filesAccessed.length,
                insights_count: sessionSnapshot.insights.length
            },
            
            // Live context
            current_context: {
                working_files: sessionSnapshot.filesAccessed.slice(-10),
                active_tools: sessionSnapshot.toolsUsed.slice(-5),
                recent_decisions: sessionSnapshot.decisions.slice(-3),
                session_focus: this.determinePrimaryFocus(sessionSnapshot)
            },
            
            // Smart recommendations
            recommendations: {
                suggested_tools: this.suggestTools(sessionSnapshot),
                suggested_files: this.suggestFiles(sessionSnapshot),
                workflow_hints: this.generateWorkflowHints(sessionSnapshot)
            }
        };

        return rebuiltContext;
    }

    /**
     * Update smart-start session file
     */
    async updateSmartStartSession(rebuiltContext) {
        const projectName = rebuiltContext.project;
        const smartSessionPath = path.join(
            process.env.HOME,
            '.claude',
            'projects',
            projectName,
            `${projectName}-SMART-START.jsonl`
        );

        // Build JSONL content
        const smartSession = {
            ...rebuiltContext,
            background_update: true,
            update_timestamp: new Date().toISOString()
        };

        const contextMessage = {
            role: 'assistant',
            content: this.generateUpdatedContextMessage(rebuiltContext),
            timestamp: new Date().toISOString()
        };

        const suggestions = {
            role: 'system',
            content: this.generateUpdatedSuggestions(rebuiltContext),
            timestamp: new Date().toISOString()
        };

        // Write updated smart session
        const content = [
            JSON.stringify(smartSession),
            JSON.stringify(contextMessage),
            JSON.stringify(suggestions)
        ].join('\n');

        fs.writeFileSync(smartSessionPath, content);
        
        console.log(`📝 Updated smart session for ${projectName}`);
    }

    /**
     * Generate updated context message
     */
    generateUpdatedContextMessage(context) {
        return `## 🧠 Smart Session Context for ${context.project} (Live Update)

**Project Intelligence:** Continuously updated from ${context.consolidated_sessions} sessions

### 📊 Current Session Progress
- **Duration:** ${Math.round(context.accumulated.total_duration / 1000 / 60)} minutes total work
- **Tools Used:** ${context.accumulated.total_tools} tool operations
- **Files Accessed:** ${context.accumulated.total_files} files
- **Insights Generated:** ${context.accumulated.insights_count} insights

### 🎯 Current Focus
**${context.current_context.session_focus}**

### 📁 Active Files
${context.current_context.working_files.map(f => `- ${path.basename(f)}`).join('\n')}

### 🔧 Recent Tools
${context.current_context.active_tools.map(t => `- ${t}`).join('\n')}

### 💡 Recent Decisions
${context.current_context.recent_decisions.map(d => `- ${d}`).join('\n')}

**Context continuously updated - ready to resume work instantly!** 🚀`;
    }

    /**
     * Generate updated suggestions
     */
    generateUpdatedSuggestions(context) {
        return `## 🔧 Smart Suggestions (Live)

### Recommended Next Tools
${context.recommendations.suggested_tools.map(t => `- ${t}`).join('\n')}

### Suggested Files to Review
${context.recommendations.suggested_files.map(f => `- ${f}`).join('\n')}

### Workflow Hints
${context.recommendations.workflow_hints.map(h => `- ${h}`).join('\n')}

This smart session is being continuously updated as you work!`;
    }

    /**
     * Session end consolidation
     */
    async onSessionEnd() {
        console.log('🏁 Session ending - final consolidation...');

        // Stop incremental updates
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }

        // Final comprehensive update
        const finalSnapshot = this.gatherSessionSnapshot();
        
        // Update Memory-Cloude with final data
        await this.updateMemoryCloude(finalSnapshot);
        
        // Create final smart context
        const finalContext = await this.rebuildSmartContext(finalSnapshot);
        
        // Write final smart session
        await this.updateSmartStartSession(finalContext);
        
        // Sync with ChittyChat
        await this.syncWithChittyChat(finalContext);

        console.log('✅ Final session consolidation complete');
        console.log(`📊 Session consolidated: ${this.currentSession.project}`);
        console.log(`⏱️  Duration: ${Math.round((Date.now() - this.currentSession.startTime) / 1000 / 60)} minutes`);
        console.log(`🔧 Tools used: ${this.currentSession.toolsUsed.length}`);
        console.log(`📁 Files accessed: ${this.currentSession.filesAccessed.length}`);
    }

    /**
     * Track tool usage
     */
    trackToolUsage(toolName, args) {
        this.currentSession.toolsUsed.push({
            tool: toolName,
            timestamp: new Date().toISOString(),
            args_summary: this.summarizeArgs(args)
        });
    }

    /**
     * Track file access
     */
    trackFileAccess(filePath, operation) {
        this.currentSession.filesAccessed.push({
            path: filePath,
            operation: operation,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Track decisions
     */
    trackDecision(decision) {
        this.currentSession.decisions.push({
            decision: decision,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Track insights
     */
    trackInsight(insight) {
        this.currentSession.insights.push({
            insight: insight,
            timestamp: new Date().toISOString()
        });
    }

    // Analysis helper methods
    analyzeToolSequences(tools) {
        // Find common tool sequences
        const sequences = [];
        for (let i = 0; i < tools.length - 1; i++) {
            sequences.push(`${tools[i].tool} → ${tools[i+1].tool}`);
        }
        return sequences;
    }

    analyzeFileClusters(files) {
        // Group files by directory
        const clusters = {};
        files.forEach(f => {
            const dir = path.dirname(f.path);
            if (!clusters[dir]) clusters[dir] = [];
            clusters[dir].push(path.basename(f.path));
        });
        return clusters;
    }

    analyzeDecisionPatterns(decisions) {
        // Extract decision patterns
        return decisions.map(d => d.decision);
    }

    determinePrimaryFocus(snapshot) {
        // Determine what the session is primarily focused on
        if (snapshot.filesAccessed.length > snapshot.toolsUsed.length) {
            return 'File Analysis and Review';
        } else if (snapshot.toolsUsed.filter(t => t.tool === 'Write' || t.tool === 'Edit').length > 5) {
            return 'Active Development';
        } else {
            return 'Research and Discovery';
        }
    }

    detectWorkflowType(snapshot) {
        const toolTypes = snapshot.toolsUsed.map(t => t.tool);
        if (toolTypes.includes('Bash') && toolTypes.includes('Edit')) {
            return 'deployment';
        } else if (toolTypes.filter(t => t === 'Read').length > 10) {
            return 'research';
        } else {
            return 'development';
        }
    }

    calculateComplexity(snapshot) {
        return Math.min(100, 
            snapshot.toolsUsed.length * 2 + 
            snapshot.filesAccessed.length * 3 + 
            snapshot.decisions.length * 5
        );
    }

    extractAchievements(snapshot) {
        // Extract key achievements from insights
        return snapshot.insights.slice(0, 3);
    }

    extractOpenQuestions(snapshot) {
        // Identify open questions or todos
        return [];
    }

    suggestNextSteps(snapshot) {
        // Suggest logical next steps
        return ['Continue current workflow', 'Review recent changes', 'Test implementation'];
    }

    suggestTools(snapshot) {
        // Suggest tools based on patterns
        return ['Read', 'Edit', 'Bash'];
    }

    suggestFiles(snapshot) {
        // Suggest files to review
        return snapshot.filesAccessed.slice(-3).map(f => path.basename(f.path));
    }

    generateWorkflowHints(snapshot) {
        return ['Consider testing recent changes', 'Review related files', 'Check for dependencies'];
    }

    summarizeArgs(args) {
        // Summarize tool arguments
        const summary = {};
        if (args.file_path) summary.file = path.basename(args.file_path);
        if (args.command) summary.command = args.command.split(' ')[0];
        return summary;
    }

    async updateConsolidatedMemory(memoryData) {
        // Update consolidated memory file
        const consolidatedPath = path.join(
            this.memoryCloudePath,
            memoryData.project,
            'consolidated-memory.json'
        );

        let consolidated = {};
        if (fs.existsSync(consolidatedPath)) {
            consolidated = JSON.parse(fs.readFileSync(consolidatedPath, 'utf8'));
        }

        // Merge new data
        consolidated.lastUpdate = memoryData.timestamp;
        consolidated.sessions = (consolidated.sessions || 0) + 1;
        consolidated.totalDuration = (consolidated.totalDuration || 0) + memoryData.duration;

        fs.writeFileSync(consolidatedPath, JSON.stringify(consolidated, null, 2));
    }

    async syncWithChittyChat(finalContext) {
        // Sync final context with ChittyChat
        console.log('📡 Syncing with ChittyChat...');
        // This would sync to api.chitty.cc
    }

    setupSessionEndHandlers() {
        process.on('exit', () => this.onSessionEnd());
        process.on('SIGINT', () => this.onSessionEnd());
        process.on('SIGTERM', () => this.onSessionEnd());
    }

    setupMemoryCloudeIntegration() {
        // Set up Memory-Cloude integration hooks
        console.log('🧠 Memory-Cloude integration active');
        console.log('🌟 Cloude-Consciousness awareness active');
        
        // Listen for consciousness updates
        cloudeConsciousness.on('consciousness-updated', (event) => {
            console.log(`📊 Consciousness updated for ${event.project}`);
            // Track this for session data
            this.currentSession.insights.push({
                insight: `Consciousness evolved: ${event.state.awareness.currentFocus}`,
                timestamp: event.timestamp
            });
        });
    }
}

// Export singleton instance
const backgroundConsolidator = new BackgroundConsolidator();

module.exports = { BackgroundConsolidator, backgroundConsolidator };