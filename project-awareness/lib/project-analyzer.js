#!/usr/bin/env node

/**
 * Advanced Project Analyzer
 * Detects single projects, multi-project contexts, and cross-project relationships
 */

const fs = require('fs');
const path = require('path');

class ProjectAnalyzer {
    constructor() {
        this.projectPatterns = {
            // Legal Projects
            'Arias-v-Bianchi': {
                patterns: [/arias/i, /bianchi/i, /legal/i, /court/i, /evidence/i],
                directories: ['Legal', 'Court', 'Evidence', 'ARIAS'],
                files: ['.pdf', '.docx', 'motion', 'filing', 'exhibit']
            },
            
            // ChittyOS Ecosystem
            'ChittyOS-Core': {
                patterns: [/chittyos/i, /chitty.*\/(?!finance|chat|score)/i],
                directories: ['chittyos'],
                files: ['chitty', 'mcp-server', 'canon']
            },
            
            'ChittyFinance': {
                patterns: [/chittyfinance/i, /financial/i, /accounting/i],
                directories: ['chittyfinance', 'financial'],
                files: ['invoice', 'receipt', 'transaction', 'ledger']
            },
            
            'ChittyChat': {
                patterns: [/chittychat/i, /chat/i, /pm/i],
                directories: ['chittychat', 'chat'],
                files: ['task', 'project', 'agent']
            },
            
            'ChittyScore': {
                patterns: [/chittyscore/i, /score/i, /reputation/i],
                directories: ['chittyscore'],
                files: ['score', 'rating', 'trust']
            },
            
            // Business Operations
            'ChiCo-Properties': {
                patterns: [/chico/i, /chicago/i, /properties/i, /rental/i],
                directories: ['chico', 'chicago', 'properties'],
                files: ['lease', 'tenant', 'property']
            },
            
            'Furnished-Condos': {
                patterns: [/furnishedcondos/i, /furnished/i, /condo/i],
                directories: ['furnishedcondos', 'condos'],
                files: ['booking', 'guest', 'airbnb']
            },
            
            // Corporate Structure
            'IT-CAN-BE-LLC': {
                patterns: [/it.can.be/i, /wyoming/i, /llc/i],
                directories: ['IT-CAN-BE', 'wyoming'],
                files: ['articles', 'operating', 'member']
            },
            
            'ChittyCorp': {
                patterns: [/chittycorp/i, /corp/i],
                directories: ['chittycorp', 'corporate'],
                files: ['bylaws', 'board', 'stock']
            }
        };
        
        this.crossProjectRelationships = {
            'Arias-v-Bianchi': ['ChittyChain', 'ChittyLegal', 'IT-CAN-BE-LLC'],
            'ChittyFinance': ['ChiCo-Properties', 'Furnished-Condos', 'IT-CAN-BE-LLC', 'ChittyCorp'],
            'ChiCo-Properties': ['ChittyFinance', 'ChittyScore', 'Furnished-Condos'],
            'ChittyOS-Core': ['ChittyChat', 'ChittyScore', 'ChittyFinance', 'ChittyChain']
        };
        
        this.multiProjectIndicators = [
            // File patterns that suggest multiple projects
            { pattern: /integration|bridge|sync/i, reason: 'Integration between systems' },
            { pattern: /deploy|migration|setup/i, reason: 'Cross-system deployment' },
            { pattern: /dashboard|overview|summary/i, reason: 'Multi-project overview' },
            { pattern: /config|settings|env/i, reason: 'Configuration spanning multiple systems' }
        ];
    }

