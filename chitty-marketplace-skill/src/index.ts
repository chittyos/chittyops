/**
 * ChittyOS Claude Marketplace Skill
 *
 * Provides legal intelligence capabilities as a Claude Skill with
 * specialized UI components and domain-specific workflows.
 */

import { ClaudeSkill, SkillContext, UIComponent, Workflow } from '@anthropic-ai/claude-skills-sdk';
import { z } from 'zod';
import { ChittyConnectClient } from './chittyconnect';

/**
 * Evidence Verification UI Component
 */
class EvidenceVerificationUI implements UIComponent {
  name = 'evidence_verification';

  async render(context: SkillContext): Promise<string> {
    return `
      <div class="chitty-evidence-panel">
        <h3>Evidence Verification System</h3>

        <div class="evidence-upload">
          <label>Upload Evidence Document</label>
          <input type="file" id="evidence-file" accept=".pdf,.doc,.docx,.txt,.jpg,.png" />
          <button onclick="chittySkill.uploadEvidence()">Verify Authenticity</button>
        </div>

        <div class="chain-custody">
          <h4>Chain of Custody</h4>
          <div id="custody-timeline"></div>
        </div>

        <div class="verification-status">
          <span class="status-indicator" id="verify-status">⏳ Awaiting Upload</span>
          <div id="verification-details"></div>
        </div>

        <div class="contradictions-panel" style="display:none;" id="contradictions">
          <h4>⚠️ Contradictions Detected</h4>
          <ul id="contradiction-list"></ul>
        </div>
      </div>
    `;
  }

  async handleAction(action: string, params: any, context: SkillContext): Promise<any> {
    switch (action) {
      case 'uploadEvidence':
        return await this.verifyEvidence(params.file, context);

      case 'showChainOfCustody':
        return await this.getChainOfCustody(params.evidenceId, context);

      case 'detectContradictions':
        return await this.findContradictions(params.caseId, context);

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  private async verifyEvidence(file: File, context: SkillContext): Promise<any> {
    // Calculate file hash
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Call ChittyVerify service
    const response = await fetch('https://verify.chitty.cc/api/evidence/verify', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${context.auth.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        hash: hashHex,
        filename: file.name,
        size: file.size,
        mimeType: file.type,
        metadata: {
          uploadedBy: context.user.id,
          uploadedAt: new Date().toISOString(),
          source: 'claude-marketplace-skill'
        }
      })
    });

    const result = await response.json();

    // Update UI with verification results
    await context.updateUI('verify-status', {
      status: result.data.verified ? '✅ Verified' : '❌ Verification Failed',
      class: result.data.verified ? 'status-success' : 'status-error'
    });

    await context.updateUI('verification-details', {
      html: `
        <dl>
          <dt>Evidence ID:</dt>
          <dd>${result.data.evidenceId}</dd>

          <dt>Hash:</dt>
          <dd><code>${hashHex.substring(0, 16)}...</code></dd>

          <dt>Timestamp:</dt>
          <dd>${result.data.verifiedAt}</dd>

          <dt>Admissibility:</dt>
          <dd>${result.data.admissible ? 'Court Admissible' : 'Review Required'}</dd>
        </dl>
      `
    });

    // Check for contradictions
    if (result.data.contradictions?.length > 0) {
      await this.displayContradictions(result.data.contradictions, context);
    }

    return result.data;
  }

  private async getChainOfCustody(evidenceId: string, context: SkillContext): Promise<any> {
    const response = await fetch(`https://verify.chitty.cc/api/evidence/${evidenceId}/chain`, {
      headers: {
        'Authorization': `Bearer ${context.auth.token}`
      }
    });

    const result = await response.json();
    const chain = result.data.chain;

    // Build timeline visualization
    const timelineHtml = chain.map((entry: any, index: number) => `
      <div class="custody-entry">
        <div class="custody-index">${index + 1}</div>
        <div class="custody-details">
          <strong>${entry.custodian}</strong><br/>
          <small>${entry.action} - ${new Date(entry.timestamp).toLocaleString()}</small><br/>
          <span class="custody-location">${entry.location}</span>
        </div>
      </div>
    `).join('');

    await context.updateUI('custody-timeline', { html: timelineHtml });

    return chain;
  }

