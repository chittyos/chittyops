/**
 * Session Consolidator - Creates Smart Start Session Files
 * Aggregates and synthesizes all session files for each project into a single smart session
 */

const fs = require('fs');
const path = require('path');
const { SessionParser } = require('./session-parser');

class SessionConsolidator {
    constructor() {
        this.claudePath = path.join(process.env.HOME, '.claude');
        this.projectsPath = path.join(this.claudePath, 'projects');
        this.sessionParser = new SessionParser();
    }

    /**
     * Generate smart start session for all projects
     */
    async generateAllSmartSessions() {
        console.log('🔄 Generating smart start sessions for all projects...');
        
        const projects = fs.readdirSync(this.projectsPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory() && !dirent.name.startsWith('.'))
            .map(dirent => dirent.name);

        const results = [];
        for (const project of projects) {
            const result = await this.generateSmartSession(project);
            if (result) results.push(result);
        }

        console.log(`✅ Generated smart sessions for ${results.length} projects`);
        return results;
    }

    /**
     * Generate smart start session for a specific project
     */
    async generateSmartSession(projectName) {
        const projectPath = path.join(this.projectsPath, projectName);
        const smartSessionPath = path.join(projectPath, `${projectName}-SMART-START.jsonl`);

        if (!fs.existsSync(projectPath)) {
            console.log(`⚠️  Project directory not found: ${projectName}`);
            return null;
        }

        console.log(`📊 Processing project: ${projectName}`);

        // Get all session files
        const sessionFiles = fs.readdirSync(projectPath)
            .filter(file => file.endsWith('.jsonl') && !file.includes('SMART-START'))
            .map(file => path.join(projectPath, file));

        if (sessionFiles.length === 0) {
            console.log(`   ⚠️  No sessions found for ${projectName}`);
            return null;
        }

        // Parse and analyze all sessions
        const consolidatedData = await this.consolidateSessionData(sessionFiles, projectName);
        
        // Generate smart start session
        const smartSession = this.generateSmartStartSession(consolidatedData, projectName);
        
        // Write smart start session file
        fs.writeFileSync(smartSessionPath, smartSession);
        
        console.log(`   ✅ Created smart session: ${path.basename(smartSessionPath)}`);
        console.log(`   📈 Consolidated ${sessionFiles.length} sessions`);
        console.log(`   🧠 ${consolidatedData.keyInsights.length} key insights`);
        console.log(`   📁 ${consolidatedData.commonFiles.length} common files`);
        console.log(`   🔧 ${consolidatedData.frequentTools.length} frequent tools`);

        return {
            project: projectName,
            sessionsConsolidated: sessionFiles.length,
            smartSessionPath: smartSessionPath,
            keyInsights: consolidatedData.keyInsights.length,
            commonFiles: consolidatedData.commonFiles.length
        };
    }

    /**
     * Consolidate data from all session files
     */
    async consolidateSessionData(sessionFiles, projectName) {
        const consolidatedData = {
            projectName,
            totalSessions: sessionFiles.length,
            keyInsights: [],
            commonFiles: [],
            frequentTools: [],
            importantDecisions: [],
            codePatterns: [],
            workflowPatterns: [],
            crossSessionContext: {},
            timeline: [],
            fileOperations: new Map(),
            toolUsage: new Map(),
            decisionHistory: []
        };

        // Process only a sample of sessions for large projects (performance optimization)
        const maxSessions = 20; // Process max 20 sessions for speed
        const sessionSample = sessionFiles.length > maxSessions ? 
            [
                ...sessionFiles.slice(0, maxSessions/2),           // First 10
                ...sessionFiles.slice(-maxSessions/2)              // Last 10
            ] : sessionFiles;
            
        console.log(`   📊 Processing ${sessionSample.length} of ${sessionFiles.length} sessions`);

        for (const sessionFile of sessionSample) {
            try {
                const sessionData = await this.sessionParser.parseSession(sessionFile);
                if (sessionData) {
                    this.integrateSessionData(consolidatedData, sessionData, sessionFile);
                }
            } catch (error) {
                console.log(`   ⚠️  Could not parse session: ${path.basename(sessionFile)}`);
            }
        }

        // Process consolidated data
        consolidatedData.keyInsights = this.extractKeyInsights(consolidatedData);
        consolidatedData.commonFiles = this.identifyCommonFiles(consolidatedData.fileOperations);
        consolidatedData.frequentTools = this.identifyFrequentTools(consolidatedData.toolUsage);
        consolidatedData.workflowPatterns = this.identifyWorkflowPatterns(consolidatedData);

        return consolidatedData;
    }

