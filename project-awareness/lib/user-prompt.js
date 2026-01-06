#!/usr/bin/env node

/**
 * User Prompt System for Project Awareness
 * Handles user interactions, confirmations, and multi-project scenarios
 */

const readline = require('readline');

class UserPrompt {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        this.promptHistory = [];
        this.userPreferences = {
            auto_switch_related: false,
            confirm_cross_project: true,
            show_confidence_scores: true,
            max_suggestions: 5
        };
    }

    /**
     * Confirm project switch with context about why
     */
    async confirmProjectSwitch(fromProject, toProject, reason) {
        const message = this.buildSwitchConfirmationMessage(fromProject, toProject, reason);
        
        console.log('\n🔄 ' + '='.repeat(50));
        console.log(message);
        console.log('='.repeat(50));
        
        const response = await this.askQuestion(
            'Switch to this project? [Y/n/r] (Y=yes, n=no, r=related projects): '
        );
        
        const answer = response.toLowerCase().trim();
        
        if (answer === 'r' || answer === 'related') {
            return await this.handleRelatedProjectsChoice(fromProject, toProject);
        }
        
        return answer === '' || answer === 'y' || answer === 'yes';
    }

    /**
     * Handle multi-project or cross-project switching
     */
    async handleMultiProjectSwitch(projectAnalysis) {
        const { primary_project, secondary_projects, cross_project_context } = projectAnalysis;
        
        if (!cross_project_context || secondary_projects.length === 0) {
            return { 
                action: 'single_project', 
                project: primary_project?.name 
            };
        }
        
        console.log('\n🔀 ' + '='.repeat(60));
        console.log('🧠 MULTI-PROJECT CONTEXT DETECTED');
        console.log('='.repeat(60));
        
        console.log(`\n📍 Primary Project: ${primary_project.name} (${Math.round(primary_project.confidence * 100)}% confidence)`);
        
        if (secondary_projects.length > 0) {
            console.log('\n🔗 Related Projects Also Detected:');
            secondary_projects.forEach((proj, index) => {
                console.log(`   ${index + 1}. ${proj.name} (${Math.round(proj.confidence * 100)}% confidence)`);
            });
        }
        
        const options = [
            `1. Focus on ${primary_project.name} (primary)`,
            '2. Work across multiple projects',
            '3. Select different project',
            '4. Continue without project context'
        ];
        
        console.log('\nOptions:');
        options.forEach(option => console.log(`   ${option}`));
        
        const response = await this.askQuestion('\nChoose option [1-4]: ');
        const choice = parseInt(response.trim());
        
        switch (choice) {
            case 1:
                return { 
                    action: 'single_project', 
                    project: primary_project.name 
                };
            case 2:
                return { 
                    action: 'multi_project', 
                    primary_project: primary_project.name,
                    secondary_projects: secondary_projects.map(p => p.name)
                };
            case 3:
                return await this.showProjectSelection({
                    title: 'Select Alternative Project',
                    suggestions: await this.getAllAvailableProjects()
                });
            case 4:
                return { action: 'no_project' };
            default:
                return { 
                    action: 'single_project', 
                    project: primary_project.name 
                };
        }
    }

    /**
     * Confirm directory-based project switch
     */
    async confirmDirectoryProjectSwitch(oldPath, newPath, detectedProject) {
        console.log('\n📁 Directory Change Detected');
        console.log(`   From: ${this.shortenPath(oldPath)}`);
        console.log(`   To:   ${this.shortenPath(newPath)}`);
        console.log(`   Detected Project: ${detectedProject}`);
        
        const response = await this.askQuestion(
            'Switch to detected project? [Y/n/s] (s=show details): '
        );
        
        const answer = response.toLowerCase().trim();
        
        if (answer === 's' || answer === 'show') {
            await this.showDirectorySwitchDetails(oldPath, newPath, detectedProject);
            return await this.confirmDirectoryProjectSwitch(oldPath, newPath, detectedProject);
        }
        
        return answer === '' || answer === 'y' || answer === 'yes';
    }

    /**
     * Show project selection with intelligent suggestions
     */
    async showProjectSelection(options) {
        const { title, message, suggestions } = options;
        
        console.log(`\n🧠 ${title}`);
        console.log('='.repeat(title.length + 4));
        
        if (message) {
            console.log(`\n${message}`);
        }
        
        if (suggestions && suggestions.length > 0) {
            console.log('\n📊 Smart Suggestions:');
            suggestions.forEach((suggestion, index) => {
                const confidence = Math.round(suggestion.confidence * 100);
                const emoji = this.getConfidenceEmoji(suggestion.confidence);
                
                console.log(`   ${index + 1}. ${emoji} ${suggestion.project} (${confidence}%)`);
                console.log(`      ${suggestion.reason}`);
                
                if (suggestion.evidence) {
                    console.log(`      Evidence: ${suggestion.evidence.slice(0, 2).join(', ')}`);
                }
                console.log();
            });
        }
        
        const options_list = [
            ...suggestions.map((s, i) => `${i + 1}. Select ${s.project}`),
            `${suggestions.length + 1}. Create new project`,
            `${suggestions.length + 2}. Continue without project`,
            `${suggestions.length + 3}. Show all projects`
        ];
        
        console.log('Options:');
        options_list.forEach(option => console.log(`   ${option}`));
        
        const response = await this.askQuestion(`\nChoice [1-${options_list.length}]: `);
        const choice = parseInt(response.trim());
        
        if (choice >= 1 && choice <= suggestions.length) {
            return {
                action: 'select',
                project: suggestions[choice - 1].project,
                suggestion: suggestions[choice - 1]
            };
        } else if (choice === suggestions.length + 1) {
            return { action: 'new' };
        } else if (choice === suggestions.length + 2) {
            return { action: 'continue' };
        } else if (choice === suggestions.length + 3) {
            return await this.showAllProjects();
        } else {
            console.log('Invalid choice, please try again.');
            return await this.showProjectSelection(options);
        }
    }

    /**
     * Build confirmation message for project switching
     */
    buildSwitchConfirmationMessage(fromProject, toProject, reason) {
        let message = `PROJECT SWITCH SUGGESTION\n\n`;
        
        if (fromProject) {
            message += `Current: ${fromProject}\n`;
        }
        message += `Suggested: ${toProject}\n`;
        message += `Reason: ${reason}\n`;
        
        return message;
    }

    /**
     * Handle related projects choice
     */
    async handleRelatedProjectsChoice(fromProject, toProject) {
        // This could show related projects and let user choose multiple
        // For now, we'll implement a simple version
        console.log(`\n🔗 Related Projects to ${toProject}:`);
        
        // This would normally fetch from project analyzer
        const relatedProjects = ['ChittyFinance', 'ChittyChain', 'ChittyChat'];
        
        relatedProjects.forEach((proj, index) => {
            console.log(`   ${index + 1}. ${proj}`);
        });
        
        const response = await this.askQuestion(
            'Work with related projects? [Y/n]: '
        );
        
        return response.toLowerCase().trim() !== 'n';
    }

    /**
     * Show directory switch details
     */
    async showDirectorySwitchDetails(oldPath, newPath, detectedProject) {
        console.log('\n📋 Directory Switch Analysis:');
        console.log(`   Old Directory: ${oldPath}`);
        console.log(`   New Directory: ${newPath}`);
        console.log(`   Detected Project: ${detectedProject}`);
        
        // Here we could show more details about why this project was detected
        // File patterns, directory structure, etc.
        
        await this.askQuestion('\nPress Enter to continue...');
    }

    /**
     * Prompt for new project creation
     */
    async promptNewProject(options) {
        console.log(`\n${options.title}`);
        console.log(`${options.message}\n`);
        
        if (options.suggestions && options.suggestions.length > 0) {
            console.log('💡 Suggestions based on current context:');
            options.suggestions.forEach((suggestion, index) => {
                console.log(`   ${index + 1}. ${suggestion}`);
            });
            console.log();
        }
        
        const projectName = await this.askQuestion('Project name (or number from suggestions): ');
        
        // Check if user selected a suggestion by number
        const suggestionIndex = parseInt(projectName) - 1;
        if (options.suggestions && suggestionIndex >= 0 && suggestionIndex < options.suggestions.length) {
            const selectedSuggestion = options.suggestions[suggestionIndex];
            const description = await this.askQuestion(`Description for "${selectedSuggestion}": `);
            
            return {
                projectName: selectedSuggestion,
                description: description || `Auto-generated project: ${selectedSuggestion}`
            };
        }
        
        const description = await this.askQuestion('Project description (optional): ');
        
        return {
            projectName: projectName.trim(),
            description: description.trim() || `Project: ${projectName.trim()}`
        };
    }

    /**
     * Get confidence emoji
     */
    getConfidenceEmoji(confidence) {
        if (confidence >= 0.8) return '🎯';
        if (confidence >= 0.6) return '✅';
        if (confidence >= 0.4) return '⚡';
        return '💡';
    }

    /**
     * Shorten file paths for display
     */
    shortenPath(filePath) {
        if (filePath.length > 50) {
            return '...' + filePath.slice(-47);
        }
        return filePath;
    }

    /**
     * Ask question and get response
     */
    askQuestion(question) {
        return new Promise((resolve) => {
            this.rl.question(question, (answer) => {
                this.promptHistory.push({
                    question,
                    answer,
                    timestamp: new Date().toISOString()
                });
                resolve(answer);
            });
        });
    }

    /**
     * Show all available projects
     */
    async showAllProjects() {
        console.log('\n📚 All Available Projects:');
        
        // This would fetch from ChittyChat or project registry
        const allProjects = [
            'Arias-v-Bianchi',
            'ChittyOS-Core',
            'ChittyFinance', 
            'ChittyChat',
            'ChiCo-Properties',
            'IT-CAN-BE-LLC'
        ];
        
        allProjects.forEach((project, index) => {
            console.log(`   ${index + 1}. ${project}`);
        });
        
        const response = await this.askQuestion(`\nSelect project [1-${allProjects.length}]: `);
        const choice = parseInt(response.trim());
        
        if (choice >= 1 && choice <= allProjects.length) {
            return {
                action: 'select',
                project: allProjects[choice - 1]
            };
        }
        
        return { action: 'continue' };
    }

    /**
     * Close readline interface
     */
    close() {
        this.rl.close();
    }
}

module.exports = { UserPrompt };