    /**
     * Analyze directory for project context - can detect multiple projects
     */
    async analyzeDirectory(directoryPath) {
        const analysis = {
            primary_project: null,
            secondary_projects: [],
            cross_project_context: false,
            confidence_scores: {},
            directory_evidence: [],
            file_evidence: []
        };

        try {
            // Get directory structure
            const items = fs.readdirSync(directoryPath, { withFileTypes: true });
            const directories = items.filter(item => item.isDirectory()).map(item => item.name);
            const files = items.filter(item => item.isFile()).map(item => item.name);

            // Score each project based on directory evidence
            for (const [projectName, config] of Object.entries(this.projectPatterns)) {
                let score = 0;
                const evidence = [];

                // Check directory path itself
                if (config.patterns.some(pattern => pattern.test(directoryPath))) {
                    score += 0.8;
                    evidence.push(`Directory path matches ${projectName}`);
                }

                // Check subdirectories
                directories.forEach(dir => {
                    if (config.directories.some(pattern => 
                        typeof pattern === 'string' ? dir.toLowerCase().includes(pattern.toLowerCase()) : pattern.test(dir)
                    )) {
                        score += 0.3;
                        evidence.push(`Subdirectory: ${dir}`);
                    }
                });

                // Check files
                files.forEach(file => {
                    if (config.files.some(pattern => 
                        typeof pattern === 'string' ? file.toLowerCase().includes(pattern.toLowerCase()) : pattern.test(file)
                    )) {
                        score += 0.2;
                        evidence.push(`File: ${file}`);
                    }
                });

                if (score > 0) {
                    analysis.confidence_scores[projectName] = Math.min(score, 1.0);
                    if (evidence.length > 0) {
                        analysis.directory_evidence.push({
                            project: projectName,
                            score: score,
                            evidence: evidence
                        });
                    }
                }
            }

            // Determine primary and secondary projects
            const sortedProjects = Object.entries(analysis.confidence_scores)
                .sort(([,a], [,b]) => b - a);

            if (sortedProjects.length > 0) {
                analysis.primary_project = {
                    name: sortedProjects[0][0],
                    confidence: sortedProjects[0][1]
                };

                // Secondary projects (score > 0.3 but not primary)
                analysis.secondary_projects = sortedProjects
                    .slice(1)
                    .filter(([, score]) => score > 0.3)
                    .map(([name, score]) => ({ name, confidence: score }));
            }

            // Detect cross-project context
            analysis.cross_project_context = this.detectCrossProjectContext(
                directoryPath, 
                files, 
                analysis.primary_project?.name
            );

            // Check for multi-project indicators
            const multiProjectIndicators = this.checkMultiProjectIndicators(directoryPath, files);
            if (multiProjectIndicators.length > 0) {
                analysis.cross_project_context = true;
                analysis.multi_project_indicators = multiProjectIndicators;
            }

            return analysis;

        } catch (error) {
            console.error('Error analyzing directory:', error);
            return analysis;
        }
    }

    /**
     * Detect when user is working across multiple projects
     */
    detectCrossProjectContext(directoryPath, files, primaryProject) {
        if (!primaryProject) return false;

        // Check if directory suggests integration/bridging
        const integrationKeywords = ['integration', 'bridge', 'sync', 'deploy', 'migration'];
        const pathLower = directoryPath.toLowerCase();
        
        if (integrationKeywords.some(keyword => pathLower.includes(keyword))) {
            return true;
        }

        // Check for files that reference multiple projects
        const crossProjectFiles = files.filter(file => {
            const fileLower = file.toLowerCase();
            const projectMatches = Object.keys(this.projectPatterns).filter(project => {
                return this.projectPatterns[project].patterns.some(pattern => pattern.test(fileLower));
            });
            return projectMatches.length > 1;
        });

        return crossProjectFiles.length > 0;
    }

    /**
     * Check for multi-project indicators
     */
    checkMultiProjectIndicators(directoryPath, files) {
        const indicators = [];
        const pathAndFiles = [directoryPath, ...files].join(' ').toLowerCase();

        for (const indicator of this.multiProjectIndicators) {
            if (indicator.pattern.test(pathAndFiles)) {
                indicators.push({
                    pattern: indicator.pattern.source,
                    reason: indicator.reason,
                    context: 'multi-project-workflow'
                });
            }
        }

        return indicators;
    }

    /**
     * Analyze file for project context
     */
    async detectProjectFromFile(filePath) {
        const fileName = path.basename(filePath);
        const dirPath = path.dirname(filePath);
        
        const scores = {};
        
        // Score based on file path and name
        for (const [projectName, config] of Object.entries(this.projectPatterns)) {
            let score = 0;
            
            // Check full path
            if (config.patterns.some(pattern => pattern.test(filePath))) {
                score += 0.6;
            }
            
            // Check filename
            if (config.files.some(pattern => fileName.toLowerCase().includes(pattern.toLowerCase()))) {
                score += 0.4;
            }
            
            // Check directory
            if (config.directories.some(dir => dirPath.toLowerCase().includes(dir.toLowerCase()))) {
                score += 0.3;
            }
            
            if (score > 0) {
                scores[projectName] = Math.min(score, 1.0);
            }
        }
        
        // Return highest scoring project
        const topProject = Object.entries(scores)
            .sort(([,a], [,b]) => b - a)[0];
            
        return topProject ? {
            project: topProject[0],
            confidence: topProject[1],
            file_path: filePath
        } : null;
    }

