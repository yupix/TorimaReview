// src/webhook_router.ts
import { Router } from 'express';
import { Webhooks, createNodeMiddleware } from '@octokit/webhooks';
import { ReviewController } from './controllers/review_controller';
import { PlanningController } from './controllers/planning_controller'; // PlanningControllerをインポート
import { config } from './config';
// import { IssueCommentCreatedEvent } from '@octokit/webhooks-types'; // 厳密な型定義を使用する場合

// Webhookペイロードの型定義 (簡易版、コントローラーと共通化も検討)
interface WebhookPayload {
  action?: string; // イベントによって存在しない場合もある
  issue?: {
    number: number;
    pull_request?: { url: string; };
  };
  comment?: {
    body: string;
    user: { login: string; };
  };
  repository?: {
    name: string;
    owner: { login: string; };
  };
  installation?: { id: number; };
  sender?: { type: string; login: string; };
  // 他のイベントで必要なプロパティもここに追加するか、イベントごとに型を定義
}


export function createWebhookRouter(
  reviewController: ReviewController,
  planningController: PlanningController // PlanningController を引数に追加
): Router {
  const router = Router();

  const webhooks = new Webhooks({
    secret: config.github.webhookSecret,
  });

  // issue_comment.created イベントのハンドリング
  webhooks.on('issue_comment.created', async ({ id, name, payload }) => {
    const typedPayload = payload as WebhookPayload; // 型アサーション (より厳密な型を推奨)
    const commentBody = typedPayload.comment?.body?.trim() || '';

    // コメントがPRに対するものかIssueに対するものかで処理を振り分け
    if (typedPayload.issue?.pull_request) {
      // PRへのコメントの場合
      if (commentBody.startsWith(config.github.reviewCommand)) {
        console.log(`[WebhookRouter] Review command detected for PR comment. Event ID: ${id}`);
        // ReviewControllerのhandleIssueCommentはPRコメントを処理することを期待
        await reviewController.handleIssueComment(typedPayload as any); // ReviewControllerが期待する型にキャスト
      }
    } else if (typedPayload.issue) {
      // Issueへのコメントの場合 (pull_requestプロパティがない)
      if (commentBody.startsWith(config.github.planCommand)) {
        console.log(`[WebhookRouter] Plan command detected for Issue comment. Event ID: ${id}`);
        await planningController.handleIssueComment(typedPayload as any); // PlanningControllerが期待する型にキャスト
      }
    } else {
      console.warn(`[WebhookRouter] Received issue_comment.created event for an unknown entity (not PR, not Issue). Event ID: ${id}`);
    }
  });

  // 他のイベント (例: pull_request.opened) もここで購読可能
  // webhooks.on('pull_request.opened', async ({ id, name, payload }) => {
  //   console.log(`[WebhookRouter] Pull request opened. Event ID: ${id}`);
  //   // ここでレビューを自動開始するなどの処理
  // });

  webhooks.onError((error) => {
    // errorオブジェクトが持つプロパティを確認して、より詳細なエラーログを出力
    const eventName = ('event' in error && error.event && typeof error.event === 'object' && 'name' in error.event) ? error.event.name : 'N/A';
    console.error(`[WebhookRouter] Webhook Error: ${error.errors.join('')} (Event: ${eventName})`);
    if (error.errors) {
        console.error(error);
    }
  });
  
  // Webhookミドルウェアをルーターに適用
  // path: '/' は、このルーターがマウントされるベースパスからの相対パス
  router.use(createNodeMiddleware(webhooks, { path: '/' }));

  return router;
}