// src/services/planning_service.ts
import { GitHubService, IssueDetails, IssueComment } from './github_service';
import { GeminiService } from './gemini_service';
import { PersonaService } from './persona_service';
// import { config } from '../config'; // config はここでは直接不要かも

export class PlanningService {
  constructor(
    private githubService: GitHubService,
    private geminiService: GeminiService,
    private personaService: PersonaService
  ) {}

  async processPlanningRequest(
    installationId: number,
    owner: string,
    repo: string,
    issueNumber: number,
    commenter: string,
    // planType: 'default' | 'detailed', // 将来の拡張用
    // requestedPlanningPersona?: string // 将来の拡張用
  ): Promise<void> {
    console.log(`Processing planning request for ${owner}/${repo}#${issueNumber} by @${commenter}.`);

    try {
      const issueDetails: IssueDetails | null = await this.githubService.getIssueDetails(installationId, owner, repo, issueNumber);
      if (!issueDetails) {
        await this.postPlanningMessage(installationId, owner, repo, issueNumber, `Issue #${issueNumber} の詳細が取得できませんでした。プランニングを中止します。`, commenter);
        return;
      }

      const issueComments: IssueComment[] = await this.githubService.listIssueComments(installationId, owner, repo, issueNumber);
      // コメントを要約または最新のものに絞るなど、トークン数対策が必要な場合がある
      const commentsSummary = issueComments
        .map(comment => `User @${comment.user?.login || 'unknown'} (${new Date(comment.created_at).toLocaleString()}):\n${comment.body?.substring(0, 200)}${comment.body && comment.body.length > 200 ? '...' : ''}`)
        .join('\n\n---\n\n');

      // プランニング用の人格を取得 (例: 'planning-default')
      // TODO: requestedPlanningPersona や planType に応じて人格キーを変更するロジックを将来追加
      const personaKeyForPlanning = 'planning-default';
      const basePersonaPrompt = this.personaService.getPersonaPrompt(personaKeyForPlanning, 'default'); // 'default' はフォールバック

      const finalPrompt = this.buildPlanningPrompt(basePersonaPrompt, issueDetails, commentsSummary, commenter);

      console.log(`[${new Date().toISOString()}] Geminiにプランニングをリクエスト中... Issue: ${issueDetails.html_url}`);
      // GeminiService の generateReview メソッドをそのまま使用。より汎用的な名前に変更も検討可。
      const planContent = await this.geminiService.generateReview(finalPrompt);

      if (planContent && planContent.trim() !== '' && !planContent.toLowerCase().includes('error: gemini api')) {
        const formattedPlan = `AIによるプランニング提案 (リクエスト者: @${commenter}) for Issue #${issueNumber}\n\n${planContent}`;
        await this.githubService.createIssueComment(installationId, owner, repo, issueNumber, formattedPlan);
        console.log(`プランニング結果を Issue #${issueNumber} に投稿しました。`);
      } else {
        const message = planContent && planContent.toLowerCase().includes('error: gemini api')
            ? `Gemini APIエラーが発生しました: ${planContent}`
            : `Geminiから有効なプランが生成されませんでした。`;
        await this.postPlanningMessage(installationId, owner, repo, issueNumber, message, commenter, personaKeyForPlanning);
        console.log(message);
      }
    } catch (error) {
      console.error('プランニング処理中に予期せぬエラー:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.postPlanningMessage(installationId, owner, repo, issueNumber, `プランニング処理中に予期せぬエラーが発生しました: ${errorMessage}`, commenter);
    }
  }

  private buildPlanningPrompt(
    basePrompt: string,
    issue: IssueDetails,
    commentsSummary: string,
    requester: string
  ): string {
    const labels = issue.labels.map(l => l.name).join(', ') || 'なし';

    const maxBodyLength = 4000; // トークン数に応じて調整
    const truncatedBody = issue.body && issue.body.length > maxBodyLength
        ? issue.body.substring(0, maxBodyLength) + "\n... (本文は長いため一部省略されました)\n"
        : (issue.body || '本文なし');

    const maxCommentsSummaryLength = 3000; // トークン数に応じて調整
    const truncatedComments = commentsSummary.length > maxCommentsSummaryLength
        ? commentsSummary.substring(0, maxCommentsSummaryLength) + "\n... (コメントは長いため一部省略されました)\n"
        : (commentsSummary || 'まだコメントはありません。');

    return `
${basePrompt}

## 対象Issue情報
Issue URL: ${issue.html_url}
Issue番号: #${issue.number}
タイトル: ${issue.title}
作成者: @${issue.user?.login || 'unknown'}
状態: ${issue.state}
ラベル: [${labels}]

本文:
${truncatedBody}

既存のコメントの要約 (関連性の高いものを抜粋、古いものから順):
${truncatedComments}

## プランニング指示
1.  このIssueを完了するために必要と思われる主要なタスクを3～5個に分割してください。
2.  各タスクについて、その目的と具体的な作業内容の概要を記述してください。タスクは具体的で実行可能なものにしてください。
3.  Issueの内容や目的が不明確な場合、または計画を進める上で確認が必要な事項があれば、明確な質問形式でリストアップしてください。
4.  出力はMarkdown形式で、見出し、リスト、太字などを効果的に使用し、読みやすく整形してください。
5.  プランニングのリクエスト者は @${requester} です。

上記に基づいて、Issue #${issue.number}「${issue.title}」のプランニング提案を作成してください。
`;
  }

  private async postPlanningMessage(
    installationId: number,
    owner: string,
    repo: string,
    issueNumber: number,
    message: string,
    commenter: string,
    personaName?: string // オプションで人格名もエラーメッセージに含める
  ): Promise<void> {
    const personaInfo = personaName ? ` (使用人格: ${personaName})` : '';
    const fullMessage = `プランニングAIより (リクエスト者: @${commenter}${personaInfo}):\n${message}`;
    try {
      await this.githubService.createIssueComment(installationId, owner, repo, issueNumber, fullMessage);
    } catch (e) {
      console.error("プランニングメッセージの投稿に失敗:", e);
    }
  }
}