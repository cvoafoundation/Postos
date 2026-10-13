export interface Channel {
  id: string;
  name: string;
  description: string;
  scope: string;
  state: string | null;
  post_id: string | null;
  private: boolean;
  read_only: boolean;
  archived: boolean;
  unread: number;
  can_write: boolean;
  can_manage: boolean;
}
export interface Person {
  id: string;
  full_name: string;
}
export interface Attachment {
  path: string;
  name: string;
  size: number;
}
export interface Message {
  id: string;
  channel_id: string;
  author_id: string;
  author_name: string;
  parent_id: string | null;
  body: string;
  attachments: Attachment[];
  mentions: string[];
  pinned: boolean;
  deleted_at: string | null;
  created_at: string;
  edited_at: string | null;
}
export interface Reaction {
  message_id: string;
  user_id: string;
  emoji: string;
}
export interface Task {
  id: string;
  channel_id: string;
  title: string;
  outcome: string;
  measure: string;
  owner_id: string;
  created_by: string;
  due_date: string;
  status: string;
  priority: boolean;
  cycle_start: string;
}
export interface Activity {
  id: string;
  owner_id: string;
  activity_date: string;
  activity_type: string;
  contact: string;
  organization: string;
  state: string;
  district: string;
  topic: string;
  takeaway: string;
  opportunity: string;
  follow_up_task_id: string | null;
}
export interface Report {
  id: string;
  owner_id: string;
  period: string;
  completed: string;
  next_action: string;
  blocked: string;
}
export interface Workspace {
  scope: string;
  state: string | null;
  post_id: string | null;
  label: string;
  can_manage: boolean;
}
export const STATUS: Record<string, string> = {
  on_track: "On track",
  at_risk: "At risk",
  blocked: "Blocked",
  complete: "Complete",
};
