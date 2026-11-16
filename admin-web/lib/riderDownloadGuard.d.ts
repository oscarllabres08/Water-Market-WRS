export function isRiderApkPath(pathname: string): boolean;

export function riderTicketFrom(requestUrl: string, cookieHeader?: string): string;

export function riderDownloadCookie(token: string): string;

export function riderTicketValid(token: string): Promise<boolean>;