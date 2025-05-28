// src/services/github_service.ts
import { Octokit } from '@octokit/rest';
import { createAppAuth, InstallationAuthOptions } from '@octokit/auth-app';

// PullRequestDetails は既存のレビュー機能で使われることを想定し、any のままとしています。
// 必要に応じてより厳密な型定義が可能です。
export interface PullRequestDetails {
  title: string;
  body: string | null;
  html_url: string;
  head: { ref: string };
  base: { ref: string };
  user: { login: string } | null;
  // 他にも多くのプロパティが存在します
}

// Issue に特化した詳細情報インターフェース
export interface IssueDetails {
  title: string;
  body: string | null;
  html_url: string;
  number: number;
  labels: { name?: string }[];
  user: { login: string } | null;
  state: string;
  // 他にも多くのプロパティが存在します
}

// Issueコメント用のインターフェース
export interface IssueComment {
  id: number;
  user: { login: string } | null;
  body?: string;
  created_at: string;
  updated_at: string;
  // 他にも多くのプロパティが存在します
}

// PRのレビューコメント用インターフェース (既存のレビュー機能で使われることを想定)
export interface ReviewComment {
  user: { login: string } | null;
  body?: string;
  created_at: string;
  // 他にも多くのプロパティが存在します
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
      appId: this.appId,
      privateKey: this.privateKey,
      installationId,
      type: 'installation',
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
    pullNumber: number
  ): Promise<PullRequestDetails | null> { // 以前は any | null でしたが、より具体的に
    try {
      const octokit = await this.getOctokit(installationId);
      const { data } = await octokit.pulls.get({
        owner,
        repo,
        pull_number: pullNumber,
      });
      return data as PullRequestDetails;
    } catch (error) {
      console.error(`Error fetching PR details for #${pullNumber}:`, error);
      return null;
    }
  }

  async getPullRequestDiff(
    installationId: number,
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<string | null> {
    try {
      const octokit = await this.getOctokit(installationId);
      const response = await octokit.pulls.get({
        owner,
        repo,
        pull_number: pullNumber,
        mediaType: { format: 'diff' },
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
    pullNumber: number
  ): Promise<ReviewComment[]> { // 以前は any[] でしたが、より具体的に
    try {
      const octokit = await this.getOctokit(installationId);
      const { data } = await octokit.pulls.listReviewComments({
        owner,
        repo,
        pull_number: pullNumber,
      });
      return data as ReviewComment[];
    } catch (error) {
      console.error(`Error listing review comments for PR #${pullNumber}:`, error);
      return [];
    }
  }

  // --- Issue関連の新しいメソッド ---
  async getIssueDetails(
    installationId: number,
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<IssueDetails | null> {
    try {
      const octokit = await this.getOctokit(installationId);
      const { data } = await octokit.issues.get({
        owner,
        repo,
        issue_number: issueNumber,
      });
      const labels = (data.labels || []).map(label =>
        typeof label === 'string' ? { name: label } : { name: label.name }
      );
      return { ...data, labels } as IssueDetails;
    } catch (error) {
      console.error(`Error fetching issue details for #${issueNumber}:`, error);
      return null;
    }
  }

  async listIssueComments(
    installationId: number,
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<IssueComment[]> {
    try {
      const octokit = await this.getOctokit(installationId);
      const { data } = await octokit.issues.listComments({
        owner,
        repo,
        issue_number: issueNumber,
      });
      return data as IssueComment[];
    } catch (error) {
      console.error(`Error listing comments for issue #${issueNumber}:`, error);
      return [];
    }
  }

  // コメント投稿 (PR/Issue兼用)
  async createIssueComment(
    installationId: number,
    owner: string,
    repo: string,
    issueNumber: number, // PR番号またはIssue番号
    body: string
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
      console.error(`Error creating comment on ${owner}/${repo}#${issueNumber}:`, error);
      throw error;
    }
  }
}