    /**
     * Integrate data from individual session
     */
    integrateSessionData(consolidated, sessionData, sessionFile) {
        // Track file operations
        sessionData.files?.forEach(file => {
            if (!consolidated.fileOperations.has(file.path)) {
                consolidated.fileOperations.set(file.path, {
                    path: file.path,
                    operations: [],
                    frequency: 0
                });
            }
            const fileData = consolidated.fileOperations.get(file.path);
            fileData.operations.push({
                operation: file.operation,
                session: path.basename(sessionFile),
                timestamp: sessionData.timestamp
            });
            fileData.frequency++;
        });

        // Track tool usage
        sessionData.tools?.forEach(tool => {
            if (!consolidated.toolUsage.has(tool.name)) {
                consolidated.toolUsage.set(tool.name, {
                    name: tool.name,
                    usage: [],
                    frequency: 0
                });
            }
            const toolData = consolidated.toolUsage.get(tool.name);
            toolData.usage.push({
                args: tool.args,
                session: path.basename(sessionFile),
                timestamp: sessionData.timestamp
            });
            toolData.frequency++;
        });

        // Collect decisions
        if (sessionData.decisions?.length > 0) {
            consolidated.decisionHistory.push(...sessionData.decisions.map(d => ({
                ...d,
                session: path.basename(sessionFile),
                timestamp: sessionData.timestamp
            })));
        }

        // Add to timeline
        consolidated.timeline.push({
            session: path.basename(sessionFile),
            timestamp: sessionData.timestamp,
            duration: sessionData.duration || 0,
            toolCount: sessionData.tools?.length || 0,
            fileCount: sessionData.files?.length || 0,
            summary: sessionData.summary || 'Session activity'
        });
    }

    /**
     * Extract key insights from consolidated data
     */
    extractKeyInsights(consolidated) {
        const insights = [];

        // File operation insights
        const topFiles = Array.from(consolidated.fileOperations.values())
            .sort((a, b) => b.frequency - a.frequency)
            .slice(0, 5);

        if (topFiles.length > 0) {
            insights.push({
                type: 'file_focus',
                insight: `Most frequently accessed files: ${topFiles.map(f => path.basename(f.path)).join(', ')}`,
                data: topFiles
            });
        }

        // Tool usage insights
        const topTools = Array.from(consolidated.toolUsage.values())
            .sort((a, b) => b.frequency - a.frequency)
            .slice(0, 5);

        if (topTools.length > 0) {
            insights.push({
                type: 'tool_patterns',
                insight: `Most used tools: ${topTools.map(t => t.name).join(', ')}`,
                data: topTools
            });
        }

        // Timeline insights
        if (consolidated.timeline.length > 0) {
            const totalDuration = consolidated.timeline.reduce((sum, s) => sum + (s.duration || 0), 0);
            const avgSessionTime = Math.round(totalDuration / consolidated.timeline.length);
            
            insights.push({
                type: 'usage_patterns',
                insight: `${consolidated.totalSessions} sessions, average ${avgSessionTime} min per session`,
                data: { totalSessions: consolidated.totalSessions, avgDuration: avgSessionTime }
            });
        }

        // Decision insights
        if (consolidated.decisionHistory.length > 0) {
            insights.push({
                type: 'decision_context',
                insight: `${consolidated.decisionHistory.length} key decisions tracked across sessions`,
                data: consolidated.decisionHistory.slice(0, 3) // Most recent decisions
            });
        }

        return insights;
    }

    /**
     * Identify most common files
     */
    identifyCommonFiles(fileOperations) {
        return Array.from(fileOperations.values())
            .sort((a, b) => b.frequency - a.frequency)
            .slice(0, 10)
            .map(f => ({
                path: f.path,
                frequency: f.frequency,
                name: path.basename(f.path),
                directory: path.dirname(f.path)
            }));
    }

    /**
     * Identify most frequent tools
     */
    identifyFrequentTools(toolUsage) {
        return Array.from(toolUsage.values())
            .sort((a, b) => b.frequency - a.frequency)
            .slice(0, 10)
            .map(t => ({
                name: t.name,
                frequency: t.frequency,
                recentUsage: t.usage.slice(-3) // Last 3 uses
            }));
    }

    /**
     * Identify workflow patterns
     */
    identifyWorkflowPatterns(consolidated) {
        const patterns = [];

        // Tool sequence patterns
        const sessions = consolidated.timeline.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        // Common tool combinations
        const toolCombinations = new Map();
        consolidated.toolUsage.forEach(tool => {
            tool.usage.forEach((usage, index) => {
                if (index > 0) {
                    const prevTool = tool.usage[index - 1];
                    const combo = `${prevTool.name} → ${tool.name}`;
                    toolCombinations.set(combo, (toolCombinations.get(combo) || 0) + 1);
                }
            });
        });

        const topCombinations = Array.from(toolCombinations.entries())
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5);

