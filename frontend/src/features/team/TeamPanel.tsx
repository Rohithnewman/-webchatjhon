import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, UserX } from "lucide-react";
import { useEffect, useState } from "react";

import { useMe } from "../../entities/me/api";
import { workspaceApi } from "../../entities/workspace/api";
import { Badge, Button, Field, Input, LoadingState, Panel, Select, useToast } from "../../shared/ui";

interface Props {
  /** The signed-in user, so the panel can stop them editing themselves. */
  currentUserId: string | null;
}

export function TeamPanel({ currentUserId }: Props) {
  const toast = useToast();
  const client = useQueryClient();
  const myUserId = currentUserId;
  const { can } = useMe();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("member");

  const profile = useQuery({ queryKey: ["workspace"], queryFn: workspaceApi.profile });
  const members = useQuery({ queryKey: ["members"], queryFn: workspaceApi.members });
  const roles = useQuery({ queryKey: ["roles"], queryFn: workspaceApi.roles });
  const canManage = can("members:manage");
  const roleOptions = roles.data ?? [];

  // Keep the "add member" role selector pointed at a role that still exists
  // once the roles list has loaded (defaults to "member" until then).
  useEffect(() => {
    if (roleOptions.length > 0 && !roleOptions.some((r) => r.name === role)) {
      setRole(roleOptions.find((r) => r.name === "member")?.name ?? roleOptions[0].name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleOptions.length]);

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["members"] });
    void client.invalidateQueries({ queryKey: ["roles"] });
  };
  const fail = (err: unknown) => toast.error(err instanceof Error ? err.message : "Request failed");

  const add = useMutation({
    mutationFn: () => workspaceApi.addMember({ email, full_name: fullName, password, role }),
    onSuccess: () => {
      setEmail(""); setFullName(""); setPassword("");
      refresh();
      toast.success("Member added. They can log in with the password you set.");
    },
    onError: fail,
  });
  const changeRole = useMutation({
    mutationFn: (input: { userId: string; role: string }) => workspaceApi.changeRole(input.userId, input.role),
    onSuccess: () => { refresh(); toast.success("Role updated"); },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (userId: string) => workspaceApi.removeMember(userId),
    onSuccess: () => { refresh(); toast.success("Member removed"); },
    onError: fail,
  });

  if (profile.isLoading || members.isLoading) return <LoadingState label="Loading team" />;

  return (
    <div className="settings-grid">
      <Panel>
        <Panel.Header title="Add a team member" meta={profile.data ? `${profile.data.organization_name} · ${profile.data.name}` : undefined} />
        <Panel.Body>
          {canManage ? (
            <form className="form-stack" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
              <Field label="Email"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
              <Field label="Full name"><Input required value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
              <Field label="Temporary password (min 8 chars)">
                <Input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
              </Field>
              <Field label="Role">
                <Select value={role} onChange={(e) => setRole(e.target.value)}>
                  {roleOptions.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
                </Select>
              </Field>
              <p className="form-hint">System roles — owner: everything · admin: manage members and settings · member: build and reply · viewer: read only — plus any custom role this organisation has defined (Settings → Roles).</p>
              <Button type="submit" variant="primary" icon={<UserPlus size={15} />} loading={add.isPending}>Add member</Button>
            </form>
          ) : (
            <p className="form-hint">Your role does not include Manage members. Your role: <strong>{profile.data?.your_role}</strong>.</p>
          )}
        </Panel.Body>
      </Panel>

      <Panel>
        <Panel.Header title={`Members (${members.data?.length ?? 0})`} />
        <Panel.Body flush>
          {(members.data ?? []).map((member) => {
            const isMe = member.user_id === myUserId;
            return (
              <div key={member.user_id} className="credential-row">
                <div>
                  <strong style={{ textTransform: "none" }}>{member.full_name}</strong> {isMe && <Badge tone="brand">you</Badge>}
                  <span className="credential-meta">{member.email} · joined {new Date(member.joined_at).toLocaleDateString()}</span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {canManage && !isMe ? (
                    <>
                      <Select value={member.role} onChange={(e) => changeRole.mutate({ userId: member.user_id, role: e.target.value })} aria-label={`Role for ${member.email}`}>
                        {roleOptions.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
                      </Select>
                      <Button size="sm" variant="ghost" icon={<UserX size={14} />} onClick={() => { if (window.confirm(`Remove ${member.email} from this workspace?`)) remove.mutate(member.user_id); }}>
                        Remove
                      </Button>
                    </>
                  ) : (
                    <Badge>{member.role}</Badge>
                  )}
                </div>
              </div>
            );
          })}
        </Panel.Body>
      </Panel>
    </div>
  );
}
