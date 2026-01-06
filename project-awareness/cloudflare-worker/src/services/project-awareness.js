/**
 * Project Awareness Service
 * Core service that implements all MCP tool functionality for HTTP endpoints
 */

export class ProjectAwarenessService {
  constructor(env) {
    this.env = env;
    this.confidenceThreshold = 0.75;
  }

  /**
   * Get project suggestions based on context (MCP: get_project_suggestions)
   */
  async getProjectSuggestions(context) {
    try {
      const suggestions = [];
      
      // Analyze working directory patterns
      if (context.workingDirectory) {
        const directoryProject = await this.detectProjectFromDirectory(context.workingDirectory);
        if (directoryProject) {
          suggestions.push({
            project: directoryProject.name,
            confidence: directoryProject.confidence,
            reason: `Working directory matches ${directoryProject.name}`,
            type: 'directory_match'
          });
        }
      }

      // Analyze recent file patterns
      if (context.recentFiles && context.recentFiles.length > 0) {
        const fileProjects = await this.detectProjectsFromFiles(context.recentFiles);
        suggestions.push(...fileProjects.map(fp => ({
          project: fp.project,
          confidence: fp.confidence,
          reason: `Recent files suggest ${fp.project}`,
          type: 'file_pattern'
        })));
      }

      // Get active projects from ChittyChat
      const activeProjects = await this.getActiveChittyChatProjects();
      suggestions.push(...activeProjects.map(ap => ({
        project: ap.name,
        confidence: ap.activity_score,
        reason: `Active in ChittyChat with ${ap.open_tasks} open tasks`,
        type: 'chittychat_active'
      })));

      // Analyze historical patterns
      const historicalProjects = await this.analyzeHistoricalPatterns(context);
      suggestions.push(...historicalProjects);

      // Sort by confidence and remove duplicates
      return suggestions
        .sort((a, b) => b.confidence - a.confidence)
        .filter((suggestion, index, arr) => 
          index === arr.findIndex(s => s.project === suggestion.project)
        )
        .slice(0, 5);

    } catch (error) {
      console.error('Error getting project suggestions:', error);
      return [];
    }
  }

  /**
   * Set active project (MCP: set_active_project)
   */
  async setActiveProject(projectName, context = {}) {
    try {
      // Update ChittyChat context
      await this.setChittyChatActiveProject(projectName, context);
      
      // Store in project store
      await this.env.PROJECT_STORE.put(
        `current_project:${context.session_id || 'default'}`,
        projectName,
        {
          expirationTtl: 86400 // 24 hours
        }
      );

      // Update project activity
      await this.updateProjectActivity(projectName, 'project_switch', context);

      return {
        success: true,
        project: projectName,
        updated_at: new Date().toISOString()
      };

    } catch (error) {
      console.error('Error setting active project:', error);
      throw error;
    }
  }

  /**
   * Analyze current context (MCP: analyze_current_context)
   */
  async analyzeCurrentContext({ platform, workingDirectory }) {
    try {
      const context = {
        platform: platform,
        working_directory: workingDirectory,
        timestamp: new Date().toISOString()
      };

      // Detect project from working directory
      if (workingDirectory) {
        const projectDetection = await this.detectProjectFromDirectory(workingDirectory);
        context.detected_project = projectDetection;
      }

      // Get recent activity from platform
      context.recent_activity = await this.getRecentPlatformActivity(platform);

      // Analyze patterns
      context.patterns = await this.analyzeContextPatterns(context);

      return context;

    } catch (error) {
      console.error('Error analyzing current context:', error);
      throw error;
    }
  }

