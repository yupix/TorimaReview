import { ReviewService } from "../services/review_service";
import { config } from "../config";
// WebhookPayloadsの型をインポート (例)
// import { IssueCommentCreatedEvent } from '@octokit/webhooks-types';

// issue_comment.created イベントのペイロード型 (簡易版)
interface IssueCommentPayload {
	action: string;
	issue: {
		number: number;
		pull_request?: {
			url: string;
		};
	};
	comment: {
		body: string;
		user: {
			login: string;
		};
	};
	repository: {
		name: string;
		owner: {
			login: string;
		};
	};
	installation?: {
		id: number;
	};
	sender: {
		type: string;
		login: string; // Botかどうかの判定に利用
	};
}

export class ReviewController {
	constructor(private reviewService: ReviewService) {}

	// `payload`の型は `@octokit/webhooks-types` から適切なものを利用することを推奨
	async handleIssueComment(payload: IssueCommentPayload): Promise<void> {
		console.log(
			`Handling issue_comment event: action=${payload.action}, PR?=${!!payload.issue.pull_request}`,
		);

		if (payload.action !== "created") {
			console.log('Action is not "created", skipping.');
			return;
		}

		if (!payload.issue.pull_request) {
			console.log("Comment is not on a Pull Request, skipping.");
			return;
		}

		// Botによるコメントの場合は無視 (無限ループ防止)
		// App名に `[bot]` が含まれることや、sender.login が GitHub App のスラッグと一致するかで判定
		// config.github.appId などから App のスラッグを導出できるとより確実
		if (
			payload.sender.type === "Bot" &&
			payload.sender.login.endsWith("[bot]")
		) {
			console.log("Comment from a bot (likely self), skipping.");
			return;
		}

		const commentBody = payload.comment.body.trim();
		const reviewCommand = config.github.reviewCommand;

		if (commentBody.startsWith(reviewCommand)) {
			const installationId = payload.installation?.id;
			if (!installationId) {
				console.error("Installation ID not found in payload.");
				return;
			}

			const owner = payload.repository.owner.login;
			const repo = payload.repository.name;
			const prNumber = payload.issue.number;
			const commenter = payload.comment.user.login;

			const commandParts = commentBody.split(/\s+/);
			const requestedPersona =
				commandParts.length > 1 ? commandParts[1] : undefined;

			console.log(
				`Review command "${reviewCommand}" detected. PR: ${owner}/${repo}#${prNumber}, Requester: @${commenter}, Persona hint: ${requestedPersona}`,
			);

			// レビュー処理は非同期で実行 (Webhookは早く応答を返す)
			this.reviewService
				.processReviewRequest(
					installationId,
					owner,
					repo,
					prNumber,
					commenter,
					requestedPersona,
				)
				.catch((error) => {
					console.error(
						"Error during review processing (unhandled in controller):",
						error,
					);
					// ここでPRに最終エラー通知を行うことも検討
				});
		} else {
			console.log(`Comment does not start with "${reviewCommand}", skipping.`);
		}
	}
}
