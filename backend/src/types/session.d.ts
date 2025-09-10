import 'express-session';

declare module 'express-session' {
  interface SessionData {
    authenticated?: boolean;
    realname?: string;
    username?: string;
    email?: string;
    csrf_token?: string;
    auth_token?: string;
  }
} 