        if (topCombinations.length > 0) {
            patterns.push({
                type: 'tool_sequences',
                pattern: 'Common tool combinations',
                data: topCombinations.map(([combo, count]) => ({ sequence: combo, count }))
            });
        }

        return patterns;
    }

    /**
     * Generate smart start session JSONL content
     */
    generateSmartStartSession(consolidatedData, projectName) {
        const smartSession = {
            type: 'smart_start_session',
            project: projectName,
            generated_at: new Date().toISOString(),
            consolidated_sessions: consolidatedData.totalSessions,
            version: '1.0.0'
        };

        const contextMessage = {
            role: 'assistant',
            content: this.generateContextMessage(consolidatedData),
            timestamp: new Date().toISOString()
        };

        const toolSuggestions = {
            role: 'system', 
            content: this.generateToolSuggestions(consolidatedData),
            timestamp: new Date().toISOString()
        };

        const fileSuggestions = {
            role: 'system',
            content: this.generateFileSuggestions(consolidatedData),
            timestamp: new Date().toISOString()
        };

        return [
            JSON.stringify(smartSession),
            JSON.stringify(contextMessage),
            JSON.stringify(toolSuggestions),
            JSON.stringify(fileSuggestions)
        ].join('\n');
    }

    /**
     * Generate context message for smart session
     */
    generateContextMessage(consolidated) {
        let context = `## 🧠 Smart Session Context for ${consolidated.projectName}\n\n`;
        context += `**Project Intelligence:** Synthesized from ${consolidated.totalSessions} previous sessions\n\n`;

        // Key insights
        if (consolidated.keyInsights.length > 0) {
            context += `### 💡 Key Insights\n`;
            consolidated.keyInsights.forEach(insight => {
                context += `- **${insight.type}**: ${insight.insight}\n`;
            });
            context += `\n`;
        }

        // Common files
        if (consolidated.commonFiles.length > 0) {
            context += `### 📁 Most Accessed Files\n`;
            consolidated.commonFiles.slice(0, 5).forEach(file => {
                context += `- \`${file.path}\` (${file.frequency} times)\n`;
            });
            context += `\n`;
        }

        // Frequent tools
        if (consolidated.frequentTools.length > 0) {
            context += `### 🔧 Frequently Used Tools\n`;
            consolidated.frequentTools.slice(0, 5).forEach(tool => {
                context += `- **${tool.name}** (${tool.frequency} uses)\n`;
            });
            context += `\n`;
        }

        // Workflow patterns
        if (consolidated.workflowPatterns.length > 0) {
            context += `### 🔄 Workflow Patterns\n`;
            consolidated.workflowPatterns.forEach(pattern => {
                context += `- **${pattern.type}**: ${pattern.pattern}\n`;
                if (pattern.data) {
                    pattern.data.forEach(item => {
                        if (item.sequence) {
                            context += `  - ${item.sequence} (${item.count}x)\n`;
                        }
                    });
                }
            });
            context += `\n`;
        }

        context += `### 🚀 Ready to Continue\n`;
        context += `This smart session gives you instant context for **${consolidated.projectName}** based on your previous work patterns. `;
        context += `The system has learned your preferences and is ready to assist efficiently!\n`;

        return context;
    }

    /**
     * Generate tool suggestions
     */
    generateToolSuggestions(consolidated) {
        let suggestions = `## 🔧 Recommended Tools for ${consolidated.projectName}\n\n`;
        
        if (consolidated.frequentTools.length > 0) {
            suggestions += `Based on your usage patterns, these tools are likely to be helpful:\n\n`;
            consolidated.frequentTools.slice(0, 3).forEach(tool => {
                suggestions += `- **${tool.name}** - Used ${tool.frequency} times in previous sessions\n`;
            });
        }

        return suggestions;
    }

    /**
     * Generate file suggestions
     */
    generateFileSuggestions(consolidated) {
        let suggestions = `## 📁 Key Files for ${consolidated.projectName}\n\n`;
        
        if (consolidated.commonFiles.length > 0) {
            suggestions += `Files you frequently work with:\n\n`;
            consolidated.commonFiles.slice(0, 5).forEach(file => {
                suggestions += `- \`${file.name}\` in \`${file.directory}\` (accessed ${file.frequency} times)\n`;
            });
        }

        return suggestions;
    }

    /**
     * Update smart session when new regular session ends
     */
    async updateSmartSession(projectName, newSessionData) {
        console.log(`🔄 Updating smart session for ${projectName}...`);
        
        // Regenerate the smart session with the new data included
        await this.generateSmartSession(projectName);
        
        console.log(`✅ Smart session updated for ${projectName}`);
    }
}

module.exports = { SessionConsolidator };