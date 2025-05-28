import { Octokit } from "@octokit/rest";
import { createAppAuth, InstallationAuthOptions } from "@octokit/auth-app"; // 型もインポート

export interface PullRequestDetails {
	title: string;
	body: string | null;
	html_url: string;
	head: { ref: string };
	base: { ref: string };
	user: { login: string } | null;
}

export interface Comment {
	user: { login: string } | null;
	body?: string;
	created_at: string;
}

export class GitHubService {
	private appId: string;
	private privateKey: string;

	constructor(appId: string, privateKey: string) {
		this.appId = appId;
		this.privateKey = privateKey;
	}

	private async getOctokit(installationId: number): Promise<Octokit> {
		const authOptions: InstallationAuthOptions = {
			// 型を明示
			appId: this.appId,
			privateKey: this.privateKey,
			installationId,
			type: "installation",
		};
		return new Octokit({
			authStrategy: createAppAuth,
			auth: authOptions,
		});
	}

	async getPullRequestDetails(
		installationId: number,
		owner: string,
		repo: string,
		pullNumber: number,
	): Promise<PullRequestDetails | null> {
		try {
			const octokit = await this.getOctokit(installationId);
			const { data } = await octokit.pulls.get({
				owner,
				repo,
				pull_number: pullNumber,
			});
			return data as PullRequestDetails; // 必要に応じて型アサーション
		} catch (error) {
			console.error(`Error fetching PR details for #${pullNumber}:`, error);
			return null;
		}
	}

	async getPullRequestDiff(
		installationId: number,
		owner: string,
		repo: string,
		pullNumber: number,
	): Promise<string | null> {
		try {
			const octokit = await this.getOctokit(installationId);
			const response = await octokit.pulls.get({
				owner,
				repo,
				pull_number: pullNumber,
				mediaType: { format: "diff" },
			});
			return response.data as unknown as string;
		} catch (error) {
			console.error(`Error fetching PR diff for #${pullNumber}:`, error);
			return null;
		}
	}

	async listReviewComments(
		installationId: number,
		owner: string,
		repo: string,
		pullNumber: number,
	): Promise<Comment[]> {
		try {
			const octokit = await this.getOctokit(installationId);
			const { data } = await octokit.pulls.listReviewComments({
				owner,
				repo,
				pull_number: pullNumber,
			});
			return data as Comment[]; // Octokitの型が使えるならそれがベスト
		} catch (error) {
			console.error(
				`Error listing review comments for PR #${pullNumber}:`,
				error,
			);
			return [];
		}
	}

	async createIssueComment(
		installationId: number,
		owner: string,
		repo: string,
		issueNumber: number,
		body: string,
	): Promise<void> {
		try {
			const octokit = await this.getOctokit(installationId);
			await octokit.issues.createComment({
				owner,
				repo,
				issue_number: issueNumber,
				body,
			});
			console.log(`Comment posted to ${owner}/${repo}#${issueNumber}`);
		} catch (error) {
			console.error(
				`Error creating comment on ${owner}/${repo}#${issueNumber}:`,
				error,
			);
			throw error; // エラーを呼び出し元に伝える
		}
	}
}
