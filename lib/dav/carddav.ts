import type { DAVAddressBook, DAVVCard } from "tsdav";
import { DAVClient } from "tsdav";
import { getDavConfig, type DavConfig } from "./config";

export type Contact = {
  uid: string;
  fn: string;
  email: string;
  phone?: string;
  organization?: string;
  title?: string;
  note?: string;
  etag?: string;
  url?: string;
};

function createClient(config: DavConfig): DAVClient {
  return new DAVClient({
    serverUrl: config.serverUrl,
    credentials: {
      username: config.username,
      password: config.password
    },
    authMethod: "Basic",
    defaultAccountType: "carddav"
  });
}

function parseVCard(vcard: string): Partial<Contact> {
  const contact: Partial<Contact> = {};

  const get = (key: string) => {
    const match = vcard.match(new RegExp(`^${key}[;:](.+)$`, "mi"));
    return match?.[1]?.trim().replace(/\\n/g, "\n").replace(/\\,/g, ",");
  };

  contact.fn = get("FN") || "";
  contact.email = get("EMAIL") || get("EMAIL;TYPE=INTERNET") || get("EMAIL;TYPE=WORK") || "";

  if (!contact.email) {
    const emailMatch = vcard.match(/^EMAIL[^:]*:(.+)$/mi);
    contact.email = emailMatch?.[1]?.trim() || "";
  }

  contact.phone = get("TEL") || get("TEL;TYPE=CELL") || get("TEL;TYPE=WORK") || undefined;
  contact.organization = get("ORG")?.replace(/;/g, ", ") || undefined;
  contact.title = get("TITLE") || undefined;
  contact.note = get("NOTE") || undefined;

  return contact;
}

function buildVCard(contact: Partial<Contact>, uid?: string): string {
  const uidStr = uid || contact.email || crypto.randomUUID();
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `UID:${uidStr}`,
    `FN:${contact.fn || ""}`,
    `N:${(contact.fn || "").split(" ").reverse().join(";")};;;`,
  ];

  if (contact.email) {
    lines.push(`EMAIL;TYPE=INTERNET:${contact.email}`);
  }
  if (contact.phone) {
    lines.push(`TEL;TYPE=CELL:${contact.phone}`);
  }
  if (contact.organization) {
    lines.push(`ORG:${contact.organization.replace(/,/g, "\\,")}`);
  }
  if (contact.title) {
    lines.push(`TITLE:${contact.title}`);
  }
  if (contact.note) {
    lines.push(`NOTE:${contact.note.replace(/\n/g, "\\n")}`);
  }

  lines.push("END:VCARD");
  return lines.join("\r\n");
}

async function getAddressBook(client: DAVClient): Promise<DAVAddressBook> {
  const books = await client.fetchAddressBooks();
  if (!books.length) throw new Error("No address books found");
  return books[0];
}

export async function listContacts(email: string, password: string): Promise<Contact[]> {
  const config = await getDavConfig(email, password);
  const client = createClient(config);

  try {
    const addressBook = await getAddressBook(client);
    const vcards = await client.fetchVCards({ addressBook });

    return vcards
      .map((vcard: DAVVCard) => {
        const parsed = parseVCard(vcard.data || "");
        const uidFromUrl = vcard.url ? vcard.url.split("/").filter(Boolean).pop()?.replace(/\.vcf$/i, "") : "";
        return {
          uid: parsed.email || uidFromUrl || "",
          fn: parsed.fn || "Unknown",
          email: parsed.email || "",
          phone: parsed.phone,
          organization: parsed.organization,
          title: parsed.title,
          note: parsed.note,
          etag: vcard.etag || undefined,
          url: vcard.url || undefined
        };
      })
      .filter((c) => c.email || c.fn !== "Unknown")
      .sort((a, b) => a.fn.localeCompare(b.fn));
  } catch (error) {
    console.error("CardDAV list error:", error);
    return [];
  }
}

export async function createContact(
  email: string,
  password: string,
  contact: Partial<Contact>
): Promise<Contact | null> {
  const config = await getDavConfig(email, password);
  const client = createClient(config);
  const uid = contact.email || crypto.randomUUID();
  const vCardString = buildVCard(contact, uid);

  try {
    const addressBook = await getAddressBook(client);
    await client.createVCard({
      filename: `${uid}.vcf`,
      vCardString,
      addressBook
    });

    return {
      uid,
      fn: contact.fn || "",
      email: contact.email || "",
      phone: contact.phone,
      organization: contact.organization,
      title: contact.title,
      note: contact.note
    };
  } catch (error) {
    console.error("CardDAV create error:", error);
    return null;
  }
}

export async function updateContact(
  email: string,
  password: string,
  contact: Contact
): Promise<boolean> {
  const config = await getDavConfig(email, password);
  const client = createClient(config);
  const addressBook = await getAddressBook(client);
  const vCardString = buildVCard(contact, contact.uid);

  try {
    await client.updateVCard({
      vCard: {
        url: contact.url || `${addressBook.url}${contact.uid}.vcf`,
        etag: contact.etag || "",
        data: vCardString
      } as DAVVCard
    });
    return true;
  } catch (error) {
    console.error("CardDAV update error:", error);
    return false;
  }
}

export async function deleteContact(
  email: string,
  password: string,
  contact: Contact
): Promise<boolean> {
  const config = await getDavConfig(email, password);
  const client = createClient(config);
  const addressBook = await getAddressBook(client);

  try {
    await client.deleteVCard({
      vCard: {
        url: contact.url || `${addressBook.url}${contact.uid}.vcf`,
        etag: contact.etag || ""
      } as DAVVCard
    });
    return true;
  } catch (error) {
    console.error("CardDAV delete error:", error);
    return false;
  }
}
