import { Router } from "express";
import { Webhooks, createNodeMiddleware } from "@octokit/webhooks";
import { ReviewController } from "./controllers/review_controller";
import { config } from "./config";
// import { EmitterWebhookEventName } from '@octokit/webhooks/dist-types/types'; // イベント名の型

export function createWebhookRouter(
	reviewController: ReviewController,
): Router {
	const router = Router();

	const webhooks = new Webhooks({
		secret: config.github.webhookSecret,
	});

	webhooks.on("issue_comment.created", async ({ payload }) => {
		// payload の型を適切にキャストするか、any のまま扱う
		// @octokit/webhooks-types を使うと、より厳密な型チェックが可能
		// e.g. payload as IssueCommentCreatedEvent
		await reviewController.handleIssueComment(payload as any); // 簡易的にany
	});

	webhooks.onError((error) => {
		console.error(`Webhook Error: ${error.errors.join(", ")}`);
		// error.event を参照してどのイベントでエラーが発生したか確認可能
		if ("event" in error && error.event) {
			console.error("Error in event:", error.event.name);
		}
	});

	router.use(createNodeMiddleware(webhooks, { path: "/" })); // ルーターのベースパスで受ける

	return router;
}