  /**
   * Get project statistics (MCP: get_project_statistics)
   */
  async getProjectStatistics(projectName, timeRange = 'all') {
    try {
      const stats = {
        project_name: projectName,
        time_range: timeRange,
        generated_at: new Date().toISOString()
      };

      // Get project memory
      const projectMemory = await this.env.PROJECT_STORE.get(
        `project_memory:${projectName}`,
        'json'
      );

      if (projectMemory) {
        stats.total_sessions = projectMemory.sessions.length;
        stats.session_breakdown = this.analyzeSessionBreakdown(projectMemory.sessions);
        stats.tool_usage = projectMemory.patterns?.tool_usage || {};
        stats.file_patterns = projectMemory.patterns?.file_patterns || {};
        stats.workflow_types = projectMemory.patterns?.workflow_types || {};
      }

      // Get ChittyChat stats
      const chittyChatStats = await this.getChittyChatProjectStats(projectName);
      if (chittyChatStats) {
        stats.chittychat_integration = chittyChatStats;
      }

      // Calculate activity metrics
      stats.activity_metrics = await this.calculateActivityMetrics(projectName, timeRange);

      return stats;

    } catch (error) {
      console.error('Error getting project statistics:', error);
      throw error;
    }
  }

  /**
   * Detect project from directory path
   */
  async detectProjectFromDirectory(directory) {
    try {
      const projectPatterns = await this.getProjectPatterns();
      
      for (const pattern of projectPatterns) {
        if (directory.includes(pattern.path_fragment)) {
          return {
            name: pattern.project_name,
            confidence: pattern.confidence,
            matched_pattern: pattern.path_fragment
          };
        }
      }

      // Try to extract project name from path
      const pathParts = directory.split('/').filter(part => part.length > 0);
      const potentialProject = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2];
      
      if (potentialProject && potentialProject !== 'src' && potentialProject !== 'lib') {
        return {
          name: this.normalizeProjectName(potentialProject),
          confidence: 0.6,
          matched_pattern: 'directory_name'
        };
      }

      return null;
    } catch (error) {
      console.error('Error detecting project from directory:', error);
      return null;
    }
  }

  /**
   * Detect projects from recent files
   */
  async detectProjectsFromFiles(recentFiles) {
    try {
      const projects = [];
      const projectPatterns = await this.getProjectPatterns();

      for (const file of recentFiles) {
        for (const pattern of projectPatterns) {
          if (pattern.file_patterns.some(fp => file.name.match(new RegExp(fp)))) {
            projects.push({
              project: pattern.project_name,
              confidence: pattern.confidence * 0.8, // Slightly lower confidence for files
              file_match: file.name
            });
          }
        }
      }

      // Group by project and average confidence
      const projectMap = new Map();
      for (const project of projects) {
        if (projectMap.has(project.project)) {
          const existing = projectMap.get(project.project);
          existing.confidence = (existing.confidence + project.confidence) / 2;
          existing.file_matches.push(project.file_match);
        } else {
          projectMap.set(project.project, {
            project: project.project,
            confidence: project.confidence,
            file_matches: [project.file_match]
          });
        }
      }

      return Array.from(projectMap.values());
    } catch (error) {
      console.error('Error detecting projects from files:', error);
      return [];
    }
  }

  /**
   * Get project patterns for detection
   */
  async getProjectPatterns() {
    // In a real implementation, this would be stored in KV or R2
    return [
      {
        project_name: 'chittyops',
        path_fragment: 'chittyos/chittyops',
        confidence: 0.95,
        file_patterns: ['*.chitty.js', 'chitty*.json', 'mcp-server*']
      },
      {
        project_name: 'chittychat',
        path_fragment: 'chittychat',
        confidence: 0.9,
        file_patterns: ['package.json', 'tsconfig.json', '*.tsx', '*.ts']
      },
      {
        project_name: 'furnished-condos',
        path_fragment: 'furnishedcondos',
        confidence: 0.85,
        file_patterns: ['property*.json', 'tenant*.js', 'rental*']
      },
      {
        project_name: 'legal-arias-bianchi',
        path_fragment: 'Legal Cases/Arias v Bianchi',
        confidence: 0.9,
        file_patterns: ['*.legal', 'motion*.pdf', 'evidence*']
      }
    ];
  }

  /**
   * Get active ChittyChat projects
   */
  async getActiveChittyChatProjects() {
    try {
      const response = await fetch(`${this.env.CHITTYCHAT_API_URL}/api/projects/active`, {
        headers: {
          'Authorization': `Bearer ${this.env.CHITTYCHAT_API_KEY}`
        }
      });

      if (response.ok) {
        const projects = await response.json();
        return projects.map(project => ({
          name: project.name,
          activity_score: this.calculateActivityScore(project),
          open_tasks: project.open_tasks || 0,
          last_activity: project.last_activity
        }));
      }

      return [];
    } catch (error) {
      console.error('Error getting active ChittyChat projects:', error);
      return [];
    }
  }

  /**
   * Set active project in ChittyChat
   */
  async setChittyChatActiveProject(projectName, context) {
    try {
      const response = await fetch(`${this.env.CHITTYCHAT_API_URL}/api/projects/set-active`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.env.CHITTYCHAT_API_KEY}`
        },
        body: JSON.stringify({
          project_name: projectName,
          context: {
            ...context,
            switched_via: 'project-awareness-worker',
            timestamp: new Date().toISOString()
          }
        })
      });

      return response.ok;
    } catch (error) {
      console.error('Error setting ChittyChat active project:', error);
      return false;
    }
  }

  /**
   * Analyze historical patterns
   */
  async analyzeHistoricalPatterns(context) {
    try {
      const patterns = [];
      
      // Get historical project switches for the platform
      const platformHistory = await this.env.CROSS_PLATFORM_SYNC.get(
        `history:${context.platform}:project_switches`,
        'json'
      ) || [];

      // Find frequently used projects
      const projectFrequency = new Map();
      platformHistory.forEach(switch_ => {
        const count = projectFrequency.get(switch_.project) || 0;
        projectFrequency.set(switch_.project, count + 1);
      });

      // Convert to suggestions
      for (const [project, frequency] of projectFrequency.entries()) {
        if (frequency >= 2) { // Only suggest if used multiple times
          patterns.push({
            project: project,
            confidence: Math.min(0.8, frequency * 0.1),
            reason: `Frequently used project (${frequency} times)`,
            type: 'historical'
          });
        }
      }

      return patterns;
    } catch (error) {
      console.error('Error analyzing historical patterns:', error);
      return [];
    }
  }

  /**
   * Calculate activity score for project prioritization
   */
  calculateActivityScore(project) {
    let score = 0;
    
    // Recent activity
    if (project.last_activity) {
      const daysSinceActivity = (Date.now() - new Date(project.last_activity)) / (1000 * 60 * 60 * 24);
      score += Math.max(0, 1 - daysSinceActivity / 30); // Decay over 30 days
    }
    
    // Open tasks
    if (project.open_tasks > 0) {
      score += Math.min(project.open_tasks / 10, 0.5); // Up to 0.5 for tasks
    }
    
    // Active sessions
    if (project.active_sessions > 0) {
      score += 0.3;
    }
    
    return Math.min(score, 1.0);
  }

  /**
   * Update project activity
   */
  async updateProjectActivity(projectName, activityType, context) {
    try {
      const activityKey = `activity:${projectName}`;
      let activity = await this.env.PROJECT_STORE.get(activityKey, 'json') || {
        project: projectName,
        activities: []
      };

      activity.activities.push({
        type: activityType,
        timestamp: new Date().toISOString(),
        platform: context.platform,
        session_id: context.session_id
      });

      // Keep only recent activities
      activity.activities = activity.activities.slice(-100);
      activity.last_activity = new Date().toISOString();

      await this.env.PROJECT_STORE.put(
        activityKey,
        JSON.stringify(activity),
        {
          expirationTtl: 604800 // 7 days
        }
      );

    } catch (error) {
      console.error('Error updating project activity:', error);
    }
  }

  /**
   * Get recent platform activity
   */
  async getRecentPlatformActivity(platform) {
    try {
      const sessions = await this.env.SESSION_STORE.get(`platform:${platform}:sessions`, 'json') || [];
      
      return sessions
        .filter(session => {
          const connectedAt = new Date(session.connected_at);
          const oneHourAgo = new Date(Date.now() - 3600000);
          return connectedAt > oneHourAgo;
        })
        .map(session => ({
          session_id: session.session_id,
          user_id: session.user_id,
          connected_at: session.connected_at
        }));
    } catch (error) {
      console.error('Error getting recent platform activity:', error);
      return [];
    }
  }

  /**
   * Analyze context patterns
   */
  async analyzeContextPatterns(context) {
    return {
      project_detection_confidence: context.detected_project?.confidence || 0,
      recent_activity_count: context.recent_activity?.length || 0,
      platform_activity_level: this.calculateActivityLevel(context.recent_activity || [])
    };
  }

  /**
   * Calculate activity level
   */
  calculateActivityLevel(activities) {
    if (activities.length === 0) return 'inactive';
    if (activities.length < 3) return 'low';
    if (activities.length < 10) return 'medium';
    return 'high';
  }

  /**
   * Analyze session breakdown
   */
  analyzeSessionBreakdown(sessions) {
    const breakdown = {
      by_platform: {},
      by_workflow: {},
      total_duration: 0,
      average_duration: 0
    };

    sessions.forEach(session => {
      // Platform breakdown
      breakdown.by_platform[session.platform] = (breakdown.by_platform[session.platform] || 0) + 1;
      
      // Duration calculation
      if (session.duration) {
        breakdown.total_duration += session.duration;
      }
    });

    if (sessions.length > 0) {
      breakdown.average_duration = breakdown.total_duration / sessions.length;
    }

    return breakdown;
  }

  /**
   * Get ChittyChat project statistics
   */
  async getChittyChatProjectStats(projectName) {
    try {
      const response = await fetch(`${this.env.CHITTYCHAT_API_URL}/api/projects/${projectName}/stats`, {
        headers: {
          'Authorization': `Bearer ${this.env.CHITTYCHAT_API_KEY}`
        }
      });

      if (response.ok) {
        return await response.json();
      }

      return null;
    } catch (error) {
      console.error('Error getting ChittyChat project stats:', error);
      return null;
    }
  }

  /**
   * Calculate activity metrics
   */
  async calculateActivityMetrics(projectName, timeRange) {
    try {
      const activity = await this.env.PROJECT_STORE.get(`activity:${projectName}`, 'json');
      
      if (!activity) {
        return {
          total_activities: 0,
          recent_activities: 0,
          activity_trend: 'stable'
        };
      }

      const now = new Date();
      let cutoff;
      
      switch (timeRange) {
        case 'day':
          cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case 'week':
          cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          cutoff = new Date(0); // All time
      }

      const recentActivities = activity.activities.filter(
        act => new Date(act.timestamp) > cutoff
      );

      return {
        total_activities: activity.activities.length,
        recent_activities: recentActivities.length,
        activity_trend: this.calculateTrend(activity.activities),
        platforms_used: new Set(recentActivities.map(act => act.platform)).size
      };

    } catch (error) {
      console.error('Error calculating activity metrics:', error);
      return {};
    }
  }

  /**
   * Calculate trend from activity data
   */
  calculateTrend(activities) {
    if (activities.length < 4) return 'stable';

    const recent = activities.slice(-10);
    const older = activities.slice(-20, -10);

    if (recent.length > older.length) return 'increasing';
    if (recent.length < older.length) return 'decreasing';
    return 'stable';
  }

  /**
   * Normalize project name
   */
  normalizeProjectName(name) {
    return name
      .toLowerCase()
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  }
}