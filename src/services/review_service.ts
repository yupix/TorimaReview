import { GitHubService, PullRequestDetails, Comment } from "./github_service";
import { GeminiService } from "./gemini_service";
import { PersonaService } from "./persona_service";
import { config } from "../config"; // デフォルト人格名などにアクセスするため

export class ReviewService {
	constructor(
		private githubService: GitHubService,
		private geminiService: GeminiService,
		private personaService: PersonaService,
	) {}

	async processReviewRequest(
		installationId: number,
		owner: string,
		repo: string,
		prNumber: number,
		commenter: string,
		requestedPersonaName?: string,
	): Promise<void> {
		console.log(
			`Processing review for ${owner}/${repo}#${prNumber} by @${commenter}. Requested persona: ${requestedPersonaName}`,
		);

		try {
			const prDetails: PullRequestDetails | null =
				await this.githubService.getPullRequestDetails(
					installationId,
					owner,
					repo,
					prNumber,
				);
			if (!prDetails) {
				await this.postErrorMessage(
					installationId,
					owner,
					repo,
					prNumber,
					`PR #${prNumber} の詳細が取得できませんでした。`,
					commenter,
				);
				return;
			}

			const diff: string | null = await this.githubService.getPullRequestDiff(
				installationId,
				owner,
				repo,
				prNumber,
			);
			if (!diff) {
				await this.postErrorMessage(
					installationId,
					owner,
					repo,
					prNumber,
					`PR #${prNumber} の差分が取得できませんでした。`,
					commenter,
				);
				return;
			}

			const existingComments: Comment[] =
				await this.githubService.listReviewComments(
					installationId,
					owner,
					repo,
					prNumber,
				);
			const commentsText = existingComments
				.map(
					(comment) =>
						`User @${comment.user?.login || "unknown"} (${new Date(comment.created_at).toLocaleString()}):\n${comment.body}`,
				)
				.join("\n\n---\n\n");

			const personaName = requestedPersonaName || config.persona.defaultPersona;
			const basePersonaPrompt = this.personaService.getPersonaPrompt(
				personaName,
				config.persona.defaultPersona,
			);

			const finalPrompt = this.buildReviewPrompt(
				basePersonaPrompt,
				prDetails,
				diff,
				commentsText,
				commenter,
				owner,
				repo,
				prNumber,
			);

			console.log(
				`[${new Date().toISOString()}] Geminiにレビューをリクエスト中... Persona: ${personaName}`,
			);
			const reviewContent =
				await this.geminiService.generateReview(finalPrompt);

			if (
				reviewContent &&
				reviewContent.trim() !== "" &&
				!reviewContent.toLowerCase().includes("error: gemini api")
			) {
				await this.githubService.createIssueComment(
					installationId,
					owner,
					repo,
					prNumber,
					reviewContent,
				);
				console.log(`レビューコメントを PR #${prNumber} に投稿しました。`);
			} else {
				const message =
					reviewContent &&
					reviewContent.toLowerCase().includes("error: gemini api")
						? `Gemini APIエラーが発生しました: ${reviewContent}`
						: `Geminiから有効なレビューが生成されませんでした。`;
				await this.postErrorMessage(
					installationId,
					owner,
					repo,
					prNumber,
					message,
					commenter,
					personaName,
				);
				console.log(message);
			}
		} catch (error) {
			console.error("レビュー処理中に予期せぬエラー:", error);
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			await this.postErrorMessage(
				installationId,
				owner,
				repo,
				prNumber,
				`レビュー処理中に予期せぬエラーが発生しました: ${errorMessage}`,
				commenter,
			);
		}
	}

	private buildReviewPrompt(
		basePrompt: string,
		prDetails: PullRequestDetails,
		diff: string,
		existingComments: string,
		commenter: string,
		owner: string,
		repo: string,
		prNumber: number,
	): string {
		// トークン数削減のため、長すぎるdiffやコメントは切り詰めることを検討
		const maxDiffLength = 15000; // 例: 15000文字 (Geminiのトークン制限に注意)
		const truncatedDiff =
			diff.length > maxDiffLength
				? diff.substring(0, maxDiffLength) + "\n... (diff truncated)\n"
				: diff;

		const maxCommentsLength = 5000; // 例
		const truncatedComments =
			existingComments.length > maxCommentsLength
				? existingComments.substring(0, maxCommentsLength) +
					"\n... (comments truncated)\n"
				: existingComments;

		return `
${basePrompt}

## レビュー対象のPull Request情報
リクエスト者: @${commenter}
リポジトリ: ${owner}/${repo}
PR番号: #${prNumber}
URL: ${prDetails.html_url}
タイトル: ${prDetails.title}
ブランチ: ${prDetails.head.ref} -> ${prDetails.base.ref}
コミッター: @${prDetails.user?.login || "unknown"}
説明:
${prDetails.body || "なし"}

## 既存のレビューコメント (このPRのファイルに対するコメント):
${truncatedComments || "まだコメントはありません。"}

## 変更差分 (diff):
\`\`\`diff
${truncatedDiff}
\`\`\`

上記Pull Requestの内容、既存のコメント、差分を踏まえてレビューし、具体的な改善点や懸念点を指摘してください。
レビューコメントはMarkdown形式で記述し、重要な指摘は太字にするなど、読みやすく工夫してください。
`;
	}

	private async postErrorMessage(
		installationId: number,
		owner: string,
		repo: string,
		prNumber: number,
		message: string,
		commenter: string,
		personaName?: string,
	): Promise<void> {
		const fullMessage = `レビュー担当より (リクエスト者: @${commenter}${personaName ? `, 人格: ${personaName}` : ""}):\n${message}`;
		try {
			await this.githubService.createIssueComment(
				installationId,
				owner,
				repo,
				prNumber,
				fullMessage,
			);
		} catch (e) {
			console.error("エラーメッセージの投稿に失敗:", e);
		}
	}
}
