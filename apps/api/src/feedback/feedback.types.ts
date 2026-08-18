export type FeedbackPost = {
  id: string;
  name: string;
  message: string;
  createdAt: string;
};

export type CreateFeedbackInput = {
  name?: unknown;
  message?: unknown;
};

export type FeedbackListResponse = {
  posts: FeedbackPost[];
};
