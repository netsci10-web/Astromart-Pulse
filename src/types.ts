export interface MarketPost {
  uid: string;
  category: '판매' | '구입' | '공지' | string;
  title: string;
  commentCount: number;
  author: string;
  dateText: string;
  votes: number;
  views: number;
  url: string;
  isNotice: boolean;
  discoveredAt: string;
  isSimulated?: boolean;
}

export interface NotificationLogItem {
  id: string;
  uid: string;
  category: string;
  title: string;
  author: string;
  url: string;
  timestamp: string;
  matchedKeyword?: string;
  read: boolean;
}

export interface SessionStatus {
  isLoggedIn: boolean;
  username: string;
  lastVerifiedAt: string | null;
  keepAlive: boolean;
  loginMode: 'none' | 'credentials' | 'cookie' | 'webview';
  hasCookie?: boolean;
}

export type PollingIntervalSec = 30 | 60 | 300 | 600;

export interface MarketStateResponse {
  posts: MarketPost[];
  notifications: NotificationLogItem[];
  intervalSec: PollingIntervalSec;
  monitoringEnabled: boolean;
  keywords: string[];
  notifyAllNewPosts: boolean;
  categoryFilter: '전체' | '판매' | '구입';
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  lastPollError: string | null;
  session: SessionStatus;
}
