import { getMailServerConfig, getEmailDomain } from "@/lib/config";

export type DavConfig = {
  serverUrl: string;
  principalUrl: string;
  username: string;
  password: string;
};

export async function getDavConfig(email: string, password: string): Promise<DavConfig> {
  const domain = getEmailDomain(email);
  const mailConfig = await getMailServerConfig(email);

  // cPanel/CardDAV/CalDAV typically runs on port 2080 (HTTPS) or 2079 (HTTP)
  const useHttps = process.env.DAV_SECURE !== "false";
  const davPort = process.env.DAV_PORT || "2080";
  const davHost = process.env.DAV_HOST?.trim() || mailConfig.imapHost;
  const scheme = useHttps ? "https" : "http";

  const serverUrl = `${scheme}://${davHost}:${davPort}`;
  const principalUrl = `${serverUrl}/.well-known/caldav`;

  return {
    serverUrl,
    principalUrl,
    username: email,
    password
  };
}

export function getAddressBookUrl(config: DavConfig): string {
  const email = config.username;
  return `${config.serverUrl}/addressbooks/${email}/addressbook`;
}

export function getCalendarUrl(config: DavConfig): string {
  const email = config.username;
  return `${config.serverUrl}/calendars/${email}/calendar`;
}