  private async findContradictions(caseId: string, context: SkillContext): Promise<any> {
    const response = await fetch(`https://verify.chitty.cc/api/evidence/contradictions?caseId=${caseId}`, {
      headers: {
        'Authorization': `Bearer ${context.auth.token}`
      }
    });

    const result = await response.json();
    return result.data.contradictions;
  }

  private async displayContradictions(contradictions: any[], context: SkillContext): Promise<void> {
    const listHtml = contradictions.map(c => `
      <li>
        <strong>${c.type}</strong>: ${c.description}<br/>
        <small>Evidence IDs: ${c.evidenceIds.join(', ')}</small>
      </li>
    `).join('');

    await context.updateUI('contradictions', { display: 'block' });
    await context.updateUI('contradiction-list', { html: listHtml });
  }
}

/**
 * Trust Score Analysis UI Component
 */
class TrustScoreUI implements UIComponent {
  name = 'trust_score_analysis';

  async render(context: SkillContext): Promise<string> {
    return `
      <div class="chitty-trust-panel">
        <h3>6D Trust Analysis</h3>

        <div class="trust-input">
          <input type="text" id="chitty-id" placeholder="Enter ChittyID (e.g., 01-C-POI-7823-P-2411-3-X)" />
          <button onclick="chittySkill.analyzeTrust()">Analyze Trust</button>
        </div>

        <div class="trust-visualization" id="trust-viz" style="display:none;">
          <canvas id="trust-radar" width="400" height="400"></canvas>

          <div class="trust-scores">
            <div class="score-card" id="people-score">
              <h5>People Score</h5>
              <span class="score-value">--</span>
            </div>

            <div class="score-card" id="legal-score">
              <h5>Legal Score</h5>
              <span class="score-value">--</span>
            </div>

            <div class="score-card" id="state-score">
              <h5>State Score</h5>
              <span class="score-value">--</span>
            </div>

            <div class="score-card" id="chitty-score">
              <h5>ChittyScore™</h5>
              <span class="score-value">--</span>
            </div>
          </div>

          <div class="trust-breakdown">
            <h4>Dimensional Breakdown</h4>
            <dl id="dimension-list"></dl>
          </div>
        </div>
      </div>
    `;
  }

  async handleAction(action: string, params: any, context: SkillContext): Promise<any> {
    if (action === 'analyzeTrust') {
      const chittyId = params.chittyId;

      // Validate ChittyID format
      const chittyIdPattern = /^\d{2}-[A-Z]-[A-Z]{3}-\d{4}-[PTOLC]-\d{4}-\d-[A-Z]$/;
      if (!chittyIdPattern.test(chittyId)) {
        await context.showError('Invalid ChittyID format');
        return null;
      }

      // Fetch trust scores
      const response = await fetch(`https://score.chitty.cc/api/trust/score/${chittyId}?dimension=all`, {
        headers: {
          'Authorization': `Bearer ${context.auth.token}`
        }
      });

      if (!response.ok) {
        await context.showError('Failed to retrieve trust scores');
        return null;
      }

      const result = await response.json();
      const scores = result.data;

      // Update UI with scores
      await context.updateUI('trust-viz', { display: 'block' });

      // Update score cards
      await context.updateUI('people-score', {
        querySelector: '.score-value',
        text: (scores.peopleScore * 100).toFixed(1) + '%'
      });

      await context.updateUI('legal-score', {
        querySelector: '.score-value',
        text: (scores.legalScore * 100).toFixed(1) + '%'
      });

      await context.updateUI('state-score', {
        querySelector: '.score-value',
        text: (scores.stateScore * 100).toFixed(1) + '%'
      });

      await context.updateUI('chitty-score', {
        querySelector: '.score-value',
        text: (scores.chittyScore * 100).toFixed(1) + '%',
        class: this.getScoreClass(scores.chittyScore)
      });

      // Update dimensional breakdown
      const dimensions = ['source', 'temporal', 'channel', 'outcome', 'network', 'justice'];
      const breakdownHtml = dimensions.map(dim => `
        <dt>${dim.charAt(0).toUpperCase() + dim.slice(1)}:</dt>
        <dd>
          <div class="score-bar">
            <div class="score-fill" style="width: ${scores.scores[dim] * 100}%"></div>
          </div>
          <span>${(scores.scores[dim] * 100).toFixed(1)}%</span>
        </dd>
      `).join('');

      await context.updateUI('dimension-list', { html: breakdownHtml });

      // Draw radar chart
      await this.drawRadarChart(scores.scores, context);

      return scores;
    }

    throw new Error(`Unknown action: ${action}`);
  }

  private getScoreClass(score: number): string {
    if (score >= 0.8) return 'score-excellent';
    if (score >= 0.6) return 'score-good';
    if (score >= 0.4) return 'score-fair';
    return 'score-poor';
  }

  private async drawRadarChart(scores: Record<string, number>, context: SkillContext): Promise<void> {
    // This would integrate with a charting library in production
    // For now, we'll update the canvas with a placeholder
    await context.executeScript(`
      const canvas = document.getElementById('trust-radar');
      const ctx = canvas.getContext('2d');

      // Clear canvas
      ctx.clearRect(0, 0, 400, 400);

      // Draw radar chart
      const dimensions = ['Source', 'Temporal', 'Channel', 'Outcome', 'Network', 'Justice'];
      const values = [${Object.values(scores).join(',')}];

      // Simplified radar chart drawing
      ctx.strokeStyle = '#4a90e2';
      ctx.fillStyle = 'rgba(74, 144, 226, 0.3)';
      ctx.lineWidth = 2;

      // Center point
      const centerX = 200;
      const centerY = 200;
      const radius = 150;

      ctx.beginPath();
      dimensions.forEach((dim, i) => {
        const angle = (Math.PI * 2 * i) / dimensions.length - Math.PI / 2;
        const value = values[i] * radius;
        const x = centerX + Math.cos(angle) * value;
        const y = centerY + Math.sin(angle) * value;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    `);
  }
}

/**
 * Case Workflow Component
 */
class CaseWorkflow implements Workflow {
  name = 'legal_case_workflow';

  async getSteps(context: SkillContext): Promise<any[]> {
    return [
      {
        id: 'case_creation',
        name: 'Create Case',
        description: 'Initialize a new legal case with basic information',
        inputs: {
          title: { type: 'text', required: true },
          type: { type: 'select', options: ['civil', 'criminal', 'family', 'corporate'] },
          jurisdiction: { type: 'text', required: true },
          parties: { type: 'array', itemType: 'text' }
        }
      },
      {
        id: 'evidence_collection',
        name: 'Collect Evidence',
        description: 'Upload and verify evidence items',
        component: 'evidence_verification',
        multiple: true
      },
      {
        id: 'party_verification',
        name: 'Verify Parties',
        description: 'Generate ChittyIDs and verify trust scores for all parties',
        automate: true,
        actions: ['generateChittyIds', 'calculateTrustScores']
      },
      {
        id: 'element_mapping',
        name: 'Map Legal Elements',
        description: 'Map evidence to legal elements and claims',
        inputs: {
          claims: { type: 'array', itemType: 'text' },
          elements: { type: 'array', itemType: 'object' }
        }
      },
      {
        id: 'deadline_tracking',
        name: 'Set Deadlines',
        description: 'Configure case deadlines and milestones',
        inputs: {
          filingDeadline: { type: 'date', required: true },
          discoveryDeadline: { type: 'date' },
          trialDate: { type: 'date' }
        }
      },
      {
        id: 'report_generation',
        name: 'Generate Reports',
        description: 'Create court-ready documentation',
        outputs: ['case_summary.pdf', 'evidence_report.pdf', 'chain_custody_log.pdf']
      }
    ];
  }

  async execute(step: string, inputs: any, context: SkillContext): Promise<any> {
    switch (step) {
      case 'case_creation':
        return await this.createCase(inputs, context);

      case 'party_verification':
        return await this.verifyParties(inputs.parties, context);

      case 'report_generation':
        return await this.generateReports(inputs.caseId, context);

      default:
        throw new Error(`Unknown workflow step: ${step}`);
    }
  }

  private async createCase(inputs: any, context: SkillContext): Promise<any> {
    const connect = new ChittyConnectClient({ apiToken: context.auth.token });
    const result = await connect.createCase({
      title: inputs.title,
      type: inputs.type,
      jurisdiction: inputs.jurisdiction,
      parties: inputs.parties,
      createdBy: context.user.id,
      status: 'active'
    });

    // Assume API shape { data: { caseId, ... } }
    await context.storeData('currentCaseId', result?.data?.caseId ?? result?.caseId);
    return result?.data ?? result;
  }

  private async verifyParties(parties: string[], context: SkillContext): Promise<any> {
    const verifications = await Promise.all(parties.map(async party => {
      // Generate ChittyID
      const idResponse = await fetch('https://id.chitty.cc/api/v2/chittyid/mint', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${context.auth.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          entity: 'PERSON',
          metadata: { name: party }
        })
      });

      const idResult = await idResponse.json();
      const chittyId = idResult.data.chittyId;

      // Calculate trust score
      const scoreResponse = await fetch(`https://score.chitty.cc/api/trust/score/${chittyId}?dimension=all`, {
        headers: {
          'Authorization': `Bearer ${context.auth.token}`
        }
      });

      const scoreResult = await scoreResponse.json();

      return {
        party,
        chittyId,
        trustScore: scoreResult.data.chittyScore,
        verified: true
      };
    }));

    return verifications;
  }

  private async generateReports(caseId: string, context: SkillContext): Promise<any> {
    const connect = new ChittyConnectClient({ apiToken: context.auth.token });
    const result = await connect.createCaseReports(caseId, {
      types: ['summary', 'evidence', 'chain_custody'],
      format: 'pdf'
    });
    return result?.data?.reports ?? result?.reports ?? result;
  }
}

/**
 * Main ChittyOS Marketplace Skill
 */
export class ChittyOSMarketplaceSkill extends ClaudeSkill {
  constructor() {
    super({
      name: 'ChittyOS Legal Intelligence',
      version: '1.0.0',
      description: 'Complete legal case management with evidence verification and trust analysis'
    });

    // Register UI components
    this.registerComponent(new EvidenceVerificationUI());
    this.registerComponent(new TrustScoreUI());

    // Register workflow
    this.registerWorkflow(new CaseWorkflow());

    // Register custom actions
    this.registerActions();
  }

  private registerActions(): void {
    // Quick actions available from Claude's interface
    this.registerAction('quick_verify', async (params, context) => {
      // Quick evidence verification
      const result = await fetch('https://verify.chitty.cc/api/evidence/quick-verify', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${context.auth.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: params.content })
      });

      return result.json();
    });

    this.registerAction('instant_score', async (params, context) => {
      // Instant trust score calculation
      if (!params.chittyId) {
        throw new Error('ChittyID required for trust scoring');
      }

      const response = await fetch(`https://score.chitty.cc/api/trust/instant/${params.chittyId}`, {
        headers: {
          'Authorization': `Bearer ${context.auth.token}`
        }
      });

      return response.json();
    });

    this.registerAction('contradiction_check', async (params, context) => {
      // Check for contradictions in evidence
      const response = await fetch('https://verify.chitty.cc/api/evidence/contradictions/check', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${context.auth.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          evidenceIds: params.evidenceIds,
          deep: params.deep || false
        })
      });

      return response.json();
    });
  }

  async initialize(context: SkillContext): Promise<void> {
    // Verify user authentication
    if (!context.auth?.token) {
      await context.requestAuth({
        provider: 'chittyauth',
        scopes: ['chittyverify:read', 'chittyverify:write', 'chittyscore:read']
      });
    }

    // Load user preferences
    const prefs = await context.loadPreferences();
    if (prefs) {
      await this.applyPreferences(prefs, context);
    }

    // Initialize telemetry
    await context.trackEvent('skill_initialized', {
      version: this.version,
      userId: context.user.id
    });
  }

  private async applyPreferences(prefs: any, context: SkillContext): Promise<void> {
    // Apply user-specific settings
    if (prefs.theme) {
      await context.setTheme(prefs.theme);
    }

    if (prefs.defaultJurisdiction) {
      await context.storeData('defaultJurisdiction', prefs.defaultJurisdiction);
    }
  }

  async cleanup(context: SkillContext): Promise<void> {
    // Clean up temporary data
    await context.clearTempData();

    // Save session state
    const state = await context.getSessionState();
    await context.saveState(state);

    // Track session end
    await context.trackEvent('skill_cleanup', {
      sessionDuration: context.sessionDuration
    });
  }
}

// Export for Claude Marketplace
export default ChittyOSMarketplaceSkill;
