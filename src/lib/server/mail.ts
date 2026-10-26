import { rpc } from "@/lib/rpc";

export type GcPerson = {
  userId: string;
  username: string;
  letter: string;
  preview: string;
  at: string;
  unread: boolean;
};

export type GcLetter = { id: string; mine: boolean; body: string; at: string };

export const listGc = rpc<{ me: string; people: GcPerson[] }>("listGc");
export const gcThread = rpc<{ userId: string; username: string; letter: string; letters: GcLetter[] }>("gcThread");
export const sendMail = rpc<{ id: string }>("sendMail");