    /**
     * Detect when user switches between projects
     */
    async detectProjectSwitch(previousContext, currentContext) {
        const prevAnalysis = await this.analyzeDirectory(previousContext.cwd);
        const currAnalysis = await this.analyzeDirectory(currentContext.cwd);
        
        const prevProject = prevAnalysis.primary_project?.name;
        const currProject = currAnalysis.primary_project?.name;
        
        if (prevProject && currProject && prevProject !== currProject) {
            return {
                from_project: prevProject,
                to_project: currProject,
                switch_confidence: Math.min(
                    prevAnalysis.primary_project.confidence,
                    currAnalysis.primary_project.confidence
                ),
                cross_project_relationship: this.checkCrossProjectRelationship(prevProject, currProject),
                switch_type: this.determineSwitchType(prevProject, currProject, currentContext)
            };
        }
        
        return null;
    }

    /**
     * Check if two projects are related
     */
    checkCrossProjectRelationship(project1, project2) {
        const relationships = this.crossProjectRelationships[project1] || [];
        const isRelated = relationships.includes(project2);
        
        return {
            are_related: isRelated,
            relationship_type: isRelated ? 'direct' : this.findIndirectRelationship(project1, project2),
            common_dependencies: this.findCommonDependencies(project1, project2)
        };
    }

    /**
     * Determine the type of project switch
     */
    determineSwitchType(fromProject, toProject, context) {
        // Check if it's a planned workflow (deployment, integration, etc.)
        const workflowKeywords = ['deploy', 'integrate', 'sync', 'migrate', 'setup'];
        const contextStr = JSON.stringify(context).toLowerCase();
        
        if (workflowKeywords.some(keyword => contextStr.includes(keyword))) {
            return 'workflow_planned';
        }
        
        // Check if projects are closely related
        const relationship = this.checkCrossProjectRelationship(fromProject, toProject);
        if (relationship.are_related) {
            return 'related_projects';
        }
        
        // Check timing - rapid switches might be exploratory
        if (context.rapid_switch) {
            return 'exploratory';
        }
        
        return 'intentional_switch';
    }

    /**
     * Find projects that commonly work together
     */
    findCommonDependencies(project1, project2) {
        const deps1 = this.crossProjectRelationships[project1] || [];
        const deps2 = this.crossProjectRelationships[project2] || [];
        
        return deps1.filter(dep => deps2.includes(dep));
    }

    /**
     * Find indirect relationships between projects
     */
    findIndirectRelationship(project1, project2) {
        const commonDeps = this.findCommonDependencies(project1, project2);
        
        if (commonDeps.length > 0) {
            return `indirect_via_${commonDeps[0]}`;
        }
        
        return 'unrelated';
    }

    /**
     * Detect project from directory path (simplified interface)
     */
    async detectProjectFromDirectory(directoryPath) {
        const analysis = await this.analyzeDirectory(directoryPath);
        
        if (analysis.primary_project && analysis.primary_project.confidence > 0.5) {
            return {
                name: analysis.primary_project.name,
                confidence: analysis.primary_project.confidence,
                type: 'directory_match',
                secondary_projects: analysis.secondary_projects.map(p => p.name)
            };
        }

        return null;
    }

    /**
     * Detect projects from multiple files
     */
    async detectProjectsFromFiles(files) {
        const projectScores = new Map();

        for (const file of files) {
            const match = await this.detectProjectFromFile(file.path || file.name || file);
            if (match) {
                const current = projectScores.get(match.project) || 0;
                projectScores.set(match.project, current + match.confidence * 0.2);
            }
        }

        return Array.from(projectScores.entries())
            .map(([project, confidence]) => ({ 
                project, 
                confidence: Math.min(confidence, 1.0),
                type: 'file_pattern'
            }))
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 5);
    }

    /**
     * Get smart project suggestions based on current activity
     */
    async getSmartSuggestions(currentContext, recentActivity) {
        const suggestions = [];
        
        // Analyze current directory
        const directoryAnalysis = await this.analyzeDirectory(currentContext.cwd);
        
        if (directoryAnalysis.primary_project) {
            suggestions.push({
                project: directoryAnalysis.primary_project.name,
                confidence: directoryAnalysis.primary_project.confidence,
                reason: 'Current directory indicates this project',
                type: 'directory_context',
                evidence: directoryAnalysis.directory_evidence
            });
        }
        
        // Add secondary project suggestions if cross-project context detected
        if (directoryAnalysis.cross_project_context) {
            directoryAnalysis.secondary_projects.forEach(proj => {
                suggestions.push({
                    project: proj.name,
                    confidence: proj.confidence * 0.8, // Lower confidence for secondary
                    reason: 'Secondary project detected in cross-project context',
                    type: 'cross_project_context',
                    primary_project: directoryAnalysis.primary_project.name
                });
            });
        }
        
        return suggestions.sort((a, b) => b.confidence - a.confidence);
    }
}

module.exports = { ProjectAnalyzer };