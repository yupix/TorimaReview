// src/controllers/planning_controller.ts
import { PlanningService } from '../services/planning_service';
import { config } from '../config';

// Webhookペイロードの型定義 (簡易版、必要に応じて@octokit/webhooks-typesからインポート)
interface IssueCommentPayload {
  action: string;
  issue: {
    number: number;
    pull_request?: { url: string; }; // PRコメントかIssueコメントかの識別に利用
  };
  comment: {
    id: number;
    body: string;
    user: { login: string; };
  };
  repository: {
    name: string;
    owner: { login: string; };
  };
  installation?: { id: number; };
  sender: { type: string; login: string; }; // Bot判定に利用
}

export class PlanningController {
  constructor(private planningService: PlanningService) {}

  async handleIssueComment(payload: IssueCommentPayload): Promise<void> {
    // このコントローラーはIssueに対するプランニングなので、PRへのコメントは処理しない
    if (payload.issue.pull_request) {
      // console.log('[PlanningController] Comment is on a Pull Request, skipping planning.');
      return;
    }

    if (payload.action !== 'created') {
      // console.log('[PlanningController] Action is not "created", skipping planning.');
      return;
    }
    
    // Botによるコメントの場合は無視 (無限ループや意図しない実行を防ぐ)
    // GitHub App の Slug 名 (例: `myapp[bot]`) と sender.login が一致するかで判定するのがより確実
    if (payload.sender.type === 'Bot' && payload.sender.login.endsWith('[bot]')) {
        console.log('[PlanningController] Comment from a bot (likely self), skipping planning.');
        return;
    }

    const commentBody = payload.comment.body.trim();
    const planCommand = config.github.planCommand;

    if (commentBody.startsWith(planCommand)) {
      const installationId = payload.installation?.id;
      if (!installationId) {
        console.error('[PlanningController] Installation ID not found for planning command.');
        // TODO: 必要であれば、ここでIssueにエラー通知コメントを投稿
        return;
      }

      const owner = payload.repository.owner.login;
      const repo = payload.repository.name;
      const issueNumber = payload.issue.number;
      const commenter = payload.comment.user.login;

      // 将来的なオプション解析 (例: `!plan detailed` や `!plan as <persona>`)
      // const commandParts = commentBody.split(/\s+/);
      // const planType = commandParts.length > 1 && commandParts[1] === 'detailed' ? 'detailed' : 'default';
      // const requestedPersona = commandParts.find(part => part.startsWith('as='))?.split('=')[1];

      console.log(`[PlanningController] Planning command "${planCommand}" detected for Issue: ${owner}/${repo}#${issueNumber}, Requester: @${commenter}`);

      // PlanningServiceの処理を呼び出す (非同期で実行されることを期待)
      this.planningService.processPlanningRequest(installationId, owner, repo, issueNumber, commenter)
        .catch(error => {
          // 通常はPlanningService内でエラー処理と通知が行われるが、ここでもログは残す
          console.error("[PlanningController] Error during planningService.processPlanningRequest (unhandled here):", error);
        });
    } else {
      // console.log(`[PlanningController] Comment does not start with planning command "${planCommand}", skipping.`);
    }
  